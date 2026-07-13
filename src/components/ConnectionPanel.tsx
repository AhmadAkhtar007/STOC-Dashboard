import type { AdapterKind } from '../domain/types';
import type { SerialPortDescriptor } from '../electron';
interface Props { connected: boolean; busy: boolean; adapterKind: AdapterKind; connectionLabel?: string; ports?: SerialPortDescriptor[]; selectedPort?: string; onPortChange?: (path: string) => void; onConnect: () => void; onDisconnect: () => void }
export function ConnectionPanel({ connected, busy, adapterKind, connectionLabel, ports, selectedPort, onPortChange, onConnect, onDisconnect }: Props) {
  const adapterName = adapterKind === 'simulator' ? 'simulator' : 'Proteus serial';
  const needsPort = adapterKind === 'serial' && ports !== undefined && !selectedPort;
  return <section className="panel connection-panel" aria-labelledby="connection-title">
    <div className="panel-heading"><span className="section-index">01</span><div><p className="eyebrow">Device link</p><h2 id="connection-title">Connection</h2></div></div>
    <div className="connection-readout"><span className={connected ? 'signal active' : 'signal'} aria-hidden="true" />
      <div><small>Transport</small><strong>{connectionLabel ?? (adapterKind === 'simulator' ? 'Built-in simulator' : 'Proteus / Arduino serial')}</strong><p>{adapterKind === 'simulator' ? 'Deterministic · local · 9600 protocol model' : 'Desktop serial transport · 9600 8N1'}</p></div></div>
    {adapterKind === 'serial' && <label className="port-field">Serial port
      <select aria-label="Serial port" value={selectedPort ?? ''} disabled={busy || connected} onChange={(event) => onPortChange?.(event.target.value)}>
        {ports?.length ? ports.map((port) => <option key={port.path} value={port.path}>{port.path}{port.manufacturer ? ` — ${port.manufacturer}` : ''}</option>) : <option value="">No serial ports detected</option>}
      </select>
    </label>}
    <button className="secondary-button" disabled={busy || (!connected && needsPort)} onClick={connected ? onDisconnect : onConnect}>
      {connected ? `Disconnect ${adapterName}` : `Connect ${adapterName}`}
    </button>
  </section>;
}
