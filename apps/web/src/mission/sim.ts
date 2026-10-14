// TADS-inspired inspection simulator. Original code written for this app; it is
// not imported from the TADS research repositories. Everything here is
// simulation: no flight control, no real telemetry, no hidden reference data.
//
// Pure functions over a plain-JSON state so a run is reproducible from its seed
// and can be persisted to IndexedDB as-is. Callers must not mutate state.
import type { Assessment } from '../api/contract';

export type ExplorePref = 'low' | 'medium' | 'high';
export type LinkState = 'connected' | 'lost';
export type DroneStatus = 'exploring' | 'returning' | 'landed' | 'holding';
export type CommandStatus = 'queued' | 'sent' | 'acknowledged' | 'expired' | 'failed';
export type CommandType = 'inspect_tile' | 'return_to_launch';

export interface Tile {
  tile_id: string;
  row: number;
  col: number;
  bbox: [number, number, number, number];
  center: [number, number];
  hazard_prior: number;
}

export interface MissionEvent {
  event_id: string;
  actor_id: string;
  tile_id: string;
  kind: 'water_observed' | 'dry_observed';
  event_at: string;
  received_at: string | null;
  mode: 'simulation';
  source: string;
}

export interface Command {
  command_id: string;
  type: CommandType;
  actor_id: string;
  target: string | null;
  created_at: string;
  expires_at: string;
  status: CommandStatus;
  acknowledged_at: string | null;
  review: 'needed' | 'dismissed' | 'reissued' | null;
}

export interface Telemetry {
  actor_id: string;
  tile_id: string;
  position: [number, number];
  battery: number;
  status: DroneStatus;
  position_reliable: boolean;
  telemetry_at: string;
  received_at: string;
}

export interface Drone {
  actor_id: string;
  tile_id: string;
  target: string | null;
  battery: number;
  status: DroneStatus;
  gnss_ok: boolean;
  hold_steps: number;
  seq: number;
  known: Record<string, MissionEvent>;
  pending_command: string | null;
}

export interface Station {
  received: Record<string, MissionEvent>;
  telemetry: Record<string, Telemetry>;
  commands: Command[];
  command_seq: number;
}

export interface SimConfig {
  seed: number;
  rows: number;
  cols: number;
  explore: ExplorePref;
  step_seconds: number;
  battery_per_step: number;
  low_battery: number;
  command_ttl_steps: number;
  sensor_accuracy: number;
  gossip_range: number;
  gnss_hold_steps: number;
}

export interface SimState {
  version: 1;
  mode: 'simulation';
  assessment_id: string;
  bounds: [number, number, number, number];
  prior_source: string;
  config: SimConfig;
  step: number;
  start_at: string;
  clock: string;
  rng: number;
  link: LinkState;
  link_lost_at: string | null;
  launch_tile: string;
  tiles: Tile[];
  // Synthetic scenario state used only to generate simulated observations.
  // It is never shown as evidence and never written to the assessment.
  scenario_flooded: Record<string, boolean>;
  drones: Drone[];
  station: Station;
  notes: string[];
}

export const DEFAULT_CONFIG: SimConfig = {
  seed: 2707,
  rows: 5,
  cols: 5,
  explore: 'medium',
  step_seconds: 60,
  battery_per_step: 4,
  low_battery: 25,
  command_ttl_steps: 3,
  sensor_accuracy: 0.9,
  gossip_range: 1,
  gnss_hold_steps: 2,
};

const EXPLORE_WEIGHT: Record<ExplorePref, number> = { low: 0.2, medium: 0.5, high: 0.9 };
const W_HAZARD = 1.0;
const W_NOVELTY = 0.6;
const W_SEPARATION = 0.3;
const W_DISTANCE = 0.4;
const MAX_BETA_STD = Math.sqrt(1 / 12); // std of Beta(1,1), the uninformed start

// mulberry32: tiny deterministic PRNG; state is a uint32 kept in SimState.
export function nextRandom(state: number): [number, number] {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

function addSeconds(iso: string, s: number) {
  return new Date(Date.parse(iso) + s * 1000).toISOString();
}

// ---- hazard prior from the cached assessment -------------------------------

type Ring = number[][];
function pointInRing([x, y]: [number, number], ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function polygonsOf(geometry: unknown): Ring[][] {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates as Ring[]];
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][];
  return [];
}
function inPolygon(p: [number, number], rings: Ring[]) {
  return rings.length > 0 && pointInRing(p, rings[0]) && !rings.slice(1).some((h) => pointInRing(p, h));
}

