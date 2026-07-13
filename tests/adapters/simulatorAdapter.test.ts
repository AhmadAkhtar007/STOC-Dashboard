import { describe, expect, it, vi } from 'vitest';

import { PROFILES } from '../../src/domain/profiles';
import type { DeviceEvent } from '../../src/domain/types';
import { SimulatorAdapter } from '../../src/adapters/simulatorAdapter';

type Timer = { callback: () => void; dueAt: number };

function createClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, Timer>();

  return {
    now: () => now,
    setTimeout(callback: () => void, delayMs: number) {
      const id = nextId++;
      timers.set(id, { callback, dueAt: now + delayMs });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
    advanceBy(delayMs: number) {
      const target = now + delayMs;
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.dueAt <= target)
          .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.dueAt;
        timer.callback();
      }
      now = target;
    },
  };
}

function createAdapter() {
  const clock = createClock();
  return {
    adapter: new SimulatorAdapter({
      now: clock.now,
      setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout,
    }),
    clock,
  };
}

describe('SimulatorAdapter', () => {
  it('invokes default browser timer dependencies with the global receiver', async () => {
    const originalSetTimeout = globalThis.setTimeout;
    const originalClearTimeout = globalThis.clearTimeout;
    const receiverSensitiveSetTimeout = vi.fn(function (
      this: unknown,
      _callback: () => void,
      _delayMs?: number,
    ) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return 73 as ReturnType<typeof globalThis.setTimeout>;
    });
    const receiverSensitiveClearTimeout = vi.fn(function (this: unknown, _timerId: unknown) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
    });
    globalThis.setTimeout = receiverSensitiveSetTimeout as typeof globalThis.setTimeout;
    globalThis.clearTimeout = receiverSensitiveClearTimeout as typeof globalThis.clearTimeout;

    try {
      const adapter = new SimulatorAdapter();
      await adapter.connect();
      await adapter.selectProfile(PROFILES['single-phase']);
      const firing = adapter.fire();
      const settlement = expect(firing).rejects.toThrow('Simulator disconnected');
      await adapter.disconnect();

      await settlement;
      expect(receiverSensitiveSetTimeout).toHaveBeenCalledOnce();
      expect(receiverSensitiveClearTimeout).toHaveBeenCalledWith(73);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
      globalThis.clearTimeout = originalClearTimeout;
    }
  });

  it('identifies itself and emits the complete run in protocol order', async () => {
    const { adapter, clock } = createAdapter();
    const events: DeviceEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    expect(adapter.kind).toBe('simulator');
    await adapter.connect();
    await adapter.selectProfile(PROFILES['single-phase']);
    const firing = adapter.fire();

    expect(events.map((event) => event.type)).toEqual([
      'connected',
      'mode-confirmed',
      'firing',
    ]);

    clock.advanceBy(PROFILES['single-phase'].durationMs);
    await firing;

    expect(events.map((event) => event.type)).toEqual([
      'connected',
      'mode-confirmed',
      'firing',
      'fire-complete',
      'waveform',
    ]);
    expect(events[0]).toEqual({ type: 'connected', label: 'STOC Simulator' });
    expect(events[1]).toEqual({ type: 'mode-confirmed', profileId: 'single-phase' });
  });

  it('requires a connection and selected profile and prevents overlapping fires', async () => {
    const { adapter, clock } = createAdapter();

    await expect(adapter.fire()).rejects.toThrow('Simulator is not connected');
    await adapter.connect();
    await expect(adapter.fire()).rejects.toThrow('No profile selected');
    await adapter.selectProfile(PROFILES.ltct);

    const firstFire = adapter.fire();
    await expect(adapter.fire()).rejects.toThrow('Simulator is already firing');
    clock.advanceBy(PROFILES.ltct.durationMs);
    await firstFire;
  });

  it('canonicalizes valid profile copies and rejects tampered profiles', async () => {
    const { adapter } = createAdapter();

    await expect(adapter.selectProfile(PROFILES.ltct)).rejects.toThrow(
      'Simulator is not connected',
    );
    await adapter.connect();
    await expect(adapter.selectProfile({ ...PROFILES.ltct })).resolves.toBeUndefined();
    await expect(
      adapter.selectProfile({ ...PROFILES.ltct, name: 'Impostor' }),
    ).rejects.toThrow('Unknown simulator profile');
    await expect(
      adapter.selectProfile({ ...PROFILES.ltct, id: 'unknown' as 'ltct' }),
    ).rejects.toThrow('Unknown simulator profile');
  });

  it('establishes the in-flight run before firing observers can reenter', async () => {
    const { adapter, clock } = createAdapter();
    let nestedFire: Promise<void> | undefined;
    adapter.subscribe((event) => {
      if (event.type === 'firing') nestedFire = adapter.fire();
    });

    await adapter.connect();
    await adapter.selectProfile(PROFILES.ltct);
    const firing = adapter.fire();

    await expect(nestedFire).rejects.toThrow('Simulator is already firing');
    clock.advanceBy(PROFILES.ltct.durationMs);
    await expect(firing).resolves.toBeUndefined();
  });

  it('settles a run when a firing observer disconnects immediately', async () => {
    const { adapter, clock } = createAdapter();
    const events: DeviceEvent[] = [];
    adapter.subscribe((event) => {
      events.push(event);
      if (event.type === 'firing') void adapter.disconnect();
    });

    await adapter.connect();
    await adapter.selectProfile(PROFILES.ltct);
    const firing = adapter.fire();

    await expect(firing).rejects.toThrow('Simulator disconnected');
    clock.advanceBy(PROFILES.ltct.durationMs);
    expect(events.map((event) => event.type)).toEqual([
      'connected',
      'mode-confirmed',
      'firing',
      'disconnected',
    ]);
  });

  it('isolates observer exceptions and still settles terminal delivery', async () => {
    const { adapter, clock } = createAdapter();
    const received: string[] = [];
    adapter.subscribe((event) => {
      if (event.type === 'fire-complete' || event.type === 'waveform') {
        throw new Error(`observer failed on ${event.type}`);
      }
    });
    adapter.subscribe((event) => received.push(event.type));

    await adapter.connect();
    await adapter.selectProfile(PROFILES['single-phase']);
    const firing = adapter.fire();
    clock.advanceBy(PROFILES['single-phase'].durationMs);

    await expect(firing).resolves.toBeUndefined();
    expect(received.slice(-2)).toEqual(['fire-complete', 'waveform']);
  });

  it('keeps the run in flight until both terminal events are delivered', async () => {
    const { adapter, clock } = createAdapter();
    let nestedFire: Promise<void> | undefined;
    const events: string[] = [];
    adapter.subscribe((event) => {
      events.push(event.type);
      if (event.type === 'fire-complete') nestedFire = adapter.fire();
    });

    await adapter.connect();
    await adapter.selectProfile(PROFILES['single-phase']);
    const firing = adapter.fire();
    clock.advanceBy(PROFILES['single-phase'].durationMs);

    await expect(nestedFire).rejects.toThrow('Simulator is already firing');
    await expect(firing).resolves.toBeUndefined();
    expect(events.slice(-2)).toEqual(['fire-complete', 'waveform']);
  });

  it('creates deterministic, bounded, profile-specific 200-sample waveforms', async () => {
    async function waveformFor(profile: (typeof PROFILES)[keyof typeof PROFILES]) {
      const { adapter, clock } = createAdapter();
      let samples: number[] = [];
      adapter.subscribe((event) => {
        if (event.type === 'waveform') samples = event.samples;
      });
      await adapter.connect();
      await adapter.selectProfile(profile);
      const firing = adapter.fire();
      clock.advanceBy(profile.durationMs);
      await firing;
      return samples;
    }

    const first = await waveformFor(PROFILES['single-phase']);
    const repeat = await waveformFor(PROFILES['single-phase']);
    const threePhase = await waveformFor(PROFILES['three-phase']);

    expect(first).toEqual(repeat);
    expect(first).not.toEqual(threePhase);
    expect(first).toHaveLength(200);
    expect(first[0]).toBe(512);
    expect(first.every((sample) => Number.isInteger(sample) && sample >= 0 && sample <= 1023)).toBe(
      true,
    );
  });

  it('removes subscriptions and cancels pending work on disconnect', async () => {
    const { adapter, clock } = createAdapter();
    const activeEvents: DeviceEvent[] = [];
    const removedEvents: DeviceEvent[] = [];
    adapter.subscribe((event) => activeEvents.push(event));
    const unsubscribe = adapter.subscribe((event) => removedEvents.push(event));

    await adapter.connect();
    unsubscribe();
    await adapter.selectProfile(PROFILES.ltct);
    const firing = adapter.fire();
    const firingRejection = expect(firing).rejects.toThrow('Simulator disconnected');
    await adapter.disconnect();
    clock.advanceBy(PROFILES.ltct.durationMs);
    await firingRejection;

    expect(activeEvents.map((event) => event.type)).toEqual([
      'connected',
      'mode-confirmed',
      'firing',
      'disconnected',
    ]);
    expect(removedEvents.map((event) => event.type)).toEqual(['connected']);
  });
});
