import { PROFILES } from '../domain/profiles';
import { initialTestState, transition } from '../domain/testMachine';
import type {
  ControllerLogEntry,
  ControllerSnapshot,
  DeviceAdapter,
  DeviceEvent,
  ProfileId,
  RunMetadata,
  TestAction,
  TestProfile,
  TestResult,
  TestState,
} from '../domain/types';

type TimerId = ReturnType<typeof globalThis.setTimeout>;

interface ControllerDependencies {
  now?: () => number;
  createId?: () => string;
  setTimeout?: (callback: () => void, delayMs: number) => TimerId;
  clearTimeout?: (timerId: TimerId) => void;
}

interface PendingOperation {
  kind: 'connect' | 'profile' | 'fire';
  resolve: () => void;
  reject: (error: Error) => void;
  timer?: TimerId;
}

export class TestController {
  private state: TestState = initialTestState;
  private readonly logs: ControllerLogEntry[] = [];
  private readonly listeners = new Set<(snapshot: ControllerSnapshot) => void>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly schedule: (callback: () => void, delayMs: number) => TimerId;
  private readonly cancel: (timerId: TimerId) => void;
  private adapter?: DeviceAdapter;
  private unsubscribeAdapter?: () => void;
  private selectedProfile?: TestProfile;
  private metadata?: RunMetadata;
  private result?: TestResult;
  private connectionLabel?: string;
  private startedAt?: number;
  private pending?: PendingOperation;
  private generation = 0;
  private requestedProfileId?: ProfileId;

  constructor(dependencies: ControllerDependencies = {}) {
    this.now = dependencies.now ?? Date.now;
    this.createId = dependencies.createId ?? (() => globalThis.crypto.randomUUID());
    this.schedule = dependencies.setTimeout ?? globalThis.setTimeout;
    this.cancel = dependencies.clearTimeout ?? globalThis.clearTimeout;
  }

  connect(adapter: DeviceAdapter, target?: string): Promise<void> {
    this.state = transition(this.state, { type: 'CONNECT' });
    const generation = ++this.generation;
    this.log('status', 'Connecting');
    this.adapter = adapter;
    const { promise, operation } = this.waitFor('connect', 3_000, 'Connection timed out');
    const activeAdapter = adapter;
    const unsubscribe = adapter.subscribe((event) => {
      if (this.adapter === activeAdapter) this.handleEvent(event);
    });
    if (this.generation !== generation || this.adapter !== adapter) {
      unsubscribe();
      return promise;
    }
    this.unsubscribeAdapter = unsubscribe;
    this.notify();
    if (this.generation !== generation || this.adapter !== adapter) {
      return promise;
    }
    void adapter.connect(target).catch((error: unknown) => {
      if (this.isCurrent(generation, operation)) this.fail(asError(error).message);
    });
    return promise;
  }

  async disconnect(): Promise<void> {
    this.generation += 1;
    const adapter = this.adapter;
    this.clearPending(new Error('Device disconnected'));
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = undefined;
    this.adapter = undefined;
    this.selectedProfile = undefined;
    this.requestedProfileId = undefined;
    this.metadata = undefined;
    this.result = undefined;
    this.connectionLabel = undefined;
    this.startedAt = undefined;
    this.apply({ type: 'DISCONNECT' }, 'Disconnected');
    if (adapter) await adapter.disconnect();
  }

  selectProfile(profileId: ProfileId): Promise<void> {
    if (!this.adapter) return Promise.reject(new Error('Device is not connected'));
    if (this.pending) return Promise.reject(new Error('Another controller operation is in progress'));
    const profile = PROFILES[profileId];
    const generation = this.generation;
    this.requestedProfileId = profileId;
    const { promise, operation } = this.waitFor('profile', 2_000, 'Mode confirmation timed out');
    void this.adapter.selectProfile(profile).catch((error: unknown) => {
      if (this.isCurrent(generation, operation)) this.fail(asError(error).message);
    });
    return promise;
  }

