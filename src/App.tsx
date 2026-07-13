import { useEffect, useMemo, useRef, useState } from 'react';
import { SimulatorAdapter } from './adapters/simulatorAdapter';
import { ConnectionPanel } from './components/ConnectionPanel';
import { EventTimeline } from './components/EventTimeline';
import { HistoryPanel } from './components/HistoryPanel';
import { ProfileSelector } from './components/ProfileSelector';
import { ResultSummary } from './components/ResultSummary';
import { SystemHeader } from './components/SystemHeader';
import { TestControls } from './components/TestControls';
import { WaveformChart } from './components/WaveformChart';
import { TestController } from './controller/testController';
import type { ControllerSnapshot, DeviceAdapter, ProfileId, RunMetadata } from './domain/types';
import { downloadFile, resultToCsv, resultToJson } from './storage/exporters';
import { loadResults, saveResult } from './storage/resultStore';

interface AppProps { adapter?: DeviceAdapter; controller?: TestController }
export default function App({ adapter: suppliedAdapter, controller: suppliedController }: AppProps) {
  const adapter = useMemo(() => suppliedAdapter ?? new SimulatorAdapter(), [suppliedAdapter]);
  const controller = useMemo(() => suppliedController ?? new TestController(), [suppliedController]);
  const [snapshot, setSnapshot] = useState<ControllerSnapshot>(() => controller.getSnapshot());
  const [metadata, setMetadata] = useState<RunMetadata>({});
  const [history, setHistory] = useState(() => loadResults());
  const [uiError, setUiError] = useState<string>();
  const savedId = useRef<string | undefined>(undefined);
  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  useEffect(() => {
    if (!snapshot.result || savedId.current === snapshot.result.id) return;
    savedId.current = snapshot.result.id;
    try { setHistory(saveResult(snapshot.result)); } catch (error) { setUiError(error instanceof Error ? error.message : String(error)); }
  }, [snapshot.result]);

  const status = snapshot.state.status;
  const connected = !['disconnected', 'connecting'].includes(status) && Boolean(snapshot.connectionLabel);
  const profileId = 'profileId' in snapshot.state ? snapshot.state.profileId : undefined;
  const run = (action: () => Promise<void>) => { setUiError(undefined); void action().catch(error => setUiError(error instanceof Error ? error.message : String(error))); };
  const selected = snapshot.result;
  const exportResult = (kind: 'json' | 'csv') => {
    if (!selected) return;
    const content = kind === 'json' ? resultToJson(selected) : resultToCsv(selected);
    downloadFile(`stoc-${selected.id}.${kind}`, content, kind === 'json' ? 'application/json' : 'text/csv');
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-control">Skip to test controls</a>
    <SystemHeader status={status} label={snapshot.connectionLabel} />
    {(uiError || status === 'error') && <div className="error-banner" role="alert"><strong>System exception</strong><span>{uiError ?? ('error' in snapshot.state ? snapshot.state.error : 'Unknown error')}</span></div>}
    <main id="main-control" className="dashboard-grid">
      <aside className="setup-column">
        <ConnectionPanel connected={connected} busy={status === 'connecting' || ['firing', 'capturing'].includes(status)} onConnect={() => run(() => controller.connect(adapter))} onDisconnect={() => run(() => controller.disconnect())} />
        <ProfileSelector value={profileId} disabled={status !== 'connected' && status !== 'configured'} onChange={(id: ProfileId) => run(() => controller.selectProfile(id))} />
        <TestControls status={status} canArm={status === 'configured'} canFire={status === 'armed'} metadata={metadata} onMetadata={setMetadata} onArm={() => { try { controller.arm(metadata); } catch (e) { setUiError(e instanceof Error ? e.message : String(e)); } }} onFire={() => run(() => controller.fire())} />
      </aside>
      <section className="monitor-column" aria-label="Live test monitor">
        <div className="monitor-strip"><div><span>MODE</span><strong>SIMULATOR</strong></div><div><span>STATE</span><strong className={`text-${status}`}>{status.toUpperCase()}</strong></div><div><span>MEASUREMENT</span><strong>RAW ADC</strong></div><div><span>CALIBRATION</span><strong>NOT APPLIED</strong></div></div>
        <WaveformChart samples={snapshot.state.samples} />
        <div className="result-row"><ResultSummary result={selected} onJson={() => exportResult('json')} onCsv={() => exportResult('csv')} onPrint={() => window.print()} /><EventTimeline logs={snapshot.logs} /></div>
        <HistoryPanel results={history} />
      </section>
    </main>
    <footer><span>STOC CONTROL / DEMONSTRATION BUILD</span><span>SIMULATOR OUTPUT IS NOT A CALIBRATED CURRENT MEASUREMENT</span></footer>
  </div>;
}
