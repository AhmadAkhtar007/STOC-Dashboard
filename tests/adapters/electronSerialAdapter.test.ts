import { describe, expect, it, vi } from 'vitest';

import { ElectronSerialAdapter } from '../../src/adapters/electronSerialAdapter';
import { PROFILES } from '../../src/domain/profiles';
import type { DeviceEvent } from '../../src/domain/types';
import type { StocDesktopApi } from '../../src/electron';

class FakeDesktopApi implements StocDesktopApi {
  readonly listPorts = vi.fn(async () => [
    { path: 'COM7', manufacturer: 'Proteus' },
    { path: 'COM8' },
  ]);
  readonly openPort = vi.fn(async (_path: string) => undefined);
  readonly closePort = vi.fn(async () => undefined);
  readonly writeSerial = vi.fn(async (_data: string) => undefined);
  private readonly dataListeners = new Set<(chunk: string) => void>();
  private readonly errorListeners = new Set<(message: string) => void>();

  onSerialData(listener: (chunk: string) => void) {
    this.dataListeners.add(listener);
    return () => this.dataListeners.delete(listener);
  }

  onSerialError(listener: (message: string) => void) {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  emitData(chunk: string) {
    for (const listener of this.dataListeners) listener(chunk);
  }

  emitError(message: string) {
    for (const listener of this.errorListeners) listener(message);
  }

  captureDataListeners() {
    return [...this.dataListeners];
  }

  captureErrorListeners() {
    return [...this.errorListeners];
  }

  get listenerCounts() {
    return { data: this.dataListeners.size, error: this.errorListeners.size };
  }
}

function recordEvents(adapter: ElectronSerialAdapter) {
  const events: DeviceEvent[] = [];
  adapter.subscribe((event) => events.push(event));
  return events;
}

describe('ElectronSerialAdapter', () => {
  it('lists ports through the narrow desktop API', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);

    await expect(adapter.listPorts()).resolves.toEqual([
      { path: 'COM7', manufacturer: 'Proteus' },
      { path: 'COM8' },
    ]);
    expect(api.listPorts).toHaveBeenCalledOnce();
  });

  it('opens the requested port and reports the serial connection', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);

    await adapter.connect('COM7');

    expect(api.openPort).toHaveBeenCalledWith('COM7');
    expect(events).toEqual([{ type: 'connected', label: 'Proteus / Arduino · COM7' }]);
    expect(api.listenerCounts).toEqual({ data: 1, error: 1 });
  });

  it('requires an explicit serial port target', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);

    await expect(adapter.connect()).rejects.toThrow('Select a serial port');
    expect(api.openPort).not.toHaveBeenCalled();
  });

  it.each([
    ['single-phase', '1'],
    ['three-phase', '2'],
    ['ltct', '3'],
  ] as const)('writes the %s profile command exactly', async (profileId, command) => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    await adapter.connect('COM7');

    await adapter.selectProfile(PROFILES[profileId]);

    expect(api.writeSerial).toHaveBeenLastCalledWith(command);
  });

  it('writes the fire command exactly', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    await adapter.connect('COM7');

    await adapter.fire();

    expect(api.writeSerial).toHaveBeenLastCalledWith('F');
  });

  it('normalizes fragmented protocol messages into device events', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);
    await adapter.connect('COM7');
    events.length = 0;

    api.emitData('MODE: Single Ph');
    api.emitData('ase\r\nFIRING\nFIRE_');
    api.emitData('COMPLETE\nWAVEFORM:0,512,1023\n');

    expect(events).toEqual([
      { type: 'mode-confirmed', profileId: 'single-phase' },
      { type: 'firing' },
      { type: 'fire-complete' },
      { type: 'waveform', samples: [0, 512, 1023] },
    ]);
  });

  it('normalizes all documented mode labels and diagnostics', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);
    await adapter.connect('COM7');
    events.length = 0;

    api.emitData('MODE: Three Phase Whole Current\nMODE: LTCT\nADC ready\n');

    expect(events).toEqual([
      { type: 'mode-confirmed', profileId: 'three-phase' },
      { type: 'mode-confirmed', profileId: 'ltct' },
      { type: 'diagnostic', message: 'ADC ready' },
    ]);
  });

  it('turns device, protocol, and transport failures into error events', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);
    await adapter.connect('COM7');
    events.length = 0;

    api.emitData('ERROR: SCR fault\nWAVEFORM:not-a-sample\n');
    api.emitError('Cable removed');

    expect(events).toEqual([
      { type: 'error', message: 'SCR fault' },
      { type: 'error', message: 'Invalid waveform payload' },
      { type: 'error', message: 'Cable removed' },
    ]);
  });

  it('closes the port and removes transport listeners on disconnect', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);
    await adapter.connect('COM7');
    events.length = 0;

    await adapter.disconnect();
    api.emitData('FIRING\n');
    api.emitError('stale');

    expect(api.closePort).toHaveBeenCalledOnce();
    expect(api.listenerCounts).toEqual({ data: 0, error: 0 });
    expect(events).toEqual([{ type: 'disconnected' }]);
  });

  it('ignores callbacks retained from an earlier connection session', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const events = recordEvents(adapter);
    await adapter.connect('COM7');
    const [staleData] = api.captureDataListeners();
    const [staleError] = api.captureErrorListeners();
    await adapter.disconnect();
    await adapter.connect('COM8');
    events.length = 0;

    staleData?.('FIRING\n');
    staleError?.('old session failed');

    expect(events).toEqual([]);
  });

  it('cleans up listeners when opening the port fails', async () => {
    const api = new FakeDesktopApi();
    api.openPort.mockRejectedValueOnce(new Error('Access denied'));
    const adapter = new ElectronSerialAdapter(api);

    await expect(adapter.connect('COM7')).rejects.toThrow('Access denied');

    expect(api.listenerCounts).toEqual({ data: 0, error: 0 });
    expect(api.closePort).not.toHaveBeenCalled();
  });

  it('rejects a second connection while the first port is still opening', async () => {
    const api = new FakeDesktopApi();
    let finishOpening!: () => void;
    api.openPort.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishOpening = resolve;
    }));
    const adapter = new ElectronSerialAdapter(api);
    const firstConnection = adapter.connect('COM7');

    await expect(adapter.connect('COM8')).rejects.toThrow('already connecting');
    finishOpening();
    await firstConnection;

    expect(api.openPort).toHaveBeenCalledTimes(1);
  });

  it('removes only the subscriber that unsubscribes', async () => {
    const api = new FakeDesktopApi();
    const adapter = new ElectronSerialAdapter(api);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribe = adapter.subscribe(first);
    adapter.subscribe(second);
    unsubscribe();
    await adapter.connect('COM7');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({
      type: 'connected',
      label: 'Proteus / Arduino · COM7',
    });
  });
});
