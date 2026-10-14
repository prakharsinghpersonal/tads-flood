import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type ApiClient } from './api/client';
import AssessmentPanel from './components/AssessmentPanel';
import EvidenceInspector from './components/EvidenceInspector';
import MapBoundary from './components/MapBoundary';
import PreparePanel from './components/PreparePanel';
import ReportPanel, { type ReportSource } from './components/ReportPanel';
import type { RadarView } from './components/SceneCompare';
import OfflinePanel from './offline/OfflinePanel';
import { CHANNEL_LABEL, MODE_LABEL, ageLabel, type LoadedAssessment, type Selection } from './domain/assessment';
import { loadScenesFromApi, useSceneUrls, type SceneLoad } from './domain/scenes';
import MapView, { type Highlight, type MissionOverlayData, type ToggleLayer } from './map/MapView';
import { useOnline } from './offline/useOnline';
import { lastPackageId, openPackage, type StoredPackage } from './offline/packageStore';


type Tab = 'assessment' | 'report' | 'offline';

const DEFAULT_VISIBLE: Record<ToggleLayer, boolean> = {
  flood: true,
  debris: true,
  roads: true,
  buildings: true,
  settlements: true,
  uncertainty: true,
};

export interface AppProps {
  client?: ApiClient;
}

export default function App({ client: injected }: AppProps) {
  const client = useMemo(() => injected ?? createClient(), [injected]);
  const online = useOnline();
  const [loaded, setLoaded] = useState<LoadedAssessment | null>(null);
  const [pkg, setPkg] = useState<StoredPackage | null>(null);
  const [tab, setTab] = useState<Tab>('assessment');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [visible, setVisible] = useState(DEFAULT_VISIBLE);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [radarView, setRadarView] = useState<RadarView>('after');
  const [radarOpacity, setRadarOpacity] = useState(0.85);
  const [scenes, setScenes] = useState<SceneLoad>({ status: 'none', reason: 'No assessment loaded.' });
  const [mapError, setMapError] = useState<string | null>(null);
  const [mission, setMission] = useState<MissionOverlayData | null>(null);

  const open = useCallback((next: LoadedAssessment, fromPackage: StoredPackage | null = null, nextTab: Tab = 'assessment') => {
    setLoaded(next);
    setPkg(fromPackage);
    setSelection(null);
    setMapError(null);
    setMission(null);
    setTab(nextTab);
  }, []);

  const select = useCallback((sel: Selection) => setSelection(sel), []);

  // Radar previews: verified PNG bytes from the backend package or the cached
  // package. A bundled fixture has none, and nothing is drawn in their place.
  useEffect(() => {
    if (!loaded) {
      setScenes({ status: 'none', reason: 'No assessment loaded.' });
      return;
    }
    if (loaded.channel === 'offline_package') {
      setScenes(pkg?.scenes ?? { status: 'none', reason: 'Package has no radar previews.' });
      return;
    }
    if (loaded.channel === 'bundled_fixture') {
      setScenes({ status: 'none', reason: 'The bundled UI fixture has no radar previews.' });
      return;
    }
    const ctl = new AbortController();
    setScenes({ status: 'loading' });
    loadScenesFromApi(client, loaded.assessment, ctl.signal)
      .then((r) => !ctl.signal.aborted && setScenes(r))
      .catch((err) => {
        if (ctl.signal.aborted) return;
        const status = (err as { status?: number }).status;
        setScenes(
          status === 404
            ? { status: 'none', reason: 'The backend has no package for this assessment.' }
            : { status: 'error', message: (err as Error).message },
        );
      });
    return () => ctl.abort();
  }, [loaded, pkg, client]);
  const sceneBlobs = useMemo(() => (scenes.status === 'ready' ? scenes.scenes : null), [scenes]);
  const sceneImages = useSceneUrls(sceneBlobs);

  // When the browser starts offline, reopen the last package so cached viewing
  // survives a reload. Online starts stay empty until the user chooses.
  const [startup, setStartup] = useState<'checking' | 'none' | 'done' | string>('checking');
  useEffect(() => {
    if (navigator.onLine) {
      setStartup('done');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const id = await lastPackageId();
        if (!id) return setStartup('none');
        const p = await openPackage(id);
        if (cancelled) return;
        open(p.loaded, p, 'offline');
        setStartup('done');
      } catch (err) {
        if (!cancelled) setStartup(`Cached package could not be opened: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const highlight: Highlight = useMemo(() => {
    if (!loaded || !selection) return { baseline: [], post: [], cut: [], selected: [] };
    if (selection.kind === 'settlement') {
      const s = loaded.assessment.settlements.find((x) => x.settlement_id === selection.id);
      return {
        baseline: s?.baseline_route_edge_ids ?? [],
        post: s?.post_event_route_edge_ids ?? [],
        cut: s?.candidate_cut_edge_ids ?? [],
        selected: [selection.id],
      };
    }
    if (selection.kind === 'feature') return { baseline: [], post: [], cut: [], selected: [selection.id] };
    return { baseline: [], post: [], cut: [], selected: [] };
  }, [loaded, selection]);

  const reportSource: ReportSource | null = useMemo(() => {
    if (!loaded) return null;
    const id = loaded.assessment.assessment_id;
    if (loaded.channel === 'api') {
      return {
        brief: (lang, signal) => client.getBrief(id, lang, signal),
        reviewed: (lang, signal) => client.getReport(id, lang, signal),
        briefHtml: async (lang, signal) => new Blob([(await client.briefHtml(id, lang, signal)).bytes], { type: 'text/html' }),
        copilot: online ? (q, lang, signal) => client.askCopilot(id, q, lang, signal) : null,
        copilotUnavailable: online ? null : 'The browser is offline. The copilot needs the API; cached briefs remain available.',
      };
    }
    if (loaded.channel === 'offline_package' && pkg) {
      const fromCache = async <T,>(doc: { kind: 'ok'; received: T } | { kind: 'error'; error: Error }) => {
        if (doc.kind === 'ok') return doc.received;
        throw doc.error;
      };
      return {
        brief: (lang) => fromCache(pkg.docs.brief[lang]),
        reviewed: (lang) => fromCache(pkg.docs.report[lang]),
        briefHtml: async (lang) => {
          const b = pkg.docs.briefHtml[lang];
          if (!b) throw new Error('This package has no printable brief for that language.');
          return b;
        },
        copilot: null,
        copilotUnavailable: 'Cached package view. Questions need the live API; reopen the assessment online to ask.',
      };
    }
    return null;
  }, [loaded, pkg, client, online]);

  const a = loaded?.assessment;

  return (
    <div className="app">
      <a href="#main-panel" className="skip-link">
        Skip to panel
      </a>
      <header className="topbar">
        <div className="brand">
          <h1>TADS Flood</h1>
          <span className="small muted">Flood exposure · road access · evidence</span>
        </div>
        <div className="badges" aria-label="Data provenance and connectivity">
          {a && (
            <>
              <span className={`badge badge-mode-${a.mode}`} data-testid="mode-badge">
                {MODE_LABEL[a.mode]}
              </span>
              <span className="badge badge-channel" data-testid="channel-badge">
                {CHANNEL_LABEL[loaded!.channel]}
                {loaded!.channel === 'offline_package' && ` · assessment ${ageLabel(a.generated_at)}`}
              </span>
            </>
          )}
          <span className={`badge ${online ? 'badge-ok' : 'badge-off'}`} data-testid="internet-badge">
            Internet: {online ? 'online' : 'offline'}
          </span>
        </div>
      </header>
      {a?.mode === 'synthetic' && (
        <p className="synthetic-banner" role="note">
          Synthetic data. Invented geometry and scenes for testing; not a real flood assessment.
        </p>
      )}

      <main className="workspace">
        <div className="map-area">
          {a ? (
            <MapBoundary onError={setMapError} resetKey={`${a.assessment_id}:${loaded!.received_at}`}>
              <MapView
                assessment={a}
                radar={{ images: sceneImages, view: radarView, opacity: radarOpacity }}
                visible={visible}
                highlight={highlight}
                mission={mission}
                onSelect={select}
                onMapError={setMapError}
              />
            </MapBoundary>
          ) : (
            <div className="map-placeholder" data-testid="empty-workspace">
              {startup === 'checking' ? (
                <p role="status">Checking this browser for a cached package…</p>
              ) : !online ? (
                <div role="alert" data-testid="offline-no-package">
                  <p>
                    <strong>Offline, and no cached package is open.</strong>
                  </p>
                  <p>{startup === 'none' ? 'No offline package exists in this browser. Nothing can be fetched while offline.' : startup}</p>
                </div>
              ) : (
                <p>No assessment loaded. Prepare one, or open a cached offline package.</p>
              )}
            </div>
          )}
          {mapError && (
            <div className="map-error" role="alert">
              {mapError}
              <button type="button" className="icon-button" aria-label="Dismiss map error" onClick={() => setMapError(null)}>
                ×
              </button>
            </div>
          )}
        </div>

        <div className="side" id="main-panel">
          <div className="tabs" role="tablist" aria-label="Workspace panels">
            {(
              [
                ['assessment', 'Assessment'],
                ['report', 'Report'],
                ['offline', 'Offline & mission'],
              ] as Array<[Tab, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                role="tab"
                id={`tab-${t}`}
                aria-selected={tab === t}
                aria-controls={`tabpanel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
                onKeyDown={(e) => {
                  const order: Tab[] = ['assessment', 'report', 'offline'];
                  const i = order.indexOf(t);
                  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                    const next = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`} className="tabpanel">
            {tab === 'assessment' && (
              <>
                {loaded ? (
                  <>
                    <div className="button-row">
                      <button
                        type="button"
                        onClick={() => {
                          setLoaded(null);
                          setPkg(null);
                          setSelection(null);
                          setMission(null);
                        }}
                      >
                        New assessment
                      </button>
                    </div>
                    <AssessmentPanel
                      loaded={loaded}
                      selection={selection}
                      visible={visible}
                      onToggle={(l) => setVisible((v) => ({ ...v, [l]: !v[l] }))}
                      onSelect={select}
                      scenes={scenes}
                      radarView={radarView}
                      radarOpacity={radarOpacity}
                      onRadarView={setRadarView}
                      onRadarOpacity={setRadarOpacity}
                    />
                  </>
                ) : (
                  <PreparePanel client={client} online={online} onLoaded={open} />
                )}
              </>
            )}
            {tab === 'report' &&
              (loaded ? (
                <ReportPanel loaded={loaded} source={reportSource} onSelect={select} />
              ) : (
                <p className="panel-section muted">Load an assessment to view its report.</p>
              ))}
            {tab === 'offline' && (
              <OfflinePanel
                client={client}
                online={online}
                loaded={loaded}
                activePackage={pkg}
                onOpenPackage={(l, p) => open(l, p, 'offline')}
                onMissionOverlay={setMission}
              />
            )}
          </div>
        </div>

        {loaded && selection && (
          <EvidenceInspector
            loaded={loaded}
            selection={selection}
            reviewed={reviewed}
            onToggleReviewed={(k) =>
              setReviewed((r) => {
                const n = new Set(r);
                if (n.has(k)) n.delete(k);
                else n.add(k);
                return n;
              })
            }
            onSelect={select}
            onClose={() => setSelection(null)}
            onOpenBrief={() => setTab('report')}
          />
        )}
      </main>
    </div>
  );
}
