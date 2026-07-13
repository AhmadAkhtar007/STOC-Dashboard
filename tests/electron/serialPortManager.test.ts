import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { SerialPortManager, type ManagedSerialPort } from '../../electron/serialPortManager';

class FakePort extends EventEmitter implements ManagedSerialPort {
  isOpen = false;
  readonly open = vi.fn((callback: (error?: Error | null) => void) => {
    this.isOpen = true;
    callback();
  });
  readonly close = vi.fn((callback: (error?: Error | null) => void) => {
    this.isOpen = false;
    this.emit('close');
    callback();
  });
  readonly write = vi.fn((_data: string, callback: (error?: Error | null) => void) => callback());
  readonly drain = vi.fn((callback: (error?: Error | null) => void) => callback());
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup() {
  const ports = new Map<string, FakePort>();
  const events = { data: vi.fn(), error: vi.fn(), close: vi.fn() };
  let configurePort: ((port: FakePort) => void) | undefined;
  const manager = new SerialPortManager({
    listPorts: async () => [{ path: 'COM7' }, { path: 'COM8' }],
    createPort: (options) => {
      const port = new FakePort();
      configurePort?.(port);
      ports.set(options.path, port);
      return port;
    },
    onData: events.data,
    onError: events.error,
    onUnexpectedClose: events.close,
  });
  return { manager, ports, events, configureNextPort: (configure: (port: FakePort) => void) => { configurePort = configure; } };
}

describe('SerialPortManager', () => {
  it('clears only the physically closed active port and rejects later writes', async () => {
    const { manager, ports, events } = setup();
    await manager.open('COM7');

    ports.get('COM7')!.isOpen = false;
    ports.get('COM7')!.emit('close');

    expect(events.close).toHaveBeenCalledOnce();
    expect(manager.state).toBe('closed');
    await expect(manager.write('F')).rejects.toThrow('without an open serial port');
  });

  it('serializes a reopen behind a close already in flight', async () => {
    const { manager, ports } = setup();
    await manager.open('COM7');
    const closing = deferred();
    ports.get('COM7')!.close.mockImplementationOnce((callback) => {
      void closing.promise.then(() => {
        ports.get('COM7')!.isOpen = false;
        ports.get('COM7')!.emit('close');
        callback();
      });
    });

    const closePromise = manager.close();
    const reopenPromise = manager.open('COM8');
    await Promise.resolve();
    expect(ports.has('COM8')).toBe(false);
    closing.resolve();
    await closePromise;
    await reopenPromise;

    expect(manager.state).toBe('open');
    expect(ports.get('COM8')?.isOpen).toBe(true);
  });

  it('closes a port that finishes opening after shutdown was requested', async () => {
    const { manager, ports, configureNextPort } = setup();
    const opening = deferred();
    configureNextPort((port) => {
      port.open.mockImplementationOnce((callback) => {
        void opening.promise.then(() => {
          port.isOpen = true;
          callback();
        });
      });
    });

    const openPromise = manager.open('COM7');
    await vi.waitFor(() => expect(ports.has('COM7')).toBe(true));
    const shutdownPromise = manager.shutdown();
    opening.resolve();

    await expect(openPromise).rejects.toThrow('shutting down');
    await shutdownPromise;
    expect(ports.get('COM7')!.close).toHaveBeenCalledOnce();
    expect(manager.state).toBe('closed');
  });

  it('ignores a late close event from a replaced port', async () => {
    const { manager, ports, events } = setup();
    await manager.open('COM7');
    const oldPort = ports.get('COM7')!;
    await manager.close();
    await manager.open('COM8');
    events.close.mockClear();

    oldPort.emit('close');

    expect(manager.state).toBe('open');
    expect(events.close).not.toHaveBeenCalled();
    await expect(manager.write('F')).resolves.toBeUndefined();
  });
});
