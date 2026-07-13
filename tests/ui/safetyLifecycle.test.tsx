import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../src/App';
import { SimulatorAdapter } from '../../src/adapters/simulatorAdapter';
import { TestControls } from '../../src/components/TestControls';
import { TestController } from '../../src/controller/testController';
import type { DeviceAdapter, DeviceEvent, RunMetadata, TestProfile } from '../../src/domain/types';

const metadata: RunMetadata = {};
function renderControls(onFire = vi.fn()) {
  const view = render(<TestControls status="armed" canArm={false} canFire metadata={metadata} onMetadata={() => undefined} onArm={() => undefined} onFire={onFire} />);
  return { ...view, onFire, trigger: screen.getByRole('button', { name: /hold to fire/i }) };
}

class SerialAdapter implements DeviceAdapter {
  readonly kind = 'serial' as const;
  disconnect = vi.fn(async () => undefined);
  connect = async () => { this.emit({ type: 'connected', label: 'COM9' }); };
  selectProfile = async (profile: TestProfile) => { this.emit({ type: 'mode-confirmed', profileId: profile.id }); };
  fire = async () => undefined;
  private listeners = new Set<(event: DeviceEvent) => void>();
  subscribe(listener: (event: DeviceEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: DeviceEvent) { this.listeners.forEach(listener => listener(event)); }
}

describe('dashboard safety lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it.each(['lostPointerCapture', 'blur', 'visibilitychange'] as const)('cancels a firing hold after %s interruption', async interruption => {
    const { trigger, onFire } = renderControls();
    Object.defineProperty(trigger, 'setPointerCapture', { value: vi.fn(), configurable: true });
    fireEvent.pointerDown(trigger, { pointerId: 7 });
    if (interruption === 'lostPointerCapture') fireEvent.lostPointerCapture(trigger);
    if (interruption === 'blur') fireEvent.blur(window);
    if (interruption === 'visibilitychange') {
      Object.defineProperty(document, 'hidden', { value: true, configurable: true });
      fireEvent(document, new Event('visibilitychange'));
    }
    await act(async () => vi.advanceTimersByTimeAsync(1_100));
    expect(onFire).not.toHaveBeenCalled();
  });

  it('moves focus into keyboard confirmation, cancels with Escape, and restores trigger focus', () => {
    const { trigger } = renderControls();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('button', { name: /confirm fire/i })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes confirmation and cannot fire when authorization is revoked', () => {
    const onFire = vi.fn();
    const view = render(<TestControls status="armed" canArm={false} canFire metadata={metadata} onMetadata={() => undefined} onArm={() => undefined} onFire={onFire} />);
    const trigger = screen.getByRole('button', { name: /hold to fire/i });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    view.rerender(<TestControls status="firing" canArm={false} canFire={false} metadata={metadata} onMetadata={() => undefined} onArm={() => undefined} onFire={onFire} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onFire).not.toHaveBeenCalled();
  });

  it('disconnects an internally owned adapter on unmount but leaves injected collaborators alone', async () => {
    const owned = new SimulatorAdapter();
    const ownedDisconnect = vi.spyOn(owned, 'disconnect');
    const ownedView = render(<App createAdapter={() => owned} createController={() => new TestController()} />);
    await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
    ownedView.unmount();
    await act(async () => Promise.resolve());
    expect(ownedDisconnect).toHaveBeenCalledOnce();

    const injected = new SerialAdapter();
    const injectedController = new TestController();
    const injectedView = render(<App adapter={injected} controller={injectedController} />);
    await act(async () => screen.getByRole('button', { name: /connect proteus/i }).click());
    injectedView.unmount();
    await act(async () => Promise.resolve());
    expect(injected.disconnect).not.toHaveBeenCalled();
  });

  it('tracks partial adapter and controller ownership independently', async () => {
    const externalController = new TestController();
    const externalDisconnect = vi.spyOn(externalController, 'disconnect');
    const ownedAdapter = new SimulatorAdapter();
    const ownedAdapterDisconnect = vi.spyOn(ownedAdapter, 'disconnect');
    const first = render(<App controller={externalController} createAdapter={() => ownedAdapter} />);
    await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
    first.unmount();
    await act(async () => Promise.resolve());
    expect(ownedAdapterDisconnect).toHaveBeenCalledOnce();
    expect(externalDisconnect).not.toHaveBeenCalled();

    const externalAdapter = new SerialAdapter();
    const ownedController = new TestController();
    const dispose = vi.spyOn(ownedController, 'dispose');
    const second = render(<App adapter={externalAdapter} createController={() => ownedController} />);
    await act(async () => screen.getByRole('button', { name: /connect proteus/i }).click());
    second.unmount();
    await act(async () => Promise.resolve());
    expect(dispose).toHaveBeenCalledWith(false);
    expect(externalAdapter.disconnect).not.toHaveBeenCalled();
  });

  it('does not steal focus on mount and traps focus while confirmation is open', () => {
    const before = document.createElement('button');
    document.body.append(before);
    before.focus();
    const { trigger } = renderControls();
    expect(before).toHaveFocus();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const confirm = screen.getByRole('button', { name: /confirm fire/i });
    const cancel = screen.getByRole('button', { name: /^cancel$/i });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    before.remove();
  });

  it('uses neutral safety copy for a serial test sequence', async () => {
    const { trigger } = renderControls();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toHaveTextContent(/selected test sequence/i);
    expect(screen.getByRole('dialog')).not.toHaveTextContent(/simulated current/i);
  });
});
