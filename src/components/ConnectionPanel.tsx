import type { AdapterKind } from '../domain/types';
interface Props { connected: boolean; busy: boolean; adapterKind: AdapterKind; connectionLabel?: string; onConnect: () => void; onDisconnect: () => void }
export function ConnectionPanel({ connected, busy, adapterKind, connectionLabel, onConnect, onDisconnect }: Props) {
  const adapterName = adapterKind === 'simulator' ? 'simulator' : 'Proteus serial';
  return <section className="panel connection-panel" aria-labelledby="connection-title">
    <div className="panel-heading"><span className="section-index">01</span><div><p className="eyebrow">Device link</p><h2 id="connection-title">Connection</h2></div></div>
    <div className="connection-readout"><span className={connected ? 'signal active' : 'signal'} aria-hidden="true" />
      <div><small>Transport</small><strong>{connectionLabel ?? (adapterKind === 'simulator' ? 'Built-in simulator' : 'Proteus / Arduino serial')}</strong><p>{adapterKind === 'simulator' ? 'Deterministic · local · 9600 protocol model' : 'Desktop serial transport · 9600 8N1'}</p></div></div>
    <button className="secondary-button" disabled={busy} onClick={connected ? onDisconnect : onConnect}>
      {connected ? `Disconnect ${adapterName}` : `Connect ${adapterName}`}
    </button>
  </section>;
}
