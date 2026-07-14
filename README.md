# STOC Energy Meter Test System

The STOC dashboard is a demonstration and engineering-control interface for the Short Time Over Current energy-meter project. The same React interface runs in a browser with a deterministic simulator and in Electron with direct Windows serial-port access for Proteus or an Arduino Mega.

This release is a laboratory demonstration, not a calibrated meter-certification instrument. The profile currents shown in the interface are **design targets**. Waveform values are raw 10-bit ADC samples, not amperes, and “Sequence complete” means that the software workflow completed—not that a meter passed an electrical test.

## Prerequisites

- Windows 10 or 11 for the Electron/serial workflow
- Node.js `^20.19.0` or `>=22.12.0`, as declared in `package.json`
- npm (included with Node.js)
- For live Proteus use: Proteus 8 and a Windows virtual null-modem COM-pair driver

For a Windows Proteus workstation, validate the bundled project and firmware, create the legacy firmware path expected by the unchanged archive, install locked dependencies, and compile the desktop application with one command:

```powershell
npm run setup:proteus
```

This command runs `npm ci` and `npm run build:desktop`. It does not install Proteus or a virtual COM-pair driver, alter the schematic/archive, or perform live serial/electrical validation. Its final output gives the exact COM-pair and 9600 8N1 steps. To inspect its actions without copying firmware, installing dependencies, or building, run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-proteus.ps1 -DryRun`.

## Run the browser dashboard

The browser build always uses the built-in simulator; browsers do not receive direct serial-port access from this application.

```powershell
npm run dev:web
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173/` or `http://localhost:5173/`.

Build and locally serve the production web bundle:

```powershell
npm run build:web
npm exec -- vite preview --host 127.0.0.1
```

The production files are emitted to `dist/`.

## Run the Electron dashboard

Electron is required for direct serial communication:

```powershell
npm run dev:electron
```

To compile both the web application and Electron processes, then start the compiled desktop application:

```powershell
npm run build:desktop
npm run start:electron
```

`build:desktop` emits the renderer to `dist/` and Electron code to `dist-electron/`. It does not create a distributable `.exe`.

The Windows portable packaging command is:

```powershell
npm run package:win
```

The latest packaging attempt timed out and did not produce a usable `.exe`; see [the release checklist](docs/release-checklist.md). Run the dashboard from source for the demonstration unless packaging is completed and independently verified on the presentation machine.

## Simulator workflow

1. Choose **Connect simulator**.
2. Select Single Phase, Three Phase Whole Current, or LTCT.
3. Optionally enter the meter serial number, operator name, and run notes.
4. Choose **Arm test** and review the selected profile.
5. Hold **Hold to fire — 1 second** continuously. Keyboard users can press Enter or Space and then choose **Confirm fire**.
6. Wait for firing, capture, and the completed raw-ADC waveform.
7. Review the event timeline and recent local history.
8. Export the selected result as JSON or CSV, or print the summary.

The simulator is the reliable demonstration path. It generates a deterministic 200-sample waveform so that the workflow can be rehearsed without Proteus or energized equipment.

## Proteus or Arduino serial operation

Serial operation is available only in Electron. The current firmware protocol uses 9600 baud, 8 data bits, no parity, one stop bit, and no flow control (9600 8N1).

On a fresh Windows workstation, run `npm run setup:proteus` first. The script validates `projectsuccessfullyruned/EMP.pdsprj` and the bundled HEX, then copies the HEX to the legacy relative path already recorded inside the Proteus archive without modifying the archive itself.

1. Start Proteus with COMPIM connected to one endpoint of a virtual COM pair, or connect the Arduino Mega over USB.
2. Start the Electron dashboard.
3. Choose **Refresh ports**, select the dashboard-side COM port, and choose **Connect Proteus / Arduino**.
4. Select a profile and confirm its `MODE:` response in the event timeline before arming.
5. Use one controlled arm-and-fire sequence.
6. Disconnect after the run.

Do not open the same COM port in Proteus and the dashboard. Proteus uses one endpoint and the dashboard uses its paired endpoint. Close Arduino Serial Monitor and any other application that may own the port.

The packaged Proteus project contains a non-portable firmware path. Before live use, follow [Proteus connection setup](docs/proteus-setup.md). The current evidence and presentation-machine acceptance checklist are in [Proteus validation](docs/proteus-validation.md).

## Results, history, and exports

- Completed runs are stored locally in the browser/Electron renderer's local storage; there is no cloud service or shared database.
- The dashboard retains recent run records on that Windows user profile and application/browser context.
- JSON export preserves the complete structured result, metadata, and waveform samples.
- CSV export includes run metadata followed by raw sample index/value rows.
- **Print summary** uses the operating system print dialog and a compact print layout.

Exported records are engineering evidence only. They are not signed, access-controlled, tamper-evident, calibrated, or suitable as official compliance certificates.

## Verification

```powershell
npm test -- --pool=forks --maxWorkers=1
npm run test:types
npm run build:web
npm run build:desktop
git diff --check
```

The exact evidence for this release is recorded in [the release checklist](docs/release-checklist.md).

## Troubleshooting

### The browser says “Simulator”

That is expected. Direct serial access is intentionally confined to the Electron bridge. Run `npm run dev:electron` for COM-port controls.

### No serial ports appear

- Choose **Refresh ports**.
- Confirm the device or both virtual COM endpoints appear in Windows Device Manager.
- Close Proteus, Arduino Serial Monitor, terminal programs, and other tools that might own the dashboard-side port.
- In a virtual pair, make sure Proteus and the dashboard select opposite endpoints.

### Proteus does not start the firmware

The project references a path from the original author's computer. Set the ATmega2560 **Program File** property to `projectsuccessfullyruned/STOC_Firmware.ino.hex` through the Proteus UI. Keep the MCU clock at 16 MHz.

### A mode or fire command times out

Verify 9600 8N1 on both sides, no flow control, a free paired endpoint, and the firmware response text described in the Proteus setup guide. Disconnect before changing serial settings. Do not repeatedly fire while troubleshooting.

### The waveform is not in amperes

That is intentional. The firmware supplies raw ADC values and no validated current calibration factor exists. Do not relabel or interpret them as measured current.

### The Windows package is missing

The last `package:win` attempt timed out before a portable executable was generated. The partial `release/` contents are not a distributable release. Use `npm run dev:electron` or `npm run build:desktop` followed by `npm run start:electron`.

## Safety and security boundary

- Software disconnect stops communication; it is **not** an emergency stop and cannot be relied on to de-energize an SCR or high-current circuit.
- Do not connect real high-current hardware until a qualified electrical engineer validates the power stage, isolation, physical emergency stop, contactor/interlocks, protections, and calibration chain.
- The documented SCR gate polarity and natural-commutation behavior require separate engineering validation.
- This local application has no authentication or authorization. Do not expose it as a remotely reachable firing service.
- Keep serial access local to the controlled test computer. Do not bridge it to untrusted web content or networks.
- Do not store credentials, API keys, or personal secrets in source files or run notes. No secrets or `.env` file are required by this project.

See [known limitations](docs/limitations.md) before any demonstration or hardware connection.
