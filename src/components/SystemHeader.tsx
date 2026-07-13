import type { TestStatus } from '../domain/types';

export function SystemHeader({ status, label }: { status: TestStatus; label?: string }) {
  const connected = status !== 'disconnected' && status !== 'connecting' && !(status === 'error' && !label);
  return <header className="system-header">
    <div className="brand-mark" aria-hidden="true"><span>ST</span><span>OC</span></div>
    <div><p className="eyebrow">Short-time over-current laboratory</p><h1>Energy Meter Test System</h1></div>
    <div className={`system-state state-${status}`}><span className="status-lamp" />
      <div><small>System status</small><strong>{connected ? label ?? status : status}</strong></div>
    </div>
  </header>;
}
