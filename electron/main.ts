import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SerialPort } from 'serialport';
import { SerialPortManager } from './serialPortManager.js';
import { DEV_SERVER_ORIGIN, isAllowedRendererUrl } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = path.join(__dirname, '..', 'dist');
const ALLOWED_COMMANDS = new Set(['1', '2', '3', 'F']);
const channels = {
  listPorts: 'serial:list-ports',
  openPort: 'serial:open-port',
  closePort: 'serial:close-port',
  writeSerial: 'serial:write',
  serialData: 'serial:data',
  serialError: 'serial:error',
  serialClose: 'serial:close',
} as const;

let mainWindow: BrowserWindow | undefined;
const allowDevelopmentOrigin = process.argv.includes(`--dev-server-url=${DEV_SERVER_ORIGIN}`);
const serialManager = new SerialPortManager({
  listPorts: () => SerialPort.list(),
  createPort: (options) => new SerialPort(options),
  onData: (chunk) => sendToRenderer(channels.serialData, chunk),
  onError: (message) => sendToRenderer(channels.serialError, message),
  onUnexpectedClose: () => sendToRenderer(channels.serialClose),
});

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    event.sender !== mainWindow.webContents ||
    !frame ||
    frame !== event.sender.mainFrame ||
    !isAllowedRendererUrl(frame.url, DIST_ROOT, allowDevelopmentOrigin)
  ) {
    throw new Error('Rejected untrusted desktop request');
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0 || value.length > 260) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function sendToRenderer(
  channel: typeof channels.serialData | typeof channels.serialError | typeof channels.serialClose,
  value?: string,
): void {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  if (value === undefined) mainWindow.webContents.send(channel);
  else mainWindow.webContents.send(channel, value);
}

function registerSerialIpc(): void {
  ipcMain.handle(channels.listPorts, async (event) => {
    assertTrustedSender(event);
    const ports = await serialManager.listPorts();
    return ports.map(({ path: portPath, manufacturer }) => ({
      path: portPath,
      ...(manufacturer ? { manufacturer } : {}),
    }));
  });

  ipcMain.handle(channels.openPort, async (event, rawPath: unknown) => {
    assertTrustedSender(event);
    const portPath = requireString(rawPath, 'serial port path');
    await serialManager.open(portPath);
  });

  ipcMain.handle(channels.closePort, async (event) => {
    assertTrustedSender(event);
    await serialManager.close();
  });

  ipcMain.handle(channels.writeSerial, async (event, rawData: unknown) => {
    assertTrustedSender(event);
    const data = requireString(rawData, 'serial command');
    if (!ALLOWED_COMMANDS.has(data)) throw new Error('Rejected unsupported serial command');
    await serialManager.write(data);
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
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const preventUntrustedNavigation = (event: Electron.Event, targetUrl: string) => {
    if (!isAllowedRendererUrl(targetUrl, DIST_ROOT, allowDevelopmentOrigin)) event.preventDefault();
  };
  window.webContents.on('will-navigate', preventUntrustedNavigation);
  window.webContents.on('will-redirect', preventUntrustedNavigation);
  window.once('ready-to-show', () => window.show());
  window.on('close', () => { void serialManager.shutdown(); });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined;
  });

  if (allowDevelopmentOrigin) await window.loadURL(DEV_SERVER_ORIGIN);
  else await window.loadFile(path.join(DIST_ROOT, 'index.html'));
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

app.on('before-quit', () => { void serialManager.shutdown(); });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
