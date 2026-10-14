import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import { MODE_LABEL, ageLabel, formatTime, shortHash, type LoadedAssessment } from '../domain/assessment';
import type { MissionOverlayData } from '../map/MapView';
import MissionPanel from '../mission/MissionPanel';
import { createPackage, deletePackage, listPackages, openPackage, type PackageManifest, type StoredPackage } from './packageStore';

interface Props {
  client: ApiClient;
  online: boolean;
  loaded: LoadedAssessment | null;
  activePackage: StoredPackage | null;
  onOpenPackage: (loaded: LoadedAssessment, pkg: StoredPackage) => void;
  onMissionOverlay: (o: MissionOverlayData | null) => void;
}

export default function OfflinePanel({ client, online, loaded, activePackage, onOpenPackage, onMissionOverlay }: Props) {
  const [packages, setPackages] = useState<PackageManifest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setPackages(await listPackages());
    } catch (err) {
      setError(`Browser storage unavailable: ${(err as Error).message}`);
      setPackages([]);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    if (!loaded) return;
    setBusy(true);
    setError(null);
    try {
      const m = await createPackage(loaded, online ? client : null);
      await refresh();
      const pkg = await openPackage(m.package_id);
      onOpenPackage(pkg.loaded, pkg);
    } catch (err) {
      setError(`Could not save package: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  async function open(id: string) {
    setBusy(true);
    setError(null);
    try {
      const pkg = await openPackage(id);
      onOpenPackage(pkg.loaded, pkg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await deletePackage(id);
    setConfirmDelete(null);
    await refresh();
  }

  const canSave = loaded && loaded.channel !== 'offline_package';

  return (
    <div>
      <section className="panel-section" aria-labelledby="offline-title">
        <h2 id="offline-title">Offline packages</h2>
        <p className="small">
          A package stores the received assessment, its backend reports and a hashed manifest in this browser (IndexedDB). Cached viewing needs no network and shows no fresh satellite data.
        </p>
        {canSave && (
          <button type="button" className="primary" onClick={() => void save()} disabled={busy}>
            Save current assessment as offline package
          </button>
        )}
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {packages === null && <p role="status">Reading browser storage…</p>}
        {packages?.length === 0 && (
          <div className="notice" data-testid="no-package">
            <strong>No offline package in this browser.</strong>
            <p className="small">
              {online
                ? 'Load an assessment, then save it here before going offline.'
                : 'The browser is offline, so nothing can be fetched. A package must be saved while online.'}
            </p>
          </div>
        )}
        <ul className="package-list">
          {packages?.map((m) => {
            const active = activePackage?.manifest.package_id === m.package_id;
            return (
              <li key={m.package_id} className={`card ${active ? 'card-active' : ''}`} data-testid="package-item">
                <header>
                  <span className={`badge badge-mode-${m.assessment_mode}`}>{MODE_LABEL[m.assessment_mode as keyof typeof MODE_LABEL] ?? m.assessment_mode}</span>{' '}
                  <code>{m.assessment_id}</code> {active && <span className="tag">open</span>}
                </header>
                <dl className="kv small">
                  <dt>Package</dt>
                  <dd className="break">{m.package_id}</dd>
                  <dt>Saved</dt>
                  <dd>
                    {formatTime(m.created_at)} ({ageLabel(m.created_at)})
                  </dd>
                  <dt>Event / AOI</dt>
                  <dd>
                    {m.event_date} · {m.aoi.join(', ')}
                  </dd>
                  <dt>Scenes</dt>
                  <dd>{m.scene_times.map((s) => `${s.source_id} ${formatTime(s.acquired_at)}`).join('; ')}</dd>
                  <dt>Reports</dt>
                  <dd>{m.reports.map((r) => `${r.language}: ${r.status}${r.error_code ? ` (${r.error_code})` : ''}`).join(' · ')}</dd>
                  <dt>Assets</dt>
                  <dd>{m.assets.map((a) => `${a.asset_id} ${shortHash(a.sha256)}`).join(' · ')}</dd>
                  <dt>Basemap</dt>
                  <dd>{m.basemap}</dd>
                </dl>
                <div className="button-row">
                  <button type="button" onClick={() => void open(m.package_id)} disabled={busy}>
                    {active ? 'Reopen' : 'Open package'}
                  </button>
                  {confirmDelete === m.package_id ? (
                    <>
                      <button type="button" className="danger" onClick={() => void remove(m.package_id)}>
                        Confirm delete
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(null)}>
                        Keep
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(m.package_id)}>
                      Delete…
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
      {activePackage ? (
        <MissionPanel key={activePackage.manifest.package_id} pkg={activePackage} onOverlay={onMissionOverlay} />
      ) : (
        <section className="panel-section">
          <h2>Simulated inspection</h2>
          <p className="small muted">Open an offline package to run the optional inspection simulation over its cached prior.</p>
        </section>
      )}
    </div>
  );
}
