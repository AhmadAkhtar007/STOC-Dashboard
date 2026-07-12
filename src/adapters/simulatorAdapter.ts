import { PROFILES } from '../domain/profiles';
import type { DeviceAdapter, DeviceEvent, ProfileId, TestProfile } from '../domain/types';

type TimerId = ReturnType<typeof globalThis.setTimeout>;

interface SimulatorDependencies {
  now?: () => number;
  setTimeout?: (callback: () => void, delayMs: number) => TimerId;
  clearTimeout?: (timerId: TimerId) => void;
}

interface PendingFire {
  timerId: TimerId;
  reject: (error: Error) => void;
}

const WAVEFORM_SHAPES: Record<ProfileId, { cycles: number; amplitude: number }> = {
  'single-phase': { cycles: 3, amplitude: 360 },
  'three-phase': { cycles: 5, amplitude: 400 },
  ltct: { cycles: 2, amplitude: 300 },
};

export class SimulatorAdapter implements DeviceAdapter {
  readonly kind = 'simulator' as const;

  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerId;
  private readonly cancel: (timerId: TimerId) => void;
  private connected = false;
  private selectedProfile?: TestProfile;
  private pendingFire?: PendingFire;

  constructor(dependencies: SimulatorDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
    this.schedule = dependencies.setTimeout ?? globalThis.setTimeout;
    this.cancel = dependencies.clearTimeout ?? globalThis.clearTimeout;
  }

  async connect(_target?: string): Promise<void> {
    if (this.connected) return;
    this.connected = true;
    this.emit({ type: 'connected', label: 'STOC Simulator' });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    this.selectedProfile = undefined;

    const pending = this.pendingFire;
    this.pendingFire = undefined;
    if (pending) {
      this.cancel(pending.timerId);
      pending.reject(new Error('Simulator disconnected'));
    }

    this.emit({ type: 'disconnected' });
  }

  async selectProfile(profile: TestProfile): Promise<void> {
    if (!this.connected) throw new Error('Simulator is not connected');
    if (!Object.values(PROFILES).includes(profile)) {
      throw new Error('Unknown simulator profile');
    }
    this.selectedProfile = profile;
    this.emit({ type: 'mode-confirmed', profileId: profile.id });
  }

  async fire(): Promise<void> {
    if (!this.connected) throw new Error('Simulator is not connected');
    if (!this.selectedProfile) throw new Error('No profile selected');
    if (this.pendingFire) throw new Error('Simulator is already firing');

    const profile = this.selectedProfile;
    const startedAt = this.now();
    this.emit({ type: 'firing' });

    return new Promise<void>((resolve, reject) => {
      const timerId = this.schedule(() => {
        if (!this.connected || this.pendingFire?.timerId !== timerId) return;
        this.pendingFire = undefined;
        this.emit({ type: 'fire-complete' });
        this.emit({ type: 'waveform', samples: createWaveform(profile.id, startedAt) });
        resolve();
      }, profile.durationMs);
      this.pendingFire = { timerId, reject };
    });
  }

  subscribe(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DeviceEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}

function createWaveform(profileId: ProfileId, _startedAt: number): number[] {
  const { cycles, amplitude } = WAVEFORM_SHAPES[profileId];
  return Array.from({ length: 200 }, (_, index) => {
    const envelope = Math.exp(-index / 260);
    const phase = (index / 199) * Math.PI * cycles;
    const sample = Math.round(512 + amplitude * envelope * Math.sin(phase));
    return Math.max(0, Math.min(1023, sample));
  });
}