export function hazardPriors(a: Assessment, tiles: Omit<Tile, 'hazard_prior'>[]) {
  const floods = a.layers.flood.features.flatMap((f) => {
    const score = (f.properties as Record<string, unknown> | undefined)?.flood_score;
    return polygonsOf(f.geometry).map((rings) => ({ rings, score: typeof score === 'number' ? score : 0.7 }));
  });
  if (floods.length === 0) {
    return { priors: tiles.map(() => 0.5), source: 'uniform 0.5 (assessment has no candidate flood polygons)' };
  }
  const priors = tiles.map((t) => {
    const [w, s, e, n] = t.bbox;
    let hits = 0;
    let total = 0;
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) {
        const p: [number, number] = [w + ((i + 0.5) / 3) * (e - w), s + ((j + 0.5) / 3) * (n - s)];
        total++;
        const hit = floods.find((f) => inPolygon(p, f.rings));
        if (hit) hits += hit.score;
      }
    return round3(0.1 + 0.8 * (hits / total));
  });
  return { priors, source: `candidate flood polygons of ${a.assessment_id} (heuristic flood_score, not a probability)` };
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

// ---- setup --------------------------------------------------------------

export function boundsWithin(inner: number[], outer: number[]) {
  const [w, s, e, n] = inner;
  const [W, S, E, N] = outer;
  return w < e && s < n && w >= W && e <= E && s >= S && n <= N;
}

export function createSim(a: Assessment, bounds: [number, number, number, number], partial: Partial<SimConfig> = {}): SimState {
  const config = { ...DEFAULT_CONFIG, ...partial };
  if (!boundsWithin(bounds, a.bbox)) throw new Error('Inspection bounds must have positive area and lie inside the assessment AOI.');
  const [w, s, e, n] = bounds;
  const dx = (e - w) / config.cols;
  const dy = (n - s) / config.rows;
  const raw: Omit<Tile, 'hazard_prior'>[] = [];
  for (let r = 0; r < config.rows; r++)
    for (let c = 0; c < config.cols; c++) {
      const tb: [number, number, number, number] = [w + c * dx, s + r * dy, w + (c + 1) * dx, s + (r + 1) * dy];
      raw.push({ tile_id: `t${r}-${c}`, row: r, col: c, bbox: tb, center: [(tb[0] + tb[2]) / 2, (tb[1] + tb[3]) / 2] });
    }
  const { priors, source } = hazardPriors(a, raw);
  const tiles = raw.map((t, i) => ({ ...t, hazard_prior: priors[i] }));

  let rng = config.seed >>> 0;
  const scenario: Record<string, boolean> = {};
  for (const t of tiles) {
    let u: number;
    [u, rng] = nextRandom(rng);
    // The scenario deliberately disagrees with the prior on some tiles so the
    // trust estimate has something to learn.
    const p = 0.15 + 0.7 * t.hazard_prior;
    scenario[t.tile_id] = u < p;
  }
  const launch = `t0-${Math.floor(config.cols / 2)}`;
  const start = `${a.event_date}T06:00:00.000Z`;
  const drones: Drone[] = ['drone-1', 'drone-2'].map((id) => ({
    actor_id: id,
    tile_id: launch,
    target: null,
    battery: 100,
    status: 'exploring',
    gnss_ok: true,
    hold_steps: 0,
    seq: 0,
    known: {},
    pending_command: null,
  }));
  const state: SimState = {
    version: 1,
    mode: 'simulation',
    assessment_id: a.assessment_id,
    bounds,
    prior_source: source,
    config,
    step: 0,
    start_at: start,
    clock: start,
    rng,
    link: 'connected',
    link_lost_at: null,
    launch_tile: launch,
    tiles,
    scenario_flooded: scenario,
    drones,
    station: { received: {}, telemetry: {}, commands: [], command_seq: 0 },
    notes: [],
  };
  return syncTelemetry(state);
}

// ---- belief -----------------------------------------------------------------

export interface TileBelief {
  alpha: number;
  beta: number;
  mean: number;
  std: number;
  observations: number;
}

