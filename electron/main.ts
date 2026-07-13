import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SerialPort } from 'serialport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = 'http://127.0.0.1:5173';
const ALLOWED_COMMANDS = new Set(['1', '2', '3', 'F']);
const channels = {
  listPorts: 'serial:list-ports',
  openPort: 'serial:open-port',
  closePort: 'serial:close-port',
  writeSerial: 'serial:write',
  serialData: 'serial:data',
  serialError: 'serial:error',
} as const;

let mainWindow: BrowserWindow | undefined;
let activePort: SerialPort | undefined;
let openingPort = false;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) {
    throw new Error('Rejected untrusted desktop request');
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > 260) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function sendToRenderer(channel: typeof channels.serialData | typeof channels.serialError, value: string): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  mainWindow.webContents.send(channel, value);
}

async function closeSerialPort(): Promise<void> {
  const port = activePort;
  activePort = undefined;
  if (!port) return;
  port.removeAllListeners('data');
  port.removeAllListeners('error');
  if (!port.isOpen) return;
  await new Promise<void>((resolve, reject) => {
    port.close((error) => error ? reject(error) : resolve());
  });
}

function registerSerialIpc(): void {
  ipcMain.handle(channels.listPorts, async (event) => {
    assertTrustedSender(event);
    const ports = await SerialPort.list();
    return ports.map(({ path: portPath, manufacturer }) => ({
      path: portPath,
      ...(manufacturer ? { manufacturer } : {}),
    }));
  });

  ipcMain.handle(channels.openPort, async (event, rawPath: unknown) => {
    assertTrustedSender(event);
    const portPath = requireString(rawPath, 'serial port path');
    if (activePort || openingPort) throw new Error('A serial port is already open or opening');
    openingPort = true;
    try {
      const availablePorts = await SerialPort.list();
      if (!availablePorts.some((port) => port.path === portPath)) {
        throw new Error('Selected serial port is unavailable');
      }

      const port = new SerialPort({
        path: portPath,
        baudRate: 9_600,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        autoOpen: false,
      });
      port.on('data', (chunk: Buffer) => sendToRenderer(channels.serialData, chunk.toString('utf8')));
      port.on('error', (error: Error) => sendToRenderer(channels.serialError, error.message));
      try {
        await new Promise<void>((resolve, reject) => {
          port.open((error) => error ? reject(error) : resolve());
        });
        activePort = port;
      } catch (error) {
        port.removeAllListeners();
        throw error;
      }
    } finally {
      openingPort = false;
    }
  });

  ipcMain.handle(channels.closePort, async (event) => {
    assertTrustedSender(event);
    await closeSerialPort();
  });

  ipcMain.handle(channels.writeSerial, async (event, rawData: unknown) => {
    assertTrustedSender(event);
    const data = requireString(rawData, 'serial command');
    if (!ALLOWED_COMMANDS.has(data)) throw new Error('Rejected unsupported serial command');
    const port = activePort;
    if (!port?.isOpen) throw new Error('Cannot write without an open serial port');
    await new Promise<void>((resolve, reject) => {
      port.write(data, (writeError) => {
        if (writeError) {
          reject(writeError);
          return;
        }
        port.drain((drainError) => drainError ? reject(drainError) : resolve());
      });
    });
  });
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1_440,
    height: 960,
    minWidth: 1_100,
    minHeight: 720,
    backgroundColor: '#070b0d',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow = window;
  window.removeMenu();
  window.once('ready-to-show', () => window.show());
  window.on('close', () => { void closeSerialPort(); });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  const devArgument = process.argv.find((argument) => argument.startsWith('--dev-server-url='));
  if (devArgument === `--dev-server-url=${DEV_SERVER_URL}`) await window.loadURL(DEV_SERVER_URL);
  else await window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

registerSerialIpc();

app.whenReady().then(async () => {
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error: unknown) => {
  console.error(error);
  app.quit();
});

app.on('before-quit', () => { void closeSerialPort(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