  arm(metadata: RunMetadata): void {
    this.apply({ type: 'ARM' }, 'Test armed');
    this.metadata = { ...metadata };
    this.result = undefined;
    this.notify();
  }

  fire(): Promise<void> {
    try {
      this.apply({ type: 'FIRE' }, 'Fire command sent');
    } catch (error) {
      return Promise.reject(asError(error));
    }
    if (!this.adapter || !this.selectedProfile) {
      const error = new Error('Test is not configured');
      this.fail(error.message);
      return Promise.reject(error);
    }
    this.startedAt = this.now();
    const generation = this.generation;
    const { promise, operation } = this.waitFor('fire', 2_000, 'Firing acknowledgement timed out');
    void this.adapter.fire().catch((error: unknown) => {
      if (this.isCurrent(generation, operation)) this.fail(asError(error).message);
    });
    return promise;
  }

  reset(): void {
    this.apply({ type: 'RESET' }, 'Controller reset');
    this.result = undefined;
  }

  subscribe(listener: (snapshot: ControllerSnapshot) => void): () => void {
    this.listeners.add(listener);
    try {
      listener(this.getSnapshot());
    } catch {
      // Observers cannot interrupt controller operation or starve other observers.
    }
    return () => this.listeners.delete(listener);
  }

  detachAdapter(adapter: DeviceAdapter): void {
    if (this.adapter !== adapter) return;
    this.generation += 1;
    this.clearPending(new Error('Controller disposed'));
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = undefined;
    this.adapter = undefined;
    this.selectedProfile = undefined;
    this.requestedProfileId = undefined;
    this.metadata = undefined;
    this.result = undefined;
    this.connectionLabel = undefined;
    this.startedAt = undefined;
    this.state = transition(this.state, { type: 'DISCONNECT' });
    this.notify();
  }

  async dispose(disconnectAdapter = true): Promise<void> {
    const adapter = this.adapter;
    if (adapter) this.detachAdapter(adapter);
    else this.clearPending(new Error('Controller disposed'));
    this.listeners.clear();
    if (disconnectAdapter && adapter) await adapter.disconnect();
  }

  getSnapshot(): ControllerSnapshot {
    return {
      state: { ...this.state, samples: [...this.state.samples] },
      logs: this.logs.map((entry) => ({ ...entry })),
      metadata: this.metadata ? { ...this.metadata } : undefined,
      result: this.result
        ? {
            ...this.result,
            metadata: { ...this.result.metadata },
            profile: { ...this.result.profile },
            samples: [...this.result.samples],
          }
        : undefined,
      connectionLabel: this.connectionLabel,
    };
  }

  private handleEvent(event: DeviceEvent): void {
    try {
      switch (event.type) {
        case 'connected':
          if (this.state.status !== 'connecting') return;
          this.connectionLabel = event.label;
          this.apply({ type: 'CONNECTED' }, `Connected: ${event.label}`);
          this.settle('connect');
          return;
        case 'disconnected':
          void this.disconnect().catch((error: unknown) => this.recordTeardownError(error));
          return;
        case 'mode-confirmed':
          if (this.state.status !== 'connected' || this.pending?.kind !== 'profile') return;
          if (event.profileId !== this.requestedProfileId) {
            this.log('diagnostic', `Ignored confirmation for unrequested profile: ${event.profileId}`);
            this.notify();
            return;
          }
          this.selectedProfile = PROFILES[event.profileId];
          this.apply({ type: 'SELECT_PROFILE', profileId: event.profileId }, 'Profile confirmed');
          this.settle('profile');
          return;
        case 'firing':
          if (this.state.status !== 'firing' || this.pending?.kind !== 'fire') return;
          this.apply({ type: 'FIRING_ACK' }, 'Firing acknowledged');
          this.replaceFireTimer(this.selectedProfile!.durationMs + 3_000);
          return;
        case 'fire-complete':
          if (this.state.status !== 'firing') return;
          this.apply({ type: 'FIRE_COMPLETE' }, 'Firing complete; awaiting waveform');
          return;
        case 'waveform':
          if (this.state.status !== 'capturing') return;
          this.apply({ type: 'WAVEFORM', samples: event.samples }, 'Waveform captured');
          this.completeResult();
          this.settle('fire');
          return;
        case 'diagnostic':
          this.log('diagnostic', event.message);
          this.notify();
          return;
        case 'error':
          this.fail(event.message);
      }
    } catch (error) {
      this.fail(asError(error).message);
    }
  }

