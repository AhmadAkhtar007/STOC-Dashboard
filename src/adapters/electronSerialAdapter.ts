import { PROFILES } from '../domain/profiles';
import type {
  DeviceAdapter,
  DeviceEvent,
  ProfileId,
  TestProfile,
} from '../domain/types';
import type { StocDesktopApi, SerialPortDescriptor } from '../electron';
import { SerialParser, type ProtocolEvent } from '../protocol/serialParser';

const PROFILE_BY_MODE = new Map<string, ProfileId>([
  ['1', 'single-phase'],
  ['single phase', 'single-phase'],
  ['2', 'three-phase'],
  ['three phase', 'three-phase'],
  ['three phase whole current', 'three-phase'],
  ['3', 'ltct'],
  ['ltct', 'ltct'],
]);

export class ElectronSerialAdapter implements DeviceAdapter {
  readonly kind = 'serial' as const;

  private readonly listeners = new Set<(event: DeviceEvent) => void>();
  private parser = new SerialParser();
  private connected = false;
  private connecting = false;
  private generation = 0;
  private removeDataListener?: () => void;
  private removeErrorListener?: () => void;

  constructor(private readonly api: StocDesktopApi = requireDesktopApi()) {}

  listPorts(): Promise<SerialPortDescriptor[]> {
    return this.api.listPorts();
  }

  async connect(target?: string): Promise<void> {
    const path = target?.trim();
    if (!path) throw new Error('Select a serial port before connecting');
    if (this.connecting) throw new Error('A serial port is already connecting');
    if (this.connected) throw new Error('A serial port is already connected');

    this.connecting = true;
    const generation = ++this.generation;
    this.parser = new SerialParser();
    this.installTransportListeners(generation);
    try {
      await this.api.openPort(path);
      if (generation !== this.generation) {
        await this.api.closePort();
        return;
      }
      this.connecting = false;
      this.connected = true;
      this.emit({ type: 'connected', label: `Proteus / Arduino · ${path}` });
    } catch (error) {
      if (generation === this.generation) {
        this.connecting = false;
        this.generation += 1;
        this.removeTransportListeners();
      }
      throw asError(error);
    }
  }

  async disconnect(): Promise<void> {
    const wasConnected = this.connected;
    this.connecting = false;
    this.connected = false;
    this.generation += 1;
    this.removeTransportListeners();
    this.parser = new SerialParser();
    if (!wasConnected) return;
    try {
      await this.api.closePort();
    } finally {
      this.emit({ type: 'disconnected' });
    }
  }

  async selectProfile(profile: TestProfile): Promise<void> {
    this.assertConnected();
    const canonical = PROFILES[profile.id];
    if (!canonical) throw new Error('Unknown serial profile');
    await this.api.writeSerial(canonical.serialCommand);
  }

  async fire(): Promise<void> {
    this.assertConnected();
    await this.api.writeSerial('F');
  }

  subscribe(listener: (event: DeviceEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private installTransportListeners(generation: number): void {
    this.removeTransportListeners();
    this.removeDataListener = this.api.onSerialData((chunk) => {
      if (generation !== this.generation) return;
      for (const event of this.parser.push(chunk)) {
        const normalized = normalizeProtocolEvent(event);
        if (normalized) this.emit(normalized);
      }
    });
    this.removeErrorListener = this.api.onSerialError((message) => {
      if (generation !== this.generation) return;
      this.emit({ type: 'error', message });
    });
  }

  private removeTransportListeners(): void {
    this.removeDataListener?.();
    this.removeErrorListener?.();
    this.removeDataListener = undefined;
    this.removeErrorListener = undefined;
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error('Serial port is not connected');
  }

  private emit(event: DeviceEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // A renderer observer cannot interrupt the transport lifecycle.
      }
    }
  }
}

function normalizeProtocolEvent(event: ProtocolEvent): DeviceEvent | undefined {
  switch (event.type) {
    case 'mode': {
      const profileId = PROFILE_BY_MODE.get(event.mode.trim().toLowerCase());
      return profileId
        ? { type: 'mode-confirmed', profileId }
        : { type: 'error', message: `Unknown mode confirmation: ${event.mode}` };
    }
    case 'firing':
    case 'fire-complete':
    case 'waveform':
    case 'diagnostic':
      return event;
    case 'device-error':
    case 'protocol-error':
      return { type: 'error', message: event.message };
  }
}

function requireDesktopApi(): StocDesktopApi {
  if (!window.stocDesktop) throw new Error('Desktop serial API is unavailable');
  return window.stocDesktop;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
