import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TestController } from '../../src/controller/testController';
import { PROFILES } from '../../src/domain/profiles';
import type { DeviceAdapter, DeviceEvent, RunMetadata, TestProfile } from '../../src/domain/types';

class FakeAdapter implements DeviceAdapter {
  readonly kind = 'simulator' as const;
  readonly listeners = new Set<(event: DeviceEvent) => void>();
  connect = vi.fn(async (_target?: string) => undefined);
  disconnect = vi.fn(async () => undefined);
  selectProfile = vi.fn(async (_profile: TestProfile) => undefined);
  fire = vi.fn(async () => undefined);

  subscribe(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event: DeviceEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const metadata: RunMetadata = {
  meterSerialNumber: 'MTR-42',
  operatorName: 'A. Operator',
  notes: 'Bench run',
};

async function connectedController() {
  const adapter = new FakeAdapter();
  const controller = new TestController({
    now: () => 1_000,
    createId: () => 'run-id',
  });
  const connecting = controller.connect(adapter, 'COM7');
  adapter.emit({ type: 'connected', label: 'Fake STOC' });
  await connecting;
  return { adapter, controller };
}

async function configuredController() {
  const setup = await connectedController();
  const selecting = setup.controller.selectProfile('single-phase');
  setup.adapter.emit({ type: 'mode-confirmed', profileId: 'single-phase' });
  await selecting;
  return setup;
}

describe('TestController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('invokes default browser timer dependencies with the global receiver', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const receiverSensitiveSetTimeout = vi.fn(function (
      this: unknown,
      _callback: () => void,
      _delayMs?: number,
    ) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return 41 as ReturnType<typeof globalThis.setTimeout>;
    });
    const receiverSensitiveClearTimeout = vi.fn(function (this: unknown, _timerId: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
    });
    globalThis.setTimeout = receiverSensitiveSetTimeout as typeof globalThis.setTimeout;
    globalThis.clearTimeout = receiverSensitiveClearTimeout as typeof globalThis.clearTimeout;

    try {
      const adapter = new FakeAdapter();
      const controller = new TestController();
      const connecting = controller.connect(adapter);
      adapter.emit({ type: 'connected', label: 'Receiver-safe' });

      await expect(connecting).resolves.toBeUndefined();
      expect(receiverSensitiveSetTimeout).toHaveBeenCalledOnce();
      expect(receiverSensitiveClearTimeout).toHaveBeenCalledWith(41);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('completes a run and creates a raw sequence result with defensive sample copies', async () => {
    const { adapter, controller } = await configuredController();
    const snapshots: string[] = [];
    controller.subscribe((snapshot) => snapshots.push(snapshot.state.status));
    controller.arm(metadata);

    const firing = controller.fire();
    adapter.emit({ type: 'firing' });
    adapter.emit({ type: 'fire-complete' });
    const samples = [512, 900, 640];
    adapter.emit({ type: 'waveform', samples });
    await firing;
    samples[1] = 1;

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.status).toBe('complete');
    expect(snapshots).toContain('capturing');
    expect(snapshot.result).toEqual({
      id: 'run-id',
      startedAt: 1_000,
      completedAt: 1_000,
      adapterKind: 'simulator',
      metadata,
      profile: PROFILES['single-phase'],
      samples: [512, 900, 640],
      rawPeak: 900,
      outcome: 'sequence-complete',
    });
    expect(snapshot.result).not.toHaveProperty('amps');
    expect(adapter.connect).toHaveBeenCalledWith('COM7');
  });

  it('retains a bounded diagnostic result when an accepted run fails', async () => {
    const { adapter, controller } = await configuredController();
    controller.arm(metadata);
    const firing = controller.fire();
    adapter.emit({ type: 'firing' });
    for (let index = 0; index < 75; index += 1) {
      adapter.emit({ type: 'diagnostic', message: `diagnostic-${index}` });
    }
    adapter.emit({ type: 'error', message: 'SCR feedback lost' });

    await expect(firing).rejects.toThrow('SCR feedback lost');
    const result = controller.getSnapshot().result;
    expect(result).toMatchObject({
      id: 'run-id',
      startedAt: 1_000,
      completedAt: 1_000,
      outcome: 'failed',
      failureMessage: 'SCR feedback lost',
      samples: [],
      rawPeak: 0,
    });
    expect(result?.diagnosticTrace).toHaveLength(50);
    expect(result?.diagnosticTrace.at(-1)).toMatchObject({
      level: 'error',
      message: 'SCR feedback lost',
    });
    expect(result?.diagnosticTrace.some(({ message }) => message === 'diagnostic-0')).toBe(false);
  });

  it('does not fabricate a run result when setup fails before fire', async () => {
    const adapter = new FakeAdapter();
    adapter.connect.mockRejectedValue(new Error('port unavailable'));
    const controller = new TestController();

    await expect(controller.connect(adapter)).rejects.toThrow('port unavailable');
    expect(controller.getSnapshot().result).toBeUndefined();
  });

  it('ignores completion and waveform events until firing is acknowledged', async () => {
    const { adapter, controller } = await configuredController();
    controller.arm(metadata);
    const firing = controller.fire();

    adapter.emit({ type: 'fire-complete' });
    adapter.emit({ type: 'waveform', samples: [512, 900] });

    expect(controller.getSnapshot()).toMatchObject({
      state: { status: 'firing', samples: [] },
      result: undefined,
    });

    adapter.emit({ type: 'firing' });
    adapter.emit({ type: 'fire-complete' });
    adapter.emit({ type: 'waveform', samples: [512, 900] });
    await firing;

    expect(controller.getSnapshot().state.status).toBe('complete');
  });

  it('rejects premature and repeated fire without sending extra adapter commands', async () => {
    const { adapter, controller } = await configuredController();
    await expect(controller.fire()).rejects.toThrow('Test is not armed');
    controller.arm(metadata);
    const first = controller.fire();
    await expect(controller.fire()).rejects.toThrow('Test is not armed');
    expect(adapter.fire).toHaveBeenCalledTimes(1);
    adapter.emit({ type: 'firing' });
    adapter.emit({ type: 'error', message: 'stop' });
    await expect(first).rejects.toThrow('stop');
  });

  it.each([
    ['connection', 3_000, async (controller: TestController, adapter: FakeAdapter) => controller.connect(adapter)],
    ['mode confirmation', 2_000, async (controller: TestController, adapter: FakeAdapter) => {
      const connecting = controller.connect(adapter);
      adapter.emit({ type: 'connected', label: 'Fake' });
      await connecting;
      return controller.selectProfile('single-phase');
    }],
    ['firing acknowledgement', 2_000, async (controller: TestController, adapter: FakeAdapter) => {
      const connecting = controller.connect(adapter);
      adapter.emit({ type: 'connected', label: 'Fake' });
      await connecting;
      const selecting = controller.selectProfile('single-phase');
      adapter.emit({ type: 'mode-confirmed', profileId: 'single-phase' });
      await selecting;
      controller.arm(metadata);
      return controller.fire();
    }],
  ])('settles with an error on %s timeout', async (_name, delay, start) => {
    const adapter = new FakeAdapter();
    const controller = new TestController();
    const pending = start(controller, adapter);
    const rejection = expect(pending).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(delay);
    await rejection;
    expect(controller.getSnapshot().state.status).toBe('error');
  });

  it('times out waveform completion after profile duration plus three seconds', async () => {
    const { adapter, controller } = await configuredController();
    controller.arm(metadata);
    const pending = controller.fire();
    const rejection = expect(pending).rejects.toThrow(/waveform.*timed out/i);
    adapter.emit({ type: 'firing' });
    await vi.advanceTimersByTimeAsync(PROFILES['single-phase'].durationMs + 3_000);
    await rejection;
    expect(controller.getSnapshot().state.status).toBe('error');
  });

  it('settles active work and returns to disconnected on connection loss', async () => {
    const { adapter, controller } = await configuredController();
    controller.arm(metadata);
    const pending = controller.fire();
    adapter.emit({ type: 'disconnected' });
    await expect(pending).rejects.toThrow(/disconnected/i);
    expect(controller.getSnapshot().state.status).toBe('disconnected');
  });

  it('ignores stale events from an old adapter after reconnecting', async () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const controller = new TestController();
    const firstConnection = controller.connect(first);
    first.emit({ type: 'connected', label: 'First' });
    await firstConnection;
    await controller.disconnect();
    const secondConnection = controller.connect(second);
    first.emit({ type: 'error', message: 'stale failure' });
    second.emit({ type: 'connected', label: 'Second' });
    await secondConnection;
    expect(controller.getSnapshot().state.status).toBe('connected');
  });

  it('isolates subscriber exceptions and unsubscribes cleanly', async () => {
    const adapter = new FakeAdapter();
    const controller = new TestController();
    controller.subscribe(() => { throw new Error('observer bug'); });
    const healthy = vi.fn();
    const unsubscribe = controller.subscribe(healthy);
    const pending = controller.connect(adapter);
    adapter.emit({ type: 'connected', label: 'Fake' });
    await pending;
    expect(healthy).toHaveBeenCalled();
    unsubscribe();
    const count = healthy.mock.calls.length;
    await controller.disconnect();
    expect(healthy).toHaveBeenCalledTimes(count);
  });

  it('ignores a stale connect rejection after a replacement connection starts', async () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const oldCommand = deferred();
    first.connect.mockImplementation(() => oldCommand.promise);
    const controller = new TestController();
    const oldConnection = controller.connect(first);
    const oldSettlement = expect(oldConnection).rejects.toThrow(/disconnected/i);
    await controller.disconnect();
    await oldSettlement;

    const currentConnection = controller.connect(second);
    oldCommand.reject(new Error('late old connect failure'));
    await Promise.resolve();
    expect(controller.getSnapshot().state.status).toBe('connecting');
    second.emit({ type: 'connected', label: 'Current' });
    await currentConnection;
    expect(controller.getSnapshot().state.status).toBe('connected');
  });

  it('ignores a stale profile rejection while a replacement profile operation is active', async () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const oldCommand = deferred();
    first.selectProfile.mockImplementation(() => oldCommand.promise);
    const controller = new TestController();
    let connection = controller.connect(first);
    first.emit({ type: 'connected', label: 'First' });
    await connection;
    const oldSelection = controller.selectProfile('single-phase');
    const oldSettlement = expect(oldSelection).rejects.toThrow(/disconnected/i);
    await controller.disconnect();
    await oldSettlement;
    connection = controller.connect(second);
    second.emit({ type: 'connected', label: 'Second' });
    await connection;

    const currentSelection = controller.selectProfile('ltct');
    oldCommand.reject(new Error('late old profile failure'));
    await Promise.resolve();
    expect(controller.getSnapshot().state.status).toBe('connected');
    second.emit({ type: 'mode-confirmed', profileId: 'ltct' });
    await currentSelection;
    expect(controller.getSnapshot().state).toMatchObject({ status: 'configured', profileId: 'ltct' });
  });

  it('ignores a stale fire rejection while a replacement run is active', async () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const oldCommand = deferred();
    first.fire.mockImplementation(() => oldCommand.promise);
    const controller = new TestController();
    let connection = controller.connect(first);
    first.emit({ type: 'connected', label: 'First' });
    await connection;
    let selection = controller.selectProfile('single-phase');
    first.emit({ type: 'mode-confirmed', profileId: 'single-phase' });
    await selection;
    controller.arm(metadata);
    const oldFire = controller.fire();
    const oldSettlement = expect(oldFire).rejects.toThrow(/disconnected/i);
    await controller.disconnect();
    await oldSettlement;

    connection = controller.connect(second);
    second.emit({ type: 'connected', label: 'Second' });
    await connection;
    selection = controller.selectProfile('single-phase');
    second.emit({ type: 'mode-confirmed', profileId: 'single-phase' });
    await selection;
    controller.arm(metadata);
    const currentFire = controller.fire();
    oldCommand.reject(new Error('late old fire failure'));
    await Promise.resolve();
    expect(controller.getSnapshot().state.status).toBe('firing');
    second.emit({ type: 'firing' });
    second.emit({ type: 'fire-complete' });
    second.emit({ type: 'waveform', samples: [512, 700] });
    await currentFire;
    expect(controller.getSnapshot().state.status).toBe('complete');
  });

  it('fails and settles the current operation when its adapter command rejects', async () => {
    const adapter = new FakeAdapter();
    adapter.connect.mockRejectedValue(new Error('active transport failure'));
    const controller = new TestController();
    await expect(controller.connect(adapter)).rejects.toThrow('active transport failure');
    expect(controller.getSnapshot().state).toMatchObject({
      status: 'error',
      error: 'active transport failure',
    });
  });

  it('serializes profile selection and only accepts confirmation for the requested profile', async () => {
    const { adapter, controller } = await connectedController();
    const first = controller.selectProfile('single-phase');
    await expect(controller.selectProfile('ltct')).rejects.toThrow(/in progress/i);
    expect(adapter.selectProfile).toHaveBeenCalledTimes(1);

    adapter.emit({ type: 'mode-confirmed', profileId: 'ltct' });
    await Promise.resolve();
    expect(controller.getSnapshot().state.status).toBe('connected');

    adapter.emit({ type: 'mode-confirmed', profileId: 'single-phase' });
    await first;
    expect(controller.getSnapshot().state).toMatchObject({
      status: 'configured',
      profileId: 'single-phase',
    });
  });

  it('does not create a zombie session when a subscriber disconnects during connecting notification', async () => {
    const adapter = new FakeAdapter();
    const controller = new TestController();
    controller.subscribe((snapshot) => {
      if (snapshot.state.status === 'connecting') void controller.disconnect();
    });

    await expect(controller.connect(adapter)).rejects.toThrow(/cancelled|disconnected/i);
    expect(controller.getSnapshot().state.status).toBe('disconnected');
    expect(adapter.listeners.size).toBe(0);
    expect(adapter.connect).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(controller.getSnapshot().state.status).toBe('disconnected');
  });

  it('releases a failed connection subscription before reset and reconnect', async () => {
    const first = new FakeAdapter();
    first.connect.mockRejectedValue(new Error('port unavailable'));
    const second = new FakeAdapter();
    const controller = new TestController();
    await expect(controller.connect(first)).rejects.toThrow('port unavailable');
    expect(first.listeners.size).toBe(0);
    controller.reset();

    const connection = controller.connect(second);
    expect(second.listeners.size).toBe(1);
    first.emit({ type: 'connected', label: 'Zombie' });
    second.emit({ type: 'connected', label: 'Current' });
    await connection;
    expect(controller.getSnapshot().connectionLabel).toBe('Current');
    expect(second.listeners.size).toBe(1);
  });

  it('releases the adapter subscription when connection times out', async () => {
    const adapter = new FakeAdapter();
    const controller = new TestController();
    const connection = controller.connect(adapter);
    const rejection = expect(connection).rejects.toThrow(/timed out/i);
    await vi.advanceTimersByTimeAsync(3_000);
    await rejection;
    expect(adapter.listeners.size).toBe(0);
    expect(adapter.disconnect).toHaveBeenCalledTimes(1);
  });

  it('contains adapter teardown rejection after a disconnected event', async () => {
    const { adapter, controller } = await connectedController();
    adapter.disconnect.mockRejectedValue(new Error('close failed'));
    adapter.emit({ type: 'disconnected' });
    await Promise.resolve();
    await Promise.resolve();

    const snapshot = controller.getSnapshot();
    expect(snapshot.state.status).toBe('disconnected');
    expect(snapshot.logs).toContainEqual(expect.objectContaining({ message: 'close failed' }));
    expect(adapter.listeners.size).toBe(0);
  });

  it('bounds live controller logs while preserving the newest events', async () => {
    const { adapter, controller } = await connectedController();
    for (let index = 0; index < 250; index += 1) {
      adapter.emit({ type: 'diagnostic', message: `event-${index}` });
    }

    const logs = controller.getSnapshot().logs;
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('event-50');
    expect(logs.at(-1)?.message).toBe('event-249');
  });

  it('keeps a manually disconnected session active when native close fails', async () => {
    const { adapter, controller } = await connectedController();
    adapter.disconnect.mockRejectedValueOnce(new Error('close failed'));

    await expect(controller.disconnect()).rejects.toThrow('close failed');

    expect(controller.getSnapshot().state.status).toBe('connected');
    expect(adapter.listeners.size).toBe(1);
    await expect(controller.disconnect()).resolves.toBeUndefined();
    expect(controller.getSnapshot().state.status).toBe('disconnected');
  });

  it('owns the connect operation before a connecting subscriber can select a profile', async () => {
    const adapter = new FakeAdapter();
    const controller = new TestController();
    let automaticSelection: Promise<void> | undefined;
    controller.subscribe((snapshot) => {
      if (snapshot.state.status === 'connecting') {
        automaticSelection = controller.selectProfile('single-phase');
      }
    });

    const connection = controller.connect(adapter);
    await expect(automaticSelection).rejects.toThrow(/in progress/i);
    expect(adapter.selectProfile).not.toHaveBeenCalled();
    adapter.emit({ type: 'connected', label: 'Atomic' });
    await connection;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(controller.getSnapshot().state.status).toBe('connected');
  });

  it('settles connect when subscribe synchronously replays the connected event', async () => {
    const adapter = new FakeAdapter();
    const subscribe = adapter.subscribe.bind(adapter);
    adapter.subscribe = (listener) => {
      const unsubscribe = subscribe(listener);
      listener({ type: 'connected', label: 'Replay' });
      return unsubscribe;
    };
    const controller = new TestController();

    await controller.connect(adapter);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(controller.getSnapshot()).toMatchObject({
      state: { status: 'connected' },
      connectionLabel: 'Replay',
    });
    expect(adapter.listeners.size).toBe(1);
  });

  it('preserves an active profile operation when a reentrant connect is invalid', async () => {
    const first = new FakeAdapter();
    const second = new FakeAdapter();
    const profileCommand = deferred();
    first.selectProfile.mockImplementation(() => profileCommand.promise);
    const controller = new TestController();
    const connection = controller.connect(first);
    first.emit({ type: 'connected', label: 'First' });
    await connection;

    const selection = controller.selectProfile('single-phase');
    expect(() => controller.connect(second)).toThrow(/only connect/i);
    profileCommand.reject(new Error('active profile failure'));
    const rejection = expect(selection).rejects.toThrow('active profile failure');
    await vi.advanceTimersByTimeAsync(2_000);
    await rejection;
  });
});