  private completeResult(): void {
    if (!this.adapter || !this.selectedProfile || !this.metadata || this.startedAt === undefined) return;
    const samples = [...this.state.samples];
    this.result = {
      id: this.createId(),
      startedAt: this.startedAt,
      completedAt: this.now(),
      adapterKind: this.adapter.kind,
      metadata: { ...this.metadata },
      profile: { ...this.selectedProfile },
      samples,
      rawPeak: Math.max(...samples),
      outcome: 'sequence-complete',
    };
    this.notify();
  }

  private waitFor(
    kind: PendingOperation['kind'],
    delayMs: number,
    message: string,
  ): { promise: Promise<void>; operation: PendingOperation } {
    let operation!: PendingOperation;
    const promise = new Promise<void>((resolve, reject) => {
      const pending: PendingOperation = { kind, resolve, reject };
      operation = pending;
      pending.timer = this.schedule(() => {
        if (this.pending !== pending) return;
        this.pending = undefined;
        if (kind === 'profile') this.requestedProfileId = undefined;
        if (kind === 'connect') this.releaseFailedConnection();
        this.fail(message, false);
        reject(new Error(message));
      }, delayMs);
      this.pending = pending;
    });
    return { promise, operation };
  }

  private isCurrent(generation: number, operation: PendingOperation): boolean {
    return this.generation === generation && this.pending === operation;
  }

  private replaceFireTimer(delayMs: number): void {
    const pending = this.pending;
    if (!pending || pending.kind !== 'fire') return;
    if (pending.timer !== undefined) this.cancel(pending.timer);
    pending.timer = this.schedule(() => {
      if (this.pending !== pending) return;
      this.pending = undefined;
      const message = 'Waveform completion timed out';
      this.fail(message, false);
      pending.reject(new Error(message));
    }, delayMs);
  }

  private settle(kind: PendingOperation['kind']): void {
    const pending = this.pending;
    if (!pending || pending.kind !== kind) return;
    this.pending = undefined;
    if (pending.timer !== undefined) this.cancel(pending.timer);
    if (kind === 'profile') this.requestedProfileId = undefined;
    pending.resolve();
  }

  private clearPending(error: Error): void {
    const pending = this.pending;
    this.pending = undefined;
    if (!pending) return;
    if (pending.timer !== undefined) this.cancel(pending.timer);
    if (pending.kind === 'profile') this.requestedProfileId = undefined;
    pending.reject(error);
  }

  private fail(message: string, rejectPending = true): void {
    const failedKind = this.pending?.kind;
    if (rejectPending) this.clearPending(new Error(message));
    if (failedKind === 'connect') this.releaseFailedConnection();
    this.apply({ type: 'FAIL', message }, message, 'error');
  }

  private releaseFailedConnection(): void {
    const adapter = this.adapter;
    this.unsubscribeAdapter?.();
    this.unsubscribeAdapter = undefined;
    this.adapter = undefined;
    this.connectionLabel = undefined;
    if (adapter) {
      void adapter.disconnect().catch((error: unknown) => this.recordTeardownError(error));
    }
  }

  private recordTeardownError(error: unknown): void {
    this.log('error', asError(error).message);
    this.notify();
  }

  private apply(action: TestAction, message: string, level: ControllerLogEntry['level'] = 'status'): void {
    this.state = transition(this.state, action);
    this.log(level, message);
    this.notify();
  }

  private log(level: ControllerLogEntry['level'], message: string): void {
    this.logs.push({ timestamp: this.now(), level, message });
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.getSnapshot());
      } catch {
        // Continue notifying remaining observers.
      }
    }
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
