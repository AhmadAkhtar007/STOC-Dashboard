import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ElectronSerialAdapter } from './adapters/electronSerialAdapter';
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
import type { SerialPortDescriptor } from './electron';

interface AppProps { adapter?: DeviceAdapter; controller?: TestController; createAdapter?: () => DeviceAdapter; createController?: () => TestController; storage?: Storage }
export default function App({ adapter: suppliedAdapter, controller: suppliedController, createAdapter, createController, storage = localStorage }: AppProps) {
  const adapter = useMemo(() => suppliedAdapter ?? createAdapter?.() ?? createDefaultAdapter(), [suppliedAdapter, createAdapter]);
  const controller = useMemo(() => suppliedController ?? createController?.() ?? new TestController(), [suppliedController, createController]);
  const ownsAdapter = suppliedAdapter === undefined;
  const ownsController = suppliedController === undefined;
  const [snapshot, setSnapshot] = useState<ControllerSnapshot>(() => controller.getSnapshot());
  const [metadata, setMetadata] = useState<RunMetadata>({});
  const [history, setHistory] = useState(() => loadResults(storage));
  const [uiError, setUiError] = useState<string>();
  const [ports, setPorts] = useState<SerialPortDescriptor[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>();
  const [portsLoading, setPortsLoading] = useState(false);
  const [portError, setPortError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [unsavedResult, setUnsavedResult] = useState<ControllerSnapshot['result']>();
  const savedId = useRef<string | undefined>(undefined);
  const portRequest = useRef(0);
  const serialAdapter = adapter instanceof ElectronSerialAdapter ? adapter : undefined;
  useEffect(() => controller.subscribe(setSnapshot), [controller]);
  const refreshPorts = useCallback(async () => {
    if (!serialAdapter) return;
    const request = ++portRequest.current;
    setPortsLoading(true);
    setPortError(undefined);
    try {
      const availablePorts = await serialAdapter.listPorts();
      if (request !== portRequest.current) return;
      setPorts(availablePorts);
      setSelectedPort((current) => availablePorts.some((port) => port.path === current) ? current : availablePorts[0]?.path);
    } catch (error) {
      if (request !== portRequest.current) return;
      setPorts([]);
      setSelectedPort(undefined);
      setPortError(error instanceof Error ? error.message : String(error));
    } finally {
      if (request === portRequest.current) setPortsLoading(false);
    }
  }, [serialAdapter]);
  useEffect(() => {
    if (!serialAdapter) return;
    void refreshPorts();
    return () => { portRequest.current += 1; };
  }, [refreshPorts, serialAdapter]);
  useEffect(() => () => {
    if (ownsController) void controller.dispose(ownsAdapter).catch(() => undefined);
    else if (ownsAdapter) {
      controller.detachAdapter(adapter);
      void adapter.disconnect().catch(() => undefined);
    }
  }, [adapter, controller, ownsAdapter, ownsController]);
  useEffect(() => {
    if (!snapshot.result || savedId.current === snapshot.result.id) return;
    try {
      setHistory(saveResult(snapshot.result, storage));
      savedId.current = snapshot.result.id;
      setUnsavedResult(undefined);
      setSaveError(undefined);
    } catch (error) {
      setUnsavedResult(snapshot.result);
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  }, [snapshot.result, storage]);

  const status = snapshot.state.status;
  const connected = !['disconnected', 'connecting'].includes(status) && Boolean(snapshot.connectionLabel);
  const profileId = 'profileId' in snapshot.state ? snapshot.state.profileId : undefined;
  const run = (action: () => Promise<void>) => { setUiError(undefined); void action().catch(error => setUiError(error instanceof Error ? error.message : String(error))); };
  const connectDevice = async () => {
    try {
      await controller.connect(adapter, selectedPort);
    } catch (error) {
      await refreshPorts();
      throw error;
    }
  };
  const disconnectDevice = async () => {
    await controller.disconnect();
    await refreshPorts();
  };
  const selected = snapshot.result;
  const retrySave = () => {
    if (!unsavedResult) return;
    try {
      setHistory(saveResult(unsavedResult, storage));
      savedId.current = unsavedResult.id;
      setUnsavedResult(undefined);
      setSaveError(undefined);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
    }
  };
  const exportResult = (kind: 'json' | 'csv') => {
    if (!selected) return;
    const content = kind === 'json' ? resultToJson(selected) : resultToCsv(selected);
    downloadFile(`stoc-${selected.id}.${kind}`, content, kind === 'json' ? 'application/json' : 'text/csv');
  };

  return <div className="app-shell">
    <a className="skip-link" href="#main-control">Skip to test controls</a>
    <SystemHeader status={status} label={snapshot.connectionLabel} />
    {(saveError || uiError || status === 'error') && <div className="error-banner" role="alert"><strong>System exception</strong><span>{saveError ?? uiError ?? ('error' in snapshot.state ? snapshot.state.error : 'Unknown error')}</span>{unsavedResult && <button onClick={retrySave}>Retry save</button>}</div>}
    <main id="main-control" className="dashboard-grid">
      <aside className="setup-column">
        <ConnectionPanel connected={connected} busy={status === 'connecting' || ['firing', 'capturing'].includes(status)} adapterKind={adapter.kind} connectionLabel={snapshot.connectionLabel} ports={serialAdapter ? ports : undefined} selectedPort={selectedPort} portsLoading={portsLoading} portError={portError} onPortChange={setSelectedPort} onRefreshPorts={() => { void refreshPorts(); }} onConnect={() => run(connectDevice)} onDisconnect={() => run(disconnectDevice)} />
        <ProfileSelector value={profileId} disabled={status !== 'connected' && status !== 'configured'} onChange={(id: ProfileId) => run(() => controller.selectProfile(id))} />
        <TestControls status={status} canArm={status === 'configured'} canFire={status === 'armed'} metadata={metadata} onMetadata={setMetadata} onArm={() => { try { controller.arm(metadata); } catch (e) { setUiError(e instanceof Error ? e.message : String(e)); } }} onFire={() => run(() => controller.fire())} />
      </aside>
      <section className="monitor-column" aria-label="Live test monitor">
        <div className="monitor-strip"><div><span>ADAPTER</span><strong role="status" aria-label="Active adapter">{snapshot.connectionLabel ?? (adapter.kind === 'simulator' ? 'SIMULATOR' : 'SERIAL')}</strong></div><div><span>STATE</span><strong role="status" aria-label="Controller state" className={`text-${status}`}>{status.toUpperCase()}</strong></div><div><span>MEASUREMENT</span><strong>RAW ADC</strong></div><div><span>CALIBRATION</span><strong>NOT APPLIED</strong></div></div>
        <WaveformChart samples={snapshot.state.samples} simulated={adapter.kind === 'simulator'} />
        <div className="result-row"><ResultSummary result={selected} onJson={() => exportResult('json')} onCsv={() => exportResult('csv')} onPrint={() => window.print()} /><EventTimeline logs={snapshot.logs} /></div>
        <HistoryPanel results={history} />
      </section>
    </main>
    <footer><span>STOC CONTROL / DEMONSTRATION BUILD</span><span>{adapter.kind === 'simulator' ? 'SIMULATOR OUTPUT' : 'SERIAL INPUT'} IS NOT A CALIBRATED CURRENT MEASUREMENT</span></footer>
  </div>;
}

function createDefaultAdapter(): DeviceAdapter {
  return window.stocDesktop ? new ElectronSerialAdapter(window.stocDesktop) : new SimulatorAdapter();
}
