import { describe, expect, it } from 'vitest';
import { parseAssessment, type Assessment } from '../api/contract';
import fixture from '../fixtures/synthetic-ui-assessment.json';
import {
  CommandUnavailable,
  acquisition,
  beliefs,
  createSim,
  mergeEvents,
  queueCommand,
  reviewExpired,
  setGnss,
  setLink,
  stationBeliefs,
  step,
  type MissionEvent,
  type SimState,
} from './sim';

const parsed = parseAssessment(fixture);
if (!parsed.ok) throw new Error('fixture invalid');
const assessment: Assessment = parsed.assessment;

function deepFreeze<T>(o: T): T {
  Object.freeze(o);
  for (const v of Object.values(o as object)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v);
  return o;
}

const run = (s: SimState, n: number) => {
  for (let i = 0; i < n; i++) s = step(s);
  return s;
};
const onboardCount = (s: SimState) => new Set(s.drones.flatMap((d) => Object.keys(d.known))).size;

describe('mission simulator', () => {
  it('is deterministic for the same seed and config', () => {
    const a = run(createSim(assessment, assessment.bbox), 12);
    const b = run(createSim(assessment, assessment.bbox), 12);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const c = run(createSim(assessment, assessment.bbox, { seed: 99 }), 12);
    expect(JSON.stringify(c.scenario_flooded)).not.toBe(JSON.stringify(a.scenario_flooded));
  });

  it('starts with uninformed trust and a prior derived from flood polygons', () => {
    const s = createSim(assessment, assessment.bbox);
    const b = stationBeliefs(s);
    for (const t of s.tiles) {
      expect(b[t.tile_id]).toMatchObject({ alpha: 1, beta: 1, mean: 0.5, observations: 0 });
    }
    expect(s.prior_source).toMatch(/flood polygons/);
    expect(Math.max(...s.tiles.map((t) => t.hazard_prior))).toBeGreaterThan(Math.min(...s.tiles.map((t) => t.hazard_prior)));
  });

  it('rejects inspection bounds outside the AOI or with zero area', () => {
    expect(() => createSim(assessment, [85.2, 27.85, 85.26, 27.87])).toThrow(/inside the assessment AOI/);
    expect(() => createSim(assessment, [85.26, 27.86, 85.26, 27.87])).toThrow();
  });

  it('O09: never mutates the base assessment', () => {
    const frozen = deepFreeze(structuredClone(assessment));
    const before = JSON.stringify(frozen);
    let s = createSim(frozen, frozen.bbox);
    s = run(s, 20);
    expect(JSON.stringify(frozen)).toBe(before);
    expect(s.mode).toBe('simulation');
    expect(Object.values(s.station.received).every((e) => e.mode === 'simulation')).toBe(true);
  });

  it('O02: freezes last-known telemetry while the link is lost', () => {
    let s = run(createSim(assessment, assessment.bbox), 2);
    s = setLink(s, 'lost');
    const frozen = structuredClone(s.station.telemetry);
    s = run(s, 4);
    expect(s.station.telemetry).toEqual(frozen);
    expect(s.drones.some((d) => d.tile_id !== frozen[d.actor_id].tile_id || d.battery !== frozen[d.actor_id].battery)).toBe(true);
  });

  it('O03: events accrue onboard during radio loss but are not received evidence', () => {
    let s = run(createSim(assessment, assessment.bbox), 2);
    s = setLink(s, 'lost');
    const received = Object.keys(s.station.received).length;
    const onboard = onboardCount(s);
    s = run(s, 6);
    expect(onboardCount(s)).toBeGreaterThan(onboard);
    expect(Object.keys(s.station.received).length).toBe(received);
  });

  it('O04: reconnecting twice assimilates each event exactly once, keeping event time', () => {
    let s = run(createSim(assessment, assessment.bbox), 2);
    s = setLink(s, 'lost');
    s = run(s, 5);
    const lostEvents = s.drones.flatMap((d) => Object.values(d.known)).filter((e) => !s.station.received[e.event_id]);
    expect(lostEvents.length).toBeGreaterThan(0);
    s = setLink(s, 'connected');
    const after1 = structuredClone(s.station.received);
    const trust1 = stationBeliefs(s);
    for (const e of lostEvents) {
      expect(s.station.received[e.event_id].event_at).toBe(e.event_at);
      expect(s.station.received[e.event_id].received_at).toBe(s.clock);
      expect(Date.parse(s.station.received[e.event_id].received_at!)).toBeGreaterThanOrEqual(Date.parse(e.event_at));
    }
    expect(lostEvents.some((e) => Date.parse(s.station.received[e.event_id].received_at!) > Date.parse(e.event_at))).toBe(true);
    s = setLink(setLink(s, 'lost'), 'connected');
    expect(s.station.received).toEqual(after1);
    expect(stationBeliefs(s)).toEqual(trust1);
  });

  it('O10: a duplicated observation does not inflate trust; disagreement lowers it', () => {
    const s = createSim(assessment, assessment.bbox);
    const wet = [...s.tiles].sort((a, b) => b.hazard_prior - a.hazard_prior)[0];
    const ev: MissionEvent = {
      event_id: 'drone-1-ev-9999',
      actor_id: 'drone-1',
      tile_id: wet.tile_id,
      kind: 'water_observed',
      event_at: s.clock,
      received_at: null,
      mode: 'simulation',
      source: 'test',
    };
    const once = mergeEvents({}, [ev]).events;
    const twice = mergeEvents(once, [ev, { ...ev }]);
    expect(twice.added).toBe(0);
    expect(beliefs(s.tiles, twice.events)[wet.tile_id]).toEqual(beliefs(s.tiles, once)[wet.tile_id]);
    expect(beliefs(s.tiles, once)[wet.tile_id].mean).toBeGreaterThan(0.5);
    const dry = { ...ev, event_id: 'drone-1-ev-9998', kind: 'dry_observed' as const };
    expect(beliefs(s.tiles, { ...once, [dry.event_id]: dry })[wet.tile_id].mean).toBe(0.5);
  });

  it('O10: acquisition prefers uncertain tiles more as exploration preference rises', () => {
    const base = createSim(assessment, assessment.bbox, { explore: 'low' });
    const high = createSim(assessment, assessment.bbox, { explore: 'high' });
    const d = base.drones[0];
    const observedTile = base.tiles[0].tile_id;
    const known = {
      a: { event_id: 'a', actor_id: d.actor_id, tile_id: observedTile, kind: 'water_observed', event_at: base.clock, received_at: null, mode: 'simulation', source: 't' },
    } as Record<string, MissionEvent>;
    const gap = (s: SimState) => {
      const terms = acquisition(s, { ...d, known });
      const seen = terms.find((t) => t.tile_id === observedTile)!;
      const fresh = terms.find((t) => t.tile_id === s.tiles[1].tile_id)!;
      expect(seen.uncertainty).toBeLessThan(fresh.uncertainty);
      return fresh.score - fresh.hazard - (seen.score - seen.hazard);
    };
    expect(gap(high)).toBeGreaterThan(gap(base));
  });

  it('O05/O06: queued inspection stays pending without a link and expires for review', () => {
    let s = setLink(createSim(assessment, assessment.bbox), 'lost');
    s = queueCommand(s, 'inspect_tile', 'drone-1', 't4-4');
    expect(s.station.commands[0].status).toBe('queued');
    s = step(s);
    expect(s.station.commands[0].status).toBe('queued');
    expect(s.station.commands[0].acknowledged_at).toBeNull();
    s = run(s, 4);
    expect(s.station.commands[0]).toMatchObject({ status: 'expired', review: 'needed' });
    s = setLink(s, 'connected');
    s = step(s);
    expect(s.station.commands[0].status).toBe('expired');
    expect(s.drones.every((d) => d.pending_command === null)).toBe(true);
    s = reviewExpired(s, 'cmd-001', 'reissue');
    expect(s.station.commands[0].review).toBe('reissued');
    expect(s.station.commands[1]).toMatchObject({ command_id: 'cmd-002', status: 'sent' });
    s = step(s);
    expect(s.station.commands[1].status).toBe('acknowledged');
  });

  it('O05: a command sent before link loss is not acknowledged until contact returns', () => {
    let s = queueCommand(createSim(assessment, assessment.bbox), 'inspect_tile', 'drone-2', 't4-0');
    expect(s.station.commands[0].status).toBe('sent');
    s = setLink(s, 'lost');
    s = step(s);
    expect(s.station.commands[0].status).toBe('sent');
    s = setLink(s, 'connected');
    s = step(s);
    expect(s.station.commands[0].status).toBe('acknowledged');
  });

  it('separation: two drones from one launch tile do not pick the same first target', () => {
    const s = step(createSim(assessment, assessment.bbox));
    const [d1, d2] = s.drones;
    expect(d1.target ?? d1.tile_id).not.toBe(d2.target ?? d2.tile_id);
  });

  it('return-to-launch is unavailable without a link', () => {
    const s = setLink(createSim(assessment, assessment.bbox), 'lost');
    expect(() => queueCommand(s, 'return_to_launch', 'drone-1', null)).toThrow(CommandUnavailable);
  });

  it('O11: low battery returns to launch; position loss holds then lands (simulation policy)', () => {
    let s = run(createSim(assessment, assessment.bbox), 25);
    expect(s.drones.every((d) => d.status === 'returning' || d.status === 'landed')).toBe(true);
    expect(s.notes.some((n) => n.includes('simulated policy returns to launch'))).toBe(true);

    let g = setGnss(run(createSim(assessment, assessment.bbox), 2), 'drone-1', false);
    const known = Object.keys(g.drones[0].known).length;
    g = step(g);
    expect(g.drones[0].status).toBe('holding');
    expect(g.station.telemetry['drone-1'].position_reliable).toBe(false);
    g = run(g, 3);
    expect(g.drones[0].status).toBe('landed');
    expect(Object.keys(g.drones[0].known).length).toBeGreaterThanOrEqual(known);
    expect(g.notes.some((n) => n.includes('position lost'))).toBe(true);
  });
});
