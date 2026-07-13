import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import {
  SerialPortManager,
  type ManagedSerialPort,
  type SerialPortManagerDependencies,
} from '../../electron/serialPortManager';

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

function setup(overrides: Partial<SerialPortManagerDependencies> = {}) {
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
    ...overrides,
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

  it('returns to closed and permits retry when port discovery rejects during open', async () => {
    let attempts = 0;
    const { manager } = setup({
      listPorts: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Discovery failed');
        return [{ path: 'COM7' }];
      },
    });

    await expect(manager.open('COM7')).rejects.toThrow('Discovery failed');
    expect(manager.state).toBe('closed');
    await expect(manager.open('COM7')).resolves.toBeUndefined();
    expect(manager.state).toBe('open');
  });

  it('returns to closed and permits retry when port construction throws', async () => {
    let attempts = 0;
    const createdPorts: FakePort[] = [];
    const { manager } = setup({
      createPort: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('Driver constructor failed');
        const port = new FakePort();
        createdPorts.push(port);
        return port;
      },
    });

    await expect(manager.open('COM7')).rejects.toThrow('Driver constructor failed');
    expect(manager.state).toBe('closed');
    await expect(manager.open('COM7')).resolves.toBeUndefined();
    expect(createdPorts).toHaveLength(1);
    expect(manager.state).toBe('open');
  });

  it('retains an open port after close fails so cleanup can be retried', async () => {
    const { manager, ports, events } = setup();
    await manager.open('COM7');
    const port = ports.get('COM7')!;
    port.close.mockImplementationOnce((callback) => callback(new Error('Close failed')));

    await expect(manager.close()).rejects.toThrow('Close failed');

    expect(manager.state).toBe('open');
    port.emit('data', Buffer.from('still connected'));
    expect(events.data).toHaveBeenCalledWith('still connected');
    await expect(manager.open('COM8')).rejects.toThrow('already open or opening');
    await expect(manager.close()).resolves.toBeUndefined();
    expect(manager.state).toBe('closed');
  });

  it('rejects an in-flight native write when the device closes and unblocks the queue', async () => {
    const { manager, ports } = setup();
    await manager.open('COM7');
    const port = ports.get('COM7')!;
    port.write.mockImplementationOnce(() => undefined);

    const writing = manager.write('F');
    await vi.waitFor(() => expect(port.write).toHaveBeenCalledOnce());
    port.isOpen = false;
    port.emit('close');

    await expect(writing).rejects.toThrow('disconnected during write');
    await expect(manager.open('COM8')).resolves.toBeUndefined();
    expect(manager.state).toBe('open');
  });

  it('settles close when the driver emits close without invoking its callback', async () => {
    const { manager, ports } = setup();
    await manager.open('COM7');
    const port = ports.get('COM7')!;
    port.close.mockImplementationOnce(() => {
      port.isOpen = false;
      port.emit('close');
    });

    const closePromise = manager.close();

    await expect(closePromise).resolves.toBeUndefined();
    expect(manager.state).toBe('closed');
  });

  it('times out a close whose callback and close event are both omitted', async () => {
    vi.useFakeTimers();
    try {
      const { manager, ports } = setup();
      await manager.open('COM7');
      const port = ports.get('COM7')!;
      port.close.mockImplementationOnce(() => undefined);
      const settled = vi.fn();

      void manager.close().then(settled, (error: Error) => settled(error.message));
      await vi.advanceTimersByTimeAsync(5_000);

      expect(settled).toHaveBeenCalledWith('Serial port close timed out');
      expect(manager.state).toBe('open');
    } finally {
      vi.useRealTimers();
    }
  });
});
