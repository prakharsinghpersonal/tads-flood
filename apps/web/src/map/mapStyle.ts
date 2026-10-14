import type { Assessment } from '../api/contract';
import { LAYER_NAMES, featureId, type GeoFeature } from '../domain/assessment';

// No remote tiles, glyphs or sprites: everything rendered comes from the loaded
// assessment or offline package, so cached viewing never needs the network.
export const BASE_STYLE = {
  version: 8 as const,
  sources: {},
  layers: [{ id: 'background', type: 'background' as const, paint: { 'background-color': '#eef2f3' } }],
};

export const COLORS = {
  flood: '#2b6cb0',
  debris: '#b7791f',
  road: '#4a5568',
  roadExposed: '#c53030',
  building: '#718096',
  buildingExposed: '#c05621',
  baseline: '#2c5282',
  post: '#276749',
  cut: '#c53030',
  selected: '#111111',
  unknown: '#6b46c1',
  facility: '#1a365d',
  aoi: '#1a202c',
};

export const STATUS_COLOR: Record<string, string> = {
  connected: '#276749',
  potentially_isolated: '#c53030',
  preexisting_disconnected: '#4a5568',
  unknown_network: '#6b46c1',
};

// Copy features and add a guaranteed __id property for promoteId/filters.
export function normalized(a: Assessment, layer: (typeof LAYER_NAMES)[number]) {
  return {
    type: 'FeatureCollection' as const,
    features: a.layers[layer].features
      .map((raw) => {
        const f = raw as GeoFeature;
        const id = featureId(f);
        if (!id || !f.geometry) return null;
        return { type: 'Feature' as const, geometry: f.geometry, properties: { ...(f.properties ?? {}), __id: id } };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null),
  };
}

export function bboxPolygon([w, s, e, n]: Assessment['bbox']) {
  return {
    type: 'FeatureCollection' as const,
    features: [
      {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'Polygon' as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
      },
    ],
  };
}

export function attributionFor(a: Assessment): string {
  const kinds = new Set(a.sources.map((s) => s.kind));
  if (a.mode === 'synthetic') return 'Synthetic geometry and scenes (no real data)';
  const parts: string[] = [];
  if (kinds.has('sentinel_1') || kinds.has('sentinel_2')) parts.push('Contains modified Copernicus Sentinel data 2026');
  if (kinds.has('dem')) parts.push('Copernicus WorldDEM-30 © DLR e.V. / Airbus');
  if (kinds.has('osm')) parts.push('© OpenStreetMap contributors');
  return parts.join(' · ');
}
