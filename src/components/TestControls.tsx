import { useEffect, useRef, useState } from 'react';
import type { RunMetadata, TestStatus } from '../domain/types';

interface Props { status: TestStatus; canArm: boolean; canFire: boolean; metadata: RunMetadata; onMetadata: (metadata: RunMetadata) => void; onArm: () => void; onFire: () => void }
export function TestControls({ status, canArm, canFire, metadata, onMetadata, onArm, onFire }: Props) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const pointerId = useRef<number | undefined>(undefined);
  const [holding, setHolding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const clearHold = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const activePointer = pointerId.current;
    if (activePointer !== undefined && triggerRef.current?.hasPointerCapture?.(activePointer)) triggerRef.current.releasePointerCapture(activePointer);
    pointerId.current = undefined;
    setHolding(false);
  };
  useEffect(() => {
    const interrupt = () => clearHold();
    const visibility = () => { if (document.hidden) clearHold(); };
    window.addEventListener('blur', interrupt);
    document.addEventListener('visibilitychange', visibility);
    return () => { clearHold(); window.removeEventListener('blur', interrupt); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!canFire) { clearHold(); setConfirming(false); }
  }, [canFire]);
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
    else triggerRef.current?.focus();
  }, [confirming]);
  const beginHold = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!canFire || timer.current) return;
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setHolding(true);
    timer.current = setTimeout(() => { timer.current = null; setHolding(false); onFire(); }, 1_000);
  };
  return <section className={`panel controls-panel ${status === 'armed' ? 'is-armed' : ''}`} aria-labelledby="controls-title">
    <div className="panel-heading"><span className="section-index">03</span><div><p className="eyebrow">Operator gate</p><h2 id="controls-title">Arm & fire</h2></div></div>
    <div className="metadata-grid">
      <label>Meter serial<input aria-label="Meter serial" value={metadata.meterSerialNumber ?? ''} disabled={!canArm} onChange={e => onMetadata({ ...metadata, meterSerialNumber: e.target.value })} placeholder="e.g. MTR-2048" /></label>
      <label>Operator name<input aria-label="Operator name" value={metadata.operatorName ?? ''} disabled={!canArm} onChange={e => onMetadata({ ...metadata, operatorName: e.target.value })} placeholder="Optional" /></label>
    </div>
    <label>Run notes<textarea aria-label="Run notes" value={metadata.notes ?? ''} disabled={!canArm} onChange={e => onMetadata({ ...metadata, notes: e.target.value })} placeholder="Bench condition or observation" /></label>
    <button className="arm-button" onClick={onArm} disabled={!canArm}>Arm test</button>
    <button ref={triggerRef} className={`fire-button ${holding ? 'holding' : ''}`} disabled={!canFire} onPointerDown={beginHold} onPointerUp={clearHold} onPointerLeave={clearHold} onPointerCancel={clearHold} onLostPointerCapture={clearHold}
      onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && canFire) { e.preventDefault(); setConfirming(true); } }}>
      <span className="hold-fill" aria-hidden="true" /><span>{holding ? 'Keep holding — 1 second required' : 'Hold to fire — 1 second'}</span>
    </button>
    <p className="safety-copy">Pointer: hold continuously. Keyboard: press Enter or Space, then confirm.</p>
    {confirming && <div className="dialog-backdrop"><div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="confirm-dialog" onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setConfirming(false); } }}>
      <p className="eyebrow">Final authorization</p><h3 id="confirm-title">Confirm test firing</h3><p>This starts the selected test sequence. Controls lock until capture completes.</p>
      <div><button className="secondary-button" onClick={() => setConfirming(false)}>Cancel</button><button ref={confirmRef} className="confirm-fire" onClick={() => { if (!canFire) return; setConfirming(false); onFire(); }}>Confirm fire</button></div>
    </div></div>}
  </section>;
}
