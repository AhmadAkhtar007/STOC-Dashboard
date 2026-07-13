import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../../src/App';
import { SimulatorAdapter } from '../../src/adapters/simulatorAdapter';
import { TestController } from '../../src/controller/testController';
import type { DeviceAdapter, DeviceEvent, TestProfile } from '../../src/domain/types';

class SerialDemoAdapter implements DeviceAdapter {
  readonly kind = 'serial' as const;
  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  async connect() { this.emit({ type: 'connected', label: 'Proteus · COM7' }); }
  async disconnect() { this.emit({ type: 'disconnected' }); }
  async selectProfile(profile: TestProfile) { this.emit({ type: 'mode-confirmed', profileId: profile.id }); }
  async fire() { this.emit({ type: 'firing' }); this.emit({ type: 'fire-complete' }); this.emit({ type: 'waveform', samples: [512, 700] }); }
  subscribe(listener: (event: DeviceEvent) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private emit(event: DeviceEvent) { this.listeners.forEach(listener => listener(event)); }
}

function renderDashboard() {
  const adapter = new SimulatorAdapter();
  const controller = new TestController({ createId: () => 'demo-run' });
  return render(<App adapter={adapter} controller={controller} />);
}

async function configureRun() {
  renderDashboard();
  const fire = screen.getByRole('button', { name: /hold to fire/i });
  expect(fire).toBeDisabled();

  await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
  await act(async () => screen.getByRole('radio', { name: /single phase/i }).click());
  fireEvent.change(screen.getByRole('textbox', { name: /meter serial/i }), { target: { value: 'MTR-2048' } });
  fireEvent.change(screen.getByRole('textbox', { name: /operator name/i }), { target: { value: 'A. Operator' } });
  screen.getByRole('button', { name: /arm test/i }).click();
  return fire;
}

describe('STOC operator dashboard', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('completes a simulator run through the guarded operator flow', async () => {
    const fire = await configureRun();
    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    await act(async () => vi.advanceTimersByTimeAsync(10));

    expect(screen.getByRole('status', { name: /test outcome/i })).toHaveTextContent(/sequence complete/i);
    expect(screen.getByRole('img', { name: /raw adc waveform/i })).toHaveAccessibleDescription(/raw adc scale 0 to 1023.*sample index/i);
    expect(screen.getByRole('status', { name: /waveform sample count/i })).toHaveTextContent('200 samples');
    expect(screen.getByRole('note', { name: /measurement limitation/i })).toHaveTextContent(/simulated data/i);
    expect(screen.getByRole('group', { name: /run instrumentation/i })).toHaveTextContent('200');
    expect(screen.getByRole('group', { name: /run instrumentation/i })).toHaveTextContent(/simulator/i);
    expect(screen.getByRole('list', { name: /test history/i })).toHaveTextContent('MTR-2048');
    expect(screen.getByRole('list', { name: /test history/i })).toHaveTextContent(/simulator/i);
    expect(screen.getByRole('button', { name: /export json/i })).toBeEnabled();
  }, 10_000);

  it('cancels an incomplete pointer hold and fires only after the full hold', async () => {
    const fire = await configureRun();
    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(700));
    fireEvent.pointerUp(fire);
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(screen.queryByRole('status', { name: /test outcome/i })).not.toBeInTheDocument();

    fireEvent.pointerDown(fire);
    await act(async () => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.getByRole('status', { name: /controller state/i })).toHaveTextContent(/capturing|firing/i);
  });

  it('offers an explicit keyboard confirmation instead of an inaccessible hold gesture', async () => {
    const fire = await configureRun();
    fire.focus();
    fireEvent.keyDown(fire, { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: /confirm test firing/i })).toBeInTheDocument();
    screen.getByRole('button', { name: /confirm fire/i }).click();
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole('status', { name: /test outcome/i })).toHaveTextContent(/sequence complete/i);
  });

  it('surfaces controller errors as an alert', async () => {
    const controller = new TestController();
    render(<App adapter={new SimulatorAdapter()} controller={controller} />);
    await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
    controller.disconnect = vi.fn(async () => { throw new Error('Transport close failed'); });
    await act(async () => screen.getByRole('button', { name: /^disconnect simulator$/i }).click());
    expect(screen.getByRole('alert')).toHaveTextContent('Transport close failed');
  });

  it('uses the active adapter identity instead of simulator labels', async () => {
    render(<App adapter={new SerialDemoAdapter()} controller={new TestController()} />);
    expect(screen.getByRole('button', { name: /connect proteus/i })).toBeInTheDocument();
    await act(async () => screen.getByRole('button', { name: /connect proteus/i }).click());
    expect(screen.getByRole('status', { name: /active adapter/i })).toHaveTextContent('Proteus · COM7');
    expect(screen.queryByRole('note', { name: /measurement limitation/i })).toHaveTextContent(/serial device data/i);
  });

  it('keeps a failed result unsaved and retries persistence explicitly', async () => {
    let throwing = true;
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: key => values.get(key) ?? null,
      key: index => [...values.keys()][index] ?? null,
      removeItem: key => { values.delete(key); },
      setItem: (key, value) => { if (throwing) throw new Error('Storage unavailable'); values.set(key, value); },
    };
    render(<App adapter={new SimulatorAdapter()} controller={new TestController({ createId: () => 'retry-run' })} storage={storage} />);
    await act(async () => screen.getByRole('button', { name: /connect simulator/i }).click());
    await act(async () => screen.getByRole('radio', { name: /single phase/i }).click());
    await act(async () => screen.getByRole('button', { name: /arm test/i }).click());
    fireEvent.keyDown(screen.getByRole('button', { name: /hold to fire/i }), { key: 'Enter' });
    screen.getByRole('button', { name: /confirm fire/i }).click();
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(screen.getByRole('alert')).toHaveTextContent(/could not be saved/i);
    expect(screen.getByRole('button', { name: /retry save/i })).toBeInTheDocument();
    throwing = false;
    await act(async () => screen.getByRole('button', { name: /retry save/i }).click());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(values.size).toBe(1);
  });
});