// Trust in the prior at each tile: Beta(1,1) start, +1 alpha when an observation
// agrees with the prior's side of 0.5, +1 beta when it disagrees. Computed from
// an ID-keyed event set, so delivering an event twice cannot change it.
export function beliefs(tiles: Tile[], events: Record<string, MissionEvent>): Record<string, TileBelief> {
  const out: Record<string, TileBelief> = {};
  const counts: Record<string, [number, number]> = {};
  const prior = Object.fromEntries(tiles.map((t) => [t.tile_id, t.hazard_prior]));
  for (const ev of Object.values(events)) {
    if (!(ev.tile_id in prior)) continue;
    const agrees = (prior[ev.tile_id] >= 0.5) === (ev.kind === 'water_observed');
    const c = (counts[ev.tile_id] ??= [0, 0]);
    c[agrees ? 0 : 1]++;
  }
  for (const t of tiles) {
    const [ag, dis] = counts[t.tile_id] ?? [0, 0];
    const alpha = 1 + ag;
    const beta = 1 + dis;
    const sum = alpha + beta;
    out[t.tile_id] = {
      alpha,
      beta,
      mean: alpha / sum,
      std: Math.sqrt((alpha * beta) / (sum * sum * (sum + 1))),
      observations: ag + dis,
    };
  }
  return out;
}

export function mergeEvents(into: Record<string, MissionEvent>, incoming: Iterable<MissionEvent>, receivedAt?: string) {
  const next = { ...into };
  let added = 0;
  for (const ev of incoming) {
    if (next[ev.event_id]) continue;
    next[ev.event_id] = receivedAt === undefined ? ev : { ...ev, received_at: receivedAt };
    added++;
  }
  return { events: next, added };
}

// ---- acquisition ---------------------------------------------------------------

export interface AcquisitionTerm {
  tile_id: string;
  hazard: number;
  uncertainty: number;
  novelty: number;
  separation: number;
  distance: number;
  score: number;
}

