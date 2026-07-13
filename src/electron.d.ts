export interface SerialPortDescriptor {
  path: string;
  manufacturer?: string;
}

export interface StocDesktopApi {
  listPorts(): Promise<SerialPortDescriptor[]>;
  openPort(path: string): Promise<void>;
  closePort(): Promise<void>;
  writeSerial(data: string): Promise<void>;
  onSerialData(listener: (chunk: string) => void): () => void;
  onSerialError(listener: (message: string) => void): () => void;
  onSerialClose(listener: () => void): () => void;
}

declare global {
  interface Window {
    stocDesktop?: StocDesktopApi;
  }
}
