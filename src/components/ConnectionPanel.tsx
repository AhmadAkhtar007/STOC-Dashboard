interface Props { connected: boolean; busy: boolean; onConnect: () => void; onDisconnect: () => void }
export function ConnectionPanel({ connected, busy, onConnect, onDisconnect }: Props) {
  return <section className="panel connection-panel" aria-labelledby="connection-title">
    <div className="panel-heading"><span className="section-index">01</span><div><p className="eyebrow">Device link</p><h2 id="connection-title">Connection</h2></div></div>
    <div className="connection-readout"><span className={connected ? 'signal active' : 'signal'} aria-hidden="true" />
      <div><small>Transport</small><strong>Built-in simulator</strong><p>Deterministic · local · 9600 protocol model</p></div></div>
    <button className="secondary-button" disabled={busy} onClick={connected ? onDisconnect : onConnect}>
      {connected ? 'Disconnect simulator' : 'Connect simulator'}
    </button>
  </section>;
}
