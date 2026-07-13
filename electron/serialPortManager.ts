import { Buffer } from 'node:buffer';

export type SerialLifecycleState = 'closed' | 'opening' | 'open' | 'closing';

export interface ManagedSerialPort {
  isOpen: boolean;
  open(callback: (error?: Error | null) => void): void;
  close(callback: (error?: Error | null) => void): void;
  write(data: string, callback: (error?: Error | null) => void): void;
  drain(callback: (error?: Error | null) => void): void;
  on(event: 'data', listener: (chunk: Buffer) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: () => void): this;
  removeListener(event: 'data', listener: (chunk: Buffer) => void): this;
  removeListener(event: 'error', listener: (error: Error) => void): this;
  removeListener(event: 'close', listener: () => void): this;
}

export interface SerialPortManagerDependencies {
  listPorts(): Promise<Array<{ path: string; manufacturer?: string }>>;
  createPort(options: {
    path: string;
    baudRate: 9600;
    dataBits: 8;
    stopBits: 1;
    parity: 'none';
    autoOpen: false;
  }): ManagedSerialPort;
  onData(chunk: string): void;
  onError(message: string): void;
  onUnexpectedClose(): void;
}

interface PortListeners {
  data: (chunk: Buffer) => void;
  error: (error: Error) => void;
  close: () => void;
}

export class SerialPortManager {
  private lifecycleState: SerialLifecycleState = 'closed';
  private currentPort?: ManagedSerialPort;
  private queue: Promise<void> = Promise.resolve();
  private shuttingDown = false;
  private readonly expectedClosures = new WeakSet<ManagedSerialPort>();
  private readonly listeners = new WeakMap<ManagedSerialPort, PortListeners>();
  private readonly pendingNativeOperations = new WeakMap<ManagedSerialPort, Set<(error: Error) => void>>();

  constructor(private readonly dependencies: SerialPortManagerDependencies) {}

  get state(): SerialLifecycleState {
    return this.lifecycleState;
  }

  listPorts(): Promise<Array<{ path: string; manufacturer?: string }>> {
    return this.dependencies.listPorts();
  }

  open(path: string): Promise<void> {
    return this.enqueue(async () => {
      if (this.shuttingDown) throw new Error('Serial manager is shutting down');
      if (this.lifecycleState !== 'closed') throw new Error('A serial port is already open or opening');
      this.lifecycleState = 'opening';
      let port: ManagedSerialPort | undefined;
      try {
        const availablePorts = await this.dependencies.listPorts();
        if (!availablePorts.some((availablePort) => availablePort.path === path)) {
          throw new Error('Selected serial port is unavailable');
        }

        port = this.dependencies.createPort({
          path,
          baudRate: 9600,
          dataBits: 8,
          stopBits: 1,
          parity: 'none',
          autoOpen: false,
        });
        this.currentPort = port;
        this.attach(port);
        await this.runNativeOperation(port, 'Serial port closed while opening', (done) => port!.open(done));
        if (this.shuttingDown) {
          await this.closeSpecific(port);
          throw new Error('Serial manager is shutting down');
        }
        if (this.currentPort !== port || !port.isOpen) {
          throw new Error('Serial port closed while opening');
        }
        this.lifecycleState = 'open';
      } catch (error) {
        if (port && this.currentPort === port) {
          this.currentPort = undefined;
          this.detach(port);
        }
        if (!this.currentPort) this.lifecycleState = 'closed';
        throw error;
      }
    });
  }

  close(): Promise<void> {
    return this.enqueue(() => this.closeCurrent());
  }

  write(data: string): Promise<void> {
    return this.enqueue(async () => {
      const port = this.currentPort;
      if (this.lifecycleState !== 'open' || !port?.isOpen) {
        throw new Error('Cannot write without an open serial port');
      }
      await this.runNativeOperation(port, 'Serial port disconnected during write', (done) => port.write(data, done));
      if (this.currentPort !== port || !port.isOpen) throw new Error('Serial port disconnected during write');
      await this.runNativeOperation(port, 'Serial port disconnected during write', (done) => port.drain(done));
    });
  }

  shutdown(): Promise<void> {
    this.shuttingDown = true;
    return this.enqueue(() => this.closeCurrent());
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async closeCurrent(): Promise<void> {
    const port = this.currentPort;
    if (!port) {
      this.lifecycleState = 'closed';
      return;
    }
    this.lifecycleState = 'closing';
    await this.closeSpecific(port);
  }

  private async closeSpecific(port: ManagedSerialPort): Promise<void> {
    this.expectedClosures.add(port);
    let closeError: unknown;
    try {
      if (port.isOpen) await callbackOperation((done) => port.close(done));
    } catch (error) {
      closeError = error;
    }
    this.expectedClosures.delete(port);
    if (this.currentPort === port && port.isOpen) {
      this.lifecycleState = 'open';
      throw closeError;
    }
    if (this.currentPort === port) this.currentPort = undefined;
    this.detach(port);
    if (!this.currentPort) this.lifecycleState = 'closed';
  }

  private attach(port: ManagedSerialPort): void {
    const listeners: PortListeners = {
      data: (chunk) => {
        if (this.currentPort === port) this.dependencies.onData(Buffer.from(chunk).toString('utf8'));
      },
      error: (error) => {
        if (this.currentPort === port && !this.expectedClosures.has(port)) {
          this.dependencies.onError(error.message);
        }
      },
      close: () => {
        const expected = this.expectedClosures.has(port);
        if (this.currentPort !== port) return;
        this.abortNativeOperations(port, new Error('Serial port disconnected during write'));
        this.currentPort = undefined;
        this.lifecycleState = 'closed';
        this.detach(port);
        if (!expected && !this.shuttingDown) this.dependencies.onUnexpectedClose();
      },
    };
    this.listeners.set(port, listeners);
    port.on('data', listeners.data);
    port.on('error', listeners.error);
    port.on('close', listeners.close);
  }

  private detach(port: ManagedSerialPort): void {
    const listeners = this.listeners.get(port);
    if (!listeners) return;
    port.removeListener('data', listeners.data);
    port.removeListener('error', listeners.error);
    port.removeListener('close', listeners.close);
    this.listeners.delete(port);
  }

  private runNativeOperation(
    port: ManagedSerialPort,
    disconnectedMessage: string,
    start: (done: (error?: Error | null) => void) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const settle = (error?: Error | null) => {
        if (settled) return;
        settled = true;
        pending.delete(abort);
        if (error) reject(error);
        else resolve();
      };
      const abort = () => settle(new Error(disconnectedMessage));
      const pending = this.pendingNativeOperations.get(port) ?? new Set<(error: Error) => void>();
      this.pendingNativeOperations.set(port, pending);
      pending.add(abort);
      try {
        start(settle);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private abortNativeOperations(port: ManagedSerialPort, error: Error): void {
    const pending = this.pendingNativeOperations.get(port);
    if (!pending) return;
    for (const abort of [...pending]) abort(error);
    this.pendingNativeOperations.delete(port);
  }
}

function callbackOperation(start: (done: (error?: Error | null) => void) => void): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    start((error) => error ? reject(error) : resolve());
  });
}
