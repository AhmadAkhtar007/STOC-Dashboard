import { contextBridge, ipcRenderer } from 'electron';

const channels = {
  listPorts: 'serial:list-ports',
  openPort: 'serial:open-port',
  closePort: 'serial:close-port',
  writeSerial: 'serial:write',
  serialData: 'serial:data',
  serialError: 'serial:error',
  serialClose: 'serial:close',
} as const;

contextBridge.exposeInMainWorld('stocDesktop', {
  listPorts: () => ipcRenderer.invoke(channels.listPorts),
  openPort: (path: string) => ipcRenderer.invoke(channels.openPort, path),
  closePort: () => ipcRenderer.invoke(channels.closePort),
  writeSerial: (data: string) => ipcRenderer.invoke(channels.writeSerial, data),
  onSerialData: (listener: (chunk: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (typeof value === 'string') listener(value);
    };
    ipcRenderer.on(channels.serialData, wrapped);
    return () => ipcRenderer.removeListener(channels.serialData, wrapped);
  },
  onSerialError: (listener: (message: string) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (typeof value === 'string') listener(value);
    };
    ipcRenderer.on(channels.serialError, wrapped);
    return () => ipcRenderer.removeListener(channels.serialError, wrapped);
  },
  onSerialClose: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on(channels.serialClose, wrapped);
    return () => ipcRenderer.removeListener(channels.serialClose, wrapped);
  },
});
