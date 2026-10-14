// Before/after radar previews from the backend package manifest. Images are the
// exact PNG bytes the manifest names, verified by SHA-256; nothing is drawn when
// the manifest has no assets, and no colour polygon ever stands in for imagery.
import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { Assessment, RasterAsset } from '../api/contract';

export interface SceneBlob {
  asset: RasterAsset;
  blob: Blob;
}

export type SceneLoad =
  | { status: 'none'; reason: string }
  | { status: 'loading' }
  | { status: 'ready'; scenes: SceneBlob[] }
  | { status: 'error'; message: string };

export class SceneIntegrityError extends Error {}

export async function sha256Bytes(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const view = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const digest = await crypto.subtle.digest('SHA-256', view as unknown as ArrayBuffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Manifest asset metadata must agree with the assessment it ships with.
export function checkAssetProvenance(a: Assessment, asset: RasterAsset): string | null {
  if (asset.source_id === null) return null;
  const src = a.sources.find((s) => s.source_id === asset.source_id);
  if (!src) return `${asset.role} names source ${asset.source_id}, which the assessment does not list.`;
  if (asset.acquired_at !== null && Date.parse(asset.acquired_at) !== Date.parse(src.acquired_at)) {
    return `${asset.role} acquisition time ${asset.acquired_at} disagrees with source ${src.source_id} (${src.acquired_at}).`;
  }
  return null;
}

export async function verifiedSceneBlob(asset: RasterAsset, bytes: ArrayBuffer): Promise<SceneBlob> {
  const digest = await sha256Bytes(bytes);
  if (digest !== asset.sha256) {
    throw new SceneIntegrityError(`${asset.role} image failed its SHA-256 check (expected ${asset.sha256.slice(0, 12)}…, got ${digest.slice(0, 12)}…).`);
  }
  return { asset, blob: new Blob([bytes], { type: asset.media_type }) };
}

export async function loadScenesFromApi(client: ApiClient, a: Assessment, signal: AbortSignal): Promise<SceneLoad> {
  const pkg = await client.getPackage(a.assessment_id, signal);
  if (pkg.assets.length === 0) return { status: 'none', reason: 'The backend package lists no radar preview for this assessment.' };
  const scenes: SceneBlob[] = [];
  for (const asset of pkg.assets) {
    const problem = checkAssetProvenance(a, asset);
    if (problem) throw new SceneIntegrityError(problem);
    const { bytes } = await client.bytes(asset.uri, signal);
    scenes.push(await verifiedSceneBlob(asset, bytes));
  }
  return { status: 'ready', scenes };
}

export interface SceneImage {
  asset: RasterAsset;
  url: string;
}

// Object URLs for the current scene blobs; the previous set is revoked whenever
// the blobs change and on unmount, so switching areas never leaks images.
export function useSceneUrls(scenes: SceneBlob[] | null): SceneImage[] {
  const [images, setImages] = useState<SceneImage[]>([]);
  useEffect(() => {
    if (!scenes || scenes.length === 0) {
      setImages([]);
      return;
    }
    const made = scenes.map((s) => ({ asset: s.asset, url: URL.createObjectURL(s.blob) }));
    setImages(made);
    return () => {
      for (const m of made) URL.revokeObjectURL(m.url);
    };
  }, [scenes]);
  return images;
}

export const ROLE_LABEL: Record<RasterAsset['role'], string> = {
  before_radar: 'Before event',
  after_radar: 'After event',
};