function tileDist(a: Tile, b: Tile) {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

export function acquisition(state: SimState, drone: Drone): AcquisitionTerm[] {
  const tileMap = Object.fromEntries(state.tiles.map((t) => [t.tile_id, t]));
  const here = tileMap[drone.tile_id];
  const b = beliefs(state.tiles, drone.known);
  const visits: Record<string, number> = {};
  for (const ev of Object.values(drone.known)) visits[ev.tile_id] = (visits[ev.tile_id] ?? 0) + 1;
  const others = state.drones.filter((d) => d.actor_id !== drone.actor_id).map((d) => tileMap[d.target ?? d.tile_id]);
  const span = Math.max(state.config.rows, state.config.cols);
  const wU = EXPLORE_WEIGHT[state.config.explore];
  return state.tiles.map((t) => {
    const uncertainty = b[t.tile_id].std / MAX_BETA_STD;
    const novelty = 1 / (1 + (visits[t.tile_id] ?? 0));
    const separation = others.length ? Math.min(1, Math.min(...others.map((o) => tileDist(o, t))) / 2) : 1;
    const distance = tileDist(here, t) / span;
    const score = W_HAZARD * t.hazard_prior + wU * uncertainty + W_NOVELTY * novelty + W_SEPARATION * separation - W_DISTANCE * distance;
    return { tile_id: t.tile_id, hazard: t.hazard_prior, uncertainty, novelty, separation, distance, score };
  });
}

function chooseTarget(state: SimState, drone: Drone): string {
  const terms = acquisition(state, drone).filter((t) => t.tile_id !== drone.tile_id || Object.keys(drone.known).length === 0);
  // Deterministic tie-break on tile ID; no randomness in selection itself.
  terms.sort((x, y) => y.score - x.score || x.tile_id.localeCompare(y.tile_id));
  return terms[0].tile_id;
}

function stepToward(state: SimState, from: string, to: string): string {
  const tileMap = Object.fromEntries(state.tiles.map((t) => [t.tile_id, t]));
  const a = tileMap[from];
  const b = tileMap[to];
  const r = a.row + Math.sign(b.row - a.row);
  const c = a.col + Math.sign(b.col - a.col);
  return `t${r}-${c}`;
}

// ---- station views -----------------------------------------------------------

function telemetryFor(state: SimState, d: Drone, receivedAt: string): Telemetry {
  const t = state.tiles.find((x) => x.tile_id === d.tile_id)!;
  return {
    actor_id: d.actor_id,
    tile_id: d.tile_id,
    position: t.center,
    battery: d.battery,
    status: d.status,
    position_reliable: d.gnss_ok,
    telemetry_at: state.clock,
    received_at: receivedAt,
  };
}

function syncTelemetry(state: SimState): SimState {
  if (state.link !== 'connected') return state;
  const telemetry = { ...state.station.telemetry };
  for (const d of state.drones) telemetry[d.actor_id] = telemetryFor(state, d, state.clock);
  return { ...state, station: { ...state.station, telemetry } };
}

// Exchange with the station while the link is up: deliver onboard events
// (deduplicated by ID, original event_at kept), deliver/acknowledge commands.
function exchange(state: SimState): SimState {
  if (state.link !== 'connected') return state;
  let received = state.station.received;
  for (const d of state.drones) received = mergeEvents(received, Object.values(d.known), state.clock).events;
  const commands = state.station.commands.map((c) => {
    if (c.status === 'queued') {
      if (Date.parse(state.clock) > Date.parse(c.expires_at)) return { ...c, status: 'expired' as const, review: 'needed' as const };
      return { ...c, status: 'sent' as const };
    }
    return c;
  });
  const drones = state.drones.map((d) => {
    const cmd = commands.find((c) => c.actor_id === d.actor_id && c.status === 'sent' && d.pending_command !== c.command_id);
    return cmd ? { ...d, pending_command: cmd.command_id } : d;
  });
  return syncTelemetry({ ...state, drones, station: { ...state.station, received, commands } });
}

// ---- operator actions ---------------------------------------------------------

export function setLink(state: SimState, link: LinkState): SimState {
  if (state.link === link) return state;
  if (link === 'lost') return { ...state, link, link_lost_at: state.clock };
  return exchange({ ...state, link, link_lost_at: null });
}

export class CommandUnavailable extends Error {}

export function queueCommand(state: SimState, type: CommandType, actor_id: string, target: string | null): SimState {
  if (type === 'return_to_launch' && state.link !== 'connected') {
    throw new CommandUnavailable('Return to launch needs a live radio link; it cannot be queued for later.');
  }
  if (type === 'inspect_tile' && !state.tiles.some((t) => t.tile_id === target)) throw new CommandUnavailable('Unknown tile.');
  const seq = state.station.command_seq + 1;
  const cmd: Command = {
    command_id: `cmd-${String(seq).padStart(3, '0')}`,
    type,
    actor_id,
    target,
    created_at: state.clock,
    expires_at: addSeconds(state.clock, state.config.command_ttl_steps * state.config.step_seconds),
    status: 'queued',
    acknowledged_at: null,
    review: null,
  };
  const next = { ...state, station: { ...state.station, command_seq: seq, commands: [...state.station.commands, cmd] } };
  return exchange(next);
}

export function reviewExpired(state: SimState, command_id: string, decision: 'dismiss' | 'reissue'): SimState {
  const cmd = state.station.commands.find((c) => c.command_id === command_id);
  if (!cmd || cmd.status !== 'expired') return state;
  const commands = state.station.commands.map((c) =>
    c.command_id === command_id ? { ...c, review: decision === 'dismiss' ? ('dismissed' as const) : ('reissued' as const) } : c,
  );
  const next = { ...state, station: { ...state.station, commands } };
  return decision === 'reissue' ? queueCommand(next, cmd.type, cmd.actor_id, cmd.target) : next;
}

export function setGnss(state: SimState, actor_id: string, ok: boolean): SimState {
  return {
    ...state,
    drones: state.drones.map((d) => (d.actor_id === actor_id ? { ...d, gnss_ok: ok, hold_steps: ok ? 0 : d.hold_steps } : d)),
  };
}

// ---- simulation step -----------------------------------------------------------

export function step(state: SimState): SimState {
  let rng = state.rng;
  const rand = () => {
    let u: number;
    [u, rng] = nextRandom(rng);
    return u;
  };
  const clock = addSeconds(state.clock, state.config.step_seconds);
  let s: SimState = { ...state, step: state.step + 1, clock };
  const notes = [...state.notes];
  const acked: Record<string, string> = {};

  // Drones act on onboard state only; they do not need the link to continue.
  // Drones plan one after another so each sees the others' updated targets
  // (the separation term), then act on onboard state only; no link needed.
  const drones = [...s.drones];
  const actOne = (d0: Drone): Drone => {
    const d = { ...d0 };
    if (d.status === 'landed') return d;
    if (d.pending_command) {
      const cmd = s.station.commands.find((c) => c.command_id === d.pending_command);
      if (cmd && cmd.status === 'sent') {
        acked[cmd.command_id] = clock;
        if (cmd.type === 'return_to_launch') d.status = 'returning';
        else if (cmd.target) d.target = cmd.target;
      }
      d.pending_command = null;
    }
    if (!d.gnss_ok) {
      // Simulation policy: without a position fix, hold, then land in place.
      d.hold_steps += 1;
      d.status = d.hold_steps > s.config.gnss_hold_steps ? 'landed' : 'holding';
      if (d.status === 'landed') notes.push(`${clock} ${d.actor_id}: position lost; simulated policy landed in place.`);
      d.battery = Math.max(0, d.battery - s.config.battery_per_step / 2);
      return d;
    }
    d.battery = Math.max(0, d.battery - s.config.battery_per_step);
    if (d.status === 'exploring' && d.battery <= s.config.low_battery) {
      d.status = 'returning';
      notes.push(`${clock} ${d.actor_id}: battery ${d.battery}% ≤ ${s.config.low_battery}%; simulated policy returns to launch.`);
    }
    if (d.status === 'holding') d.status = 'exploring';
    if (d.status === 'returning') {
      d.tile_id = d.tile_id === s.launch_tile ? d.tile_id : stepToward(s, d.tile_id, s.launch_tile);
      if (d.tile_id === s.launch_tile) d.status = 'landed';
      return d;
    }
    if (!d.target || d.target === d.tile_id) d.target = chooseTarget({ ...s, drones }, d);
    d.tile_id = stepToward(s, d.tile_id, d.target);
    if (d.tile_id === d.target) {
      const flooded = s.scenario_flooded[d.tile_id];
      const correct = rand() < s.config.sensor_accuracy;
      const sawWater = correct ? flooded : !flooded;
      d.seq += 1;
      const ev: MissionEvent = {
        event_id: `${d.actor_id}-ev-${String(d.seq).padStart(4, '0')}`,
        actor_id: d.actor_id,
        tile_id: d.tile_id,
        kind: sawWater ? 'water_observed' : 'dry_observed',
        event_at: clock,
        received_at: null,
        mode: 'simulation',
        source: `simulated-camera:${d.actor_id}`,
      };
      d.known = mergeEvents(d.known, [ev]).events;
      d.target = null;
    }
    return d;
  };
  for (let i = 0; i < drones.length; i++) drones[i] = actOne(drones[i]);

  // Drone-to-drone sharing within range: plain event-ID union.
  const tileMap = Object.fromEntries(s.tiles.map((t) => [t.tile_id, t]));
  for (let i = 0; i < drones.length; i++)
    for (let j = i + 1; j < drones.length; j++) {
      const a = drones[i];
      const b = drones[j];
      if (!a.gnss_ok || !b.gnss_ok) continue;
      if (tileDist(tileMap[a.tile_id], tileMap[b.tile_id]) <= s.config.gossip_range) {
        const union = mergeEvents(a.known, Object.values(b.known)).events;
        drones[i] = { ...a, known: union };
        drones[j] = { ...b, known: union };
      }
    }

  const commands = s.station.commands.map((c) => {
    if (acked[c.command_id] && s.link === 'connected') return { ...c, status: 'acknowledged' as const, acknowledged_at: acked[c.command_id] };
    return c;
  });
  s = { ...s, rng, drones, notes, station: { ...s.station, commands } };
  // Expire anything still waiting locally; it then needs operator review.
  s = {
    ...s,
    station: {
      ...s.station,
      commands: s.station.commands.map((c) =>
        c.status === 'queued' && Date.parse(clock) > Date.parse(c.expires_at) ? { ...c, status: 'expired', review: 'needed' } : c,
      ),
    },
  };
  return exchange(s);
}

// ---- views for the UI/map ------------------------------------------------------

export function stationBeliefs(state: SimState) {
  return beliefs(state.tiles, state.station.received);
}

export function overlay(state: SimState) {
  const b = stationBeliefs(state);
  const tiles = {
    type: 'FeatureCollection' as const,
    features: state.tiles.map((t) => {
      const [w, s, e, n] = t.bbox;
      return {
        type: 'Feature' as const,
        properties: { tile_id: t.tile_id, observed: b[t.tile_id].observations > 0, trust_mean: b[t.tile_id].mean, mode: 'simulation' },
        geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      };
    }),
  };
  const drones = {
    type: 'FeatureCollection' as const,
    features: Object.values(state.station.telemetry).map((tm) => ({
      type: 'Feature' as const,
      properties: { actor_id: tm.actor_id, stale: state.link !== 'connected' || !tm.position_reliable, mode: 'simulation' },
      geometry: { type: 'Point' as const, coordinates: tm.position },
    })),
  };
  return { tiles, drones };
}
