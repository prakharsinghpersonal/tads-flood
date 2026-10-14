import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre 6 is ESM-only and resolves its worker next to its own module. In a
// bundled build that file does not exist, so Vite bundles the worker (with its
// shared chunk) and we hand MapLibre the emitted URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Assessment, LayerName } from '../api/contract';
import type { Selection } from '../domain/assessment';
import type { SceneImage } from '../domain/scenes';
import { BASE_STYLE, COLORS, STATUS_COLOR, attributionFor, bboxPolygon, normalized } from './mapStyle';

maplibregl.setWorkerUrl(workerUrl);

export type ToggleLayer = 'flood' | 'debris' | 'roads' | 'buildings' | 'settlements' | 'uncertainty';

export interface Highlight {
  baseline: string[];
  post: string[];
  cut: string[];
  selected: string[];
}

export interface MissionOverlayData {
  tiles: GeoJSON.FeatureCollection;
  drones: GeoJSON.FeatureCollection;
}

export interface RadarOverlay {
  images: SceneImage[];
  view: 'off' | 'before' | 'after';
  opacity: number;
}

interface Props {
  assessment: Assessment;
  radar: RadarOverlay;
  visible: Record<ToggleLayer, boolean>;
  highlight: Highlight;
  mission: MissionOverlayData | null;
  onSelect: (sel: Selection) => void;
  onMapError: (message: string) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const LAYER_GROUPS: Record<ToggleLayer, string[]> = {
  flood: ['flood-fill', 'flood-line'],
  debris: ['debris-fill', 'debris-line'],
  roads: ['roads-line', 'roads-exposed', 'roads-unknown'],
  buildings: ['buildings-fill', 'buildings-exposed'],
  settlements: ['settlements-circle', 'facilities'],
  uncertainty: ['unknown-buildings', 'unknown-settlements', 'aoi-nodata'],
};

const CLICKABLE: Array<[string, LayerName]> = [
  ['settlements-circle', 'settlements'],
  ['facilities', 'settlements'],
  ['roads-unknown', 'roads'],
  ['roads-line', 'roads'],
  ['roads-exposed', 'roads'],
  ['buildings-fill', 'buildings'],
  ['buildings-exposed', 'buildings'],
  ['debris-fill', 'debris'],
  ['flood-fill', 'flood'],
];

function coordsOf(g: { type: string; coordinates: unknown }): [number, number][] {
  const out: [number, number][] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v) && typeof v[0] === 'number') out.push([v[0] as number, v[1] as number]);
    else if (Array.isArray(v)) v.forEach(walk);
  };
  walk(g.coordinates);
  return out;
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default function MapView({ assessment, radar, visible, highlight, mission, onSelect, onMapError }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  // The loaded map instance, not a boolean: a stale flag from a previous
  // instance must never let effects touch a style that has not loaded.
  const [loadedMap, setLoadedMap] = useState<MlMap | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const handlers = useRef({ onSelect, onMapError });
  handlers.current = { onSelect, onMapError };

  // Create the map once per assessment.
  useEffect(() => {
    if (!container.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        style: BASE_STYLE,
        bounds: assessment.bbox as [number, number, number, number],
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true, customAttribution: attributionFor(assessment) },
        dragRotate: false,
        pitchWithRotate: false,
      });
    } catch (err) {
      const msg = `Map could not start (${(err as Error).message}). Lists and inspector remain available.`;
      setFatal(msg);
      handlers.current.onMapError(msg);
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('error', (e) => handlers.current.onMapError(`Map source error: ${e.error?.message ?? 'unknown'}`));

    map.on('load', () => {
      const add = (id: string, data: GeoJSON.FeatureCollection | ReturnType<typeof normalized>) =>
        map.addSource(id, { type: 'geojson', data: data as GeoJSON.FeatureCollection, promoteId: '__id' });
      add('aoi', bboxPolygon(assessment.bbox));
      for (const l of ['flood', 'debris', 'roads', 'buildings', 'settlements'] as const) add(l, normalized(assessment, l));
      add('mission-tiles', EMPTY_FC);
      add('mission-drones', EMPTY_FC);

      map.addLayer({
        id: 'aoi-nodata',
        type: 'fill',
        source: 'aoi',
        paint: { 'fill-color': COLORS.unknown, 'fill-opacity': assessment.quality.valid_fraction < 1 ? 0.06 : 0 },
      });
      map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', paint: { 'line-color': COLORS.aoi, 'line-width': 1.5, 'line-dasharray': [4, 2] } });
      map.addLayer({ id: 'flood-fill', type: 'fill', source: 'flood', paint: { 'fill-color': COLORS.flood, 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'flood-line', type: 'line', source: 'flood', paint: { 'line-color': COLORS.flood, 'line-width': 1 } });
      map.addLayer({ id: 'debris-fill', type: 'fill', source: 'debris', paint: { 'fill-color': COLORS.debris, 'fill-opacity': 0.45 } });
      map.addLayer({ id: 'debris-line', type: 'line', source: 'debris', paint: { 'line-color': COLORS.debris, 'line-width': 1.5, 'line-dasharray': [1, 1] } });
      map.addLayer({
        id: 'buildings-fill',
        type: 'fill',
        source: 'buildings',
        filter: ['!', ['in', ['get', 'status'], ['literal', ['exposed', 'unknown']]]],
        paint: { 'fill-color': COLORS.building, 'fill-opacity': 0.7 },
      });
      map.addLayer({
        id: 'buildings-exposed',
        type: 'fill',
        source: 'buildings',
        filter: ['==', ['get', 'status'], 'exposed'],
        paint: { 'fill-color': COLORS.buildingExposed, 'fill-opacity': 0.9 },
      });
      map.addLayer({
        id: 'unknown-buildings',
        type: 'line',
        source: 'buildings',
        filter: ['==', ['get', 'status'], 'unknown'],
        paint: { 'line-color': COLORS.unknown, 'line-width': 2, 'line-dasharray': [1, 1] },
      });
      map.addLayer({
        id: 'roads-line',
        type: 'line',
        source: 'roads',
        filter: ['!', ['in', ['get', 'status'], ['literal', ['candidate_blocked', 'unknown']]]],
        paint: { 'line-color': COLORS.road, 'line-width': 3 },
        layout: { 'line-cap': 'round' },
      });
      map.addLayer({
        id: 'roads-exposed',
        type: 'line',
        source: 'roads',
        filter: ['==', ['get', 'status'], 'candidate_blocked'],
        paint: { 'line-color': COLORS.roadExposed, 'line-width': 4, 'line-dasharray': [2, 1] },
      });
      // Unknown coverage: distinct purple dotted line, never drawn as passable.
      map.addLayer({
        id: 'roads-unknown',
        type: 'line',
        source: 'roads',
        filter: ['==', ['get', 'status'], 'unknown'],
        paint: { 'line-color': COLORS.unknown, 'line-width': 3, 'line-dasharray': [0.5, 1.5] },
        layout: { 'line-cap': 'round' },
      });
      map.addLayer({ id: 'route-baseline', type: 'line', source: 'roads', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'line-color': COLORS.baseline, 'line-width': 9, 'line-opacity': 0.35 } });
      map.addLayer({ id: 'route-post', type: 'line', source: 'roads', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'line-color': COLORS.post, 'line-width': 6, 'line-opacity': 0.85 } });
      map.addLayer({ id: 'route-cut', type: 'line', source: 'roads', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'line-color': COLORS.cut, 'line-width': 10, 'line-opacity': 0.9, 'line-dasharray': [1, 0.6] } });
      map.addLayer({
        id: 'mission-tiles',
        type: 'fill',
        source: 'mission-tiles',
        paint: {
          'fill-color': ['case', ['get', 'observed'], '#2f855a', '#a0aec0'],
          'fill-opacity': ['case', ['get', 'observed'], 0.25, 0.08],
          'fill-outline-color': '#2d3748',
        },
      });
      map.addLayer({
        id: 'mission-drones',
        type: 'circle',
        source: 'mission-drones',
        paint: {
          'circle-radius': 7,
          'circle-color': ['case', ['get', 'stale'], '#ffffff', '#1a202c'],
          'circle-stroke-color': '#1a202c',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'settlements-circle',
        type: 'circle',
        source: 'settlements',
        filter: ['!=', ['get', 'kind'], 'facility'],
        paint: {
          'circle-radius': 8,
          'circle-color': ['match', ['get', 'status'], ...Object.entries(STATUS_COLOR).flat(), '#718096'] as never,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'facilities',
        type: 'circle',
        source: 'settlements',
        filter: ['==', ['get', 'kind'], 'facility'],
        paint: { 'circle-radius': 9, 'circle-color': COLORS.facility, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      });
      map.addLayer({
        id: 'unknown-settlements',
        type: 'circle',
        source: 'settlements',
        filter: ['==', ['get', 'status'], 'unknown_network'],
        paint: { 'circle-radius': 13, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.unknown, 'circle-stroke-width': 2 },
      });
      map.addLayer({ id: 'selected-line', type: 'line', source: 'roads', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'line-color': COLORS.selected, 'line-width': 3, 'line-gap-width': 4 } });
      map.addLayer({ id: 'selected-fill', type: 'line', source: 'buildings', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'line-color': COLORS.selected, 'line-width': 3 } });
      map.addLayer({ id: 'selected-point', type: 'circle', source: 'settlements', filter: ['in', ['get', '__id'], ['literal', []]], paint: { 'circle-radius': 14, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': COLORS.selected, 'circle-stroke-width': 3 } });

      for (const [layerId, layer] of CLICKABLE) {
        map.on('click', layerId, (e: MapLayerMouseEvent) => {
          const id = e.features?.[0]?.properties?.__id;
          if (!id) return;
          e.originalEvent.stopPropagation();
          const isSettlement = layerId === 'settlements-circle';
          handlers.current.onSelect(isSettlement ? { kind: 'settlement', id } : { kind: 'feature', layer, id });
        });
        map.on('mouseenter', layerId, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', layerId, () => (map.getCanvas().style.cursor = ''));
      }
      setLoadedMap(map);
    });

    return () => {
      setLoadedMap(null);
      mapRef.current = null;
      map.remove();
    };
  }, [assessment]);

  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    for (const [group, ids] of Object.entries(LAYER_GROUPS)) {
      for (const id of ids) map.setLayoutProperty(id, 'visibility', visible[group as ToggleLayer] ? 'visible' : 'none');
    }
  }, [visible, loadedMap]);

  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    const f = (ids: string[]) => ['in', ['get', '__id'], ['literal', ids]] as never;
    map.setFilter('route-baseline', f(highlight.baseline));
    map.setFilter('route-post', f(highlight.post));
    map.setFilter('route-cut', f(highlight.cut));
    map.setFilter('selected-line', f(highlight.selected));
    map.setFilter('selected-fill', f(highlight.selected));
    map.setFilter('selected-point', f(highlight.selected));
    // Bring the selection into the part of the map the inspector leaves visible.
    const ids = new Set([...highlight.selected, ...highlight.baseline, ...highlight.post]);
    if (ids.size === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    let any = false;
    for (const layer of ['roads', 'settlements', 'buildings', 'flood', 'debris'] as const) {
      for (const feat of normalized(assessment, layer).features) {
        if (!ids.has(feat.properties.__id)) continue;
        for (const c of coordsOf(feat.geometry)) {
          bounds.extend(c);
          any = true;
        }
      }
    }
    if (!any) return;
    const wide = window.innerWidth > 900;
    map.fitBounds(bounds, {
      padding: wide ? { top: 40, bottom: 40, left: 40, right: Math.min(420, map.getContainer().clientWidth / 2) } : 40,
      maxZoom: 16,
      animate: !prefersReducedMotion(),
    });
  }, [highlight, loadedMap, assessment]);

  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    (map.getSource('mission-tiles') as GeoJSONSource).setData(mission?.tiles ?? EMPTY_FC);
    (map.getSource('mission-drones') as GeoJSONSource).setData(mission?.drones ?? EMPTY_FC);
  }, [mission, loadedMap]);

  // Radar previews: image sources at the manifest's four corners, under all
  // vector layers. Rebuilt when the image set changes (URLs are revoked by the
  // owner), otherwise only visibility/opacity change.
  const radarKey = radar.images.map((i) => i.url).join('|');
  const [radarLoaded, setRadarLoaded] = useState<string[]>([]);
  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    setRadarLoaded([]);
    for (const role of ['before_radar', 'after_radar']) {
      if (map.getLayer(`radar-${role}`)) map.removeLayer(`radar-${role}`);
      if (map.getSource(`radar-${role}`)) map.removeSource(`radar-${role}`);
    }
    for (const img of radar.images) {
      const id = `radar-${img.asset.role}`;
      map.addSource(id, { type: 'image', url: img.url, coordinates: img.asset.coordinates });
      map.addLayer({ id, type: 'raster', source: id, paint: { 'raster-opacity': 0, 'raster-fade-duration': 0, 'raster-resampling': 'nearest' } }, 'aoi-nodata');
    }
    // Record which image sources actually decoded (exposed for tests/QA).
    const onData = () => {
      const done = radar.images.map((i) => i.asset.role).filter((role) => map.getSource(`radar-${role}`) && map.isSourceLoaded(`radar-${role}`));
      setRadarLoaded((prev) => (prev.join() === done.join() ? prev : done));
    };
    map.on('sourcedata', onData);
    return () => {
      map.off('sourcedata', onData);
    };
  }, [radarKey, loadedMap]);

  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    for (const role of ['before_radar', 'after_radar'] as const) {
      const id = `radar-${role}`;
      if (!map.getLayer(id)) continue;
      const on = (radar.view === 'before' && role === 'before_radar') || (radar.view === 'after' && role === 'after_radar');
      map.setPaintProperty(id, 'raster-opacity', on ? radar.opacity : 0);
    }
  }, [radar.view, radar.opacity, radarKey, loadedMap]);

  useEffect(() => {
    const map = loadedMap;
    if (!map || map !== mapRef.current) return;
    map.fitBounds(assessment.bbox as [number, number, number, number], { padding: 24, animate: !prefersReducedMotion() });
  }, [assessment, loadedMap]);

  return (
    <div className="map-wrap">
      <div
        ref={container}
        className="map"
        role="region"
        aria-label="Assessment map. Use the settlement and asset lists for keyboard selection."
        data-testid="map"
        data-ready={loadedMap ? 'true' : 'false'}
        data-radar={radar.images.length ? `${radar.view}:${radar.images.map((i) => i.asset.role).join(',')}` : 'none'}
        data-radar-loaded={radarLoaded.join(',')}
      />
      {fatal && (
        <div className="map-fatal" role="alert">
          {fatal}
        </div>
      )}
    </div>
  );
}

export type { Selection };
