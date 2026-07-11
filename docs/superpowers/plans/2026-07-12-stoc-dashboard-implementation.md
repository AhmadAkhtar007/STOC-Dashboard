# STOC Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a presentation-ready STOC dashboard that runs in a browser with deterministic simulation and in Electron with Proteus/Arduino serial communication.

**Architecture:** A React/TypeScript interface delegates workflow rules to a pure test controller and communicates through a transport-neutral `DeviceAdapter`. Simulator and Electron serial adapters emit the same normalized events. Browser persistence is local-only; Electron exposes serial operations through a narrow preload API.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS 4, Recharts, Vitest, React Testing Library, Electron, `serialport`, Electron Builder.

---

## File Map

- `package.json` - scripts, runtime dependencies, packaging metadata
- `vite.config.ts` - browser build and Vitest configuration
- `electron/main.ts` - Electron lifecycle and serial IPC handlers
- `electron/preload.ts` - narrow renderer API
- `src/domain/types.ts` - profiles, states, results, events, adapter contracts
- `src/domain/profiles.ts` - immutable STOC test profiles
- `src/domain/testMachine.ts` - pure legal-transition reducer
- `src/protocol/serialParser.ts` - incremental firmware-line parser
- `src/adapters/simulatorAdapter.ts` - deterministic presentation device
- `src/adapters/electronSerialAdapter.ts` - renderer-side Electron adapter
- `src/controller/testController.ts` - run orchestration, timeouts, and result assembly
- `src/storage/resultStore.ts` - local history persistence
- `src/storage/exporters.ts` - JSON and CSV generation/download
- `src/components/` - focused dashboard sections
- `src/App.tsx` - composition and application-level state
- `src/styles.css` - Tailwind import and product theme
- `tests/` - domain, parser, adapter, controller, storage, and UI tests
- `README.md` - setup, operation, Proteus connection, limitations
- `docs/demo-script.md` - rehearsable five-minute presentation

## Task 1: Scaffold the Shared Browser Application

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Create the package manifest**

```json
{
  "name": "stoc-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build:web": "tsc -b && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b --pretty false",
    "electron:dev": "concurrently -k \"vite\" \"wait-on http://127.0.0.1:5173 && electron .\"",
    "build:electron": "tsc -p electron/tsconfig.json && npm run build:web",
    "package:win": "npm run build:electron && electron-builder --win portable"
  },
  "dependencies": {
    "@serialport/parser-readline": "^13.0.0",
    "lucide-react": "^0.468.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0",
    "serialport": "^13.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.1.0",
    "electron": "^33.2.0",
    "electron-builder": "^25.1.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0",
    "wait-on": "^8.0.0"
  },
  "build": {
    "appId": "pk.edu.stoc.dashboard",
    "productName": "STOC Energy Meter Test System",
    "files": ["dist/**/*", "dist-electron/**/*", "package.json"],
    "win": { "target": "portable" }
  }
}
```

- [ ] **Step 2: Add strict TypeScript and Vite/Vitest configuration**

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] },
});
```

Use `strict: true`, `noUncheckedIndexedAccess: true`, `jsx: "react-jsx"`, and project references for the app, Vite configuration, and Electron configuration.

- [ ] **Step 3: Add the minimal application entry**

```tsx
// src/App.tsx
export function App() {
  return <main className="min-h-screen bg-slate-950 text-slate-100">STOC Dashboard</main>;
}
```

```css
/* src/styles.css */
@import "tailwindcss";

:root { font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: dark; }
body { margin: 0; min-width: 320px; background: #020617; }
button, input, select, textarea { font: inherit; }
```

- [ ] **Step 4: Install and verify the scaffold**

Run: `npm install`

Run: `npm run build:web`

Expected: TypeScript and Vite complete successfully and create `dist/index.html`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts index.html src
git commit -m "chore: scaffold STOC dashboard"
```

## Task 2: Define Profiles and the Test State Machine

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/profiles.ts`
- Create: `src/domain/testMachine.ts`
- Create: `tests/domain/testMachine.test.ts`

- [ ] **Step 1: Write failing state-machine tests**

```ts
import { describe, expect, it } from 'vitest';
import { initialTestState, transition } from '../../src/domain/testMachine';

describe('test state machine', () => {
  it('requires connection, profile, and arming before firing', () => {
    expect(() => transition(initialTestState, { type: 'FIRE' })).toThrow('Test is not armed');
  });

  it('completes the legal operator sequence', () => {
    let state = transition(initialTestState, { type: 'CONNECT' });
    state = transition(state, { type: 'CONNECTED' });
    state = transition(state, { type: 'SELECT_PROFILE', profileId: 'single-phase' });
    state = transition(state, { type: 'ARM' });
    state = transition(state, { type: 'FIRE' });
    state = transition(state, { type: 'FIRING_ACK' });
    state = transition(state, { type: 'FIRE_COMPLETE' });
    state = transition(state, { type: 'WAVEFORM', samples: [512, 700, 512] });
    expect(state.status).toBe('complete');
  });
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run: `npm test -- tests/domain/testMachine.test.ts`

Expected: FAIL because the domain modules do not exist.

- [ ] **Step 3: Implement the domain types and profiles**

```ts
// src/domain/types.ts
export type ProfileId = 'single-phase' | 'three-phase' | 'ltct';
export type TestStatus = 'disconnected' | 'connecting' | 'connected' | 'configured' | 'armed' | 'firing' | 'capturing' | 'complete' | 'error';

export interface TestProfile {
  id: ProfileId;
  name: string;
  targetAmps: number;
  durationMs: number;
  serialCommand: '1' | '2' | '3';
}

export interface TestState {
  status: TestStatus;
  profileId?: ProfileId;
  samples: number[];
  error?: string;
}

export type TestAction =
  | { type: 'CONNECT' } | { type: 'CONNECTED' } | { type: 'DISCONNECT' }
  | { type: 'SELECT_PROFILE'; profileId: ProfileId } | { type: 'ARM' }
  | { type: 'FIRE' } | { type: 'FIRING_ACK' } | { type: 'FIRE_COMPLETE' }
  | { type: 'WAVEFORM'; samples: number[] } | { type: 'FAIL'; message: string }
  | { type: 'RESET' };
```

```ts
// src/domain/profiles.ts
import type { ProfileId, TestProfile } from './types';

export const PROFILES: Record<ProfileId, TestProfile> = {
  'single-phase': { id: 'single-phase', name: 'Single Phase', targetAmps: 1200, durationMs: 10, serialCommand: '1' },
  'three-phase': { id: 'three-phase', name: 'Three Phase Whole Current', targetAmps: 3000, durationMs: 10, serialCommand: '2' },
  ltct: { id: 'ltct', name: 'LTCT', targetAmps: 300, durationMs: 500, serialCommand: '3' },
};
```

- [ ] **Step 4: Implement the pure transition reducer**

Implement `transition(state, action)` as an exhaustive switch. Reject illegal actions with explicit errors. `DISCONNECT` always returns `initialTestState`; `FAIL` always creates `error`; `RESET` preserves a selected profile only when still connected. `WAVEFORM` may complete only from `capturing` and with at least one sample.

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/domain/testMachine.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat: add STOC test state machine"
```

## Task 3: Build the Incremental Serial Protocol Parser

**Files:**
- Create: `src/protocol/serialParser.ts`
- Create: `tests/protocol/serialParser.test.ts`

- [ ] **Step 1: Write parser tests**

```ts
import { describe, expect, it } from 'vitest';
import { SerialParser } from '../../src/protocol/serialParser';

describe('SerialParser', () => {
  it('reassembles fragmented messages', () => {
    const parser = new SerialParser();
    expect(parser.push('FIRE_')).toEqual([]);
    expect(parser.push('COMPLETE\r\n')).toEqual([{ type: 'fire-complete' }]);
  });

  it('parses a valid waveform', () => {
    const parser = new SerialParser();
    expect(parser.push('WAVEFORM:0,512,1023\n')).toEqual([{ type: 'waveform', samples: [0, 512, 1023] }]);
  });

  it('reports out-of-range samples', () => {
    const parser = new SerialParser();
    expect(parser.push('WAVEFORM:512,1024\n')[0]).toMatchObject({ type: 'protocol-error' });
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test -- tests/protocol/serialParser.test.ts`

Expected: FAIL because `SerialParser` does not exist.

- [ ] **Step 3: Implement the parser**

```ts
export type ProtocolEvent =
  | { type: 'mode'; mode: string }
  | { type: 'firing' }
  | { type: 'fire-complete' }
  | { type: 'waveform'; samples: number[] }
  | { type: 'device-error'; message: string }
  | { type: 'diagnostic'; message: string }
  | { type: 'protocol-error'; message: string; raw: string };

export class SerialParser {
  private buffer = '';

  push(chunk: string): ProtocolEvent[] {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.filter(Boolean).map((line) => this.parseLine(line.trim()));
  }

  private parseLine(line: string): ProtocolEvent {
    if (line.startsWith('MODE: ')) return { type: 'mode', mode: line.slice(6) };
    if (line === 'FIRING') return { type: 'firing' };
    if (line === 'FIRE_COMPLETE') return { type: 'fire-complete' };
    if (line.startsWith('ERROR:')) return { type: 'device-error', message: line.slice(6).trim() };
    if (!line.startsWith('WAVEFORM:')) return { type: 'diagnostic', message: line };
    const raw = line.slice(9);
    const samples = raw.split(',').map(Number);
    if (!raw || samples.some((value) => !Number.isInteger(value) || value < 0 || value > 1023)) {
      return { type: 'protocol-error', message: 'Invalid waveform payload', raw: line };
    }
    return { type: 'waveform', samples };
  }
}
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/protocol/serialParser.test.ts`

Expected: PASS.

```bash
git add src/protocol tests/protocol
git commit -m "feat: parse STOC firmware protocol"
```

## Task 4: Implement the Adapter Contract and Deterministic Simulator

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/adapters/simulatorAdapter.ts`
- Create: `tests/adapters/simulatorAdapter.test.ts`

- [ ] **Step 1: Add the adapter contract**

```ts
export type AdapterKind = 'simulator' | 'serial';
export type DeviceEvent =
  | { type: 'connected'; label: string }
  | { type: 'disconnected' }
  | { type: 'mode-confirmed'; profileId: ProfileId }
  | { type: 'firing' }
  | { type: 'fire-complete' }
  | { type: 'waveform'; samples: number[] }
  | { type: 'diagnostic'; message: string }
  | { type: 'error'; message: string };

export interface DeviceAdapter {
  readonly kind: AdapterKind;
  connect(target?: string): Promise<void>;
  disconnect(): Promise<void>;
  selectProfile(profile: TestProfile): Promise<void>;
  fire(): Promise<void>;
  subscribe(listener: (event: DeviceEvent) => void): () => void;
}
```

- [ ] **Step 2: Write a fake-timer simulator test**

Verify that `connect()` emits `connected`, profile selection emits `mode-confirmed`, and `fire()` emits `firing`, `fire-complete`, and a deterministic non-empty waveform in order. Verify that firing while disconnected rejects.

- [ ] **Step 3: Implement `SimulatorAdapter`**

Use a listener `Set`, a selected profile field, and injected timer functions. Generate 200 samples with a damped sine wave centered on 512. Use profile-specific amplitude and frequency, clamp to 0-1023, and do not use randomness so tests and presentations are repeatable.

```ts
const waveform = Array.from({ length: 200 }, (_, index) => {
  const envelope = Math.exp(-index / 260);
  const value = 512 + 360 * envelope * Math.sin((index / 199) * Math.PI * cycles);
  return Math.max(0, Math.min(1023, Math.round(value)));
});
```

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/adapters/simulatorAdapter.test.ts`

Expected: PASS.

```bash
git add src/domain src/adapters tests/adapters
git commit -m "feat: add deterministic STOC simulator"
```

## Task 5: Orchestrate Runs with the Test Controller

**Files:**
- Create: `src/controller/testController.ts`
- Create: `tests/controller/testController.test.ts`

- [ ] **Step 1: Write controller tests**

Test the complete run, fire rejection before arming, repeated-fire rejection, connection loss, and timeout when no firing acknowledgement arrives. Use a fake adapter and fake timers.

- [ ] **Step 2: Implement controller responsibilities**

`TestController` owns current state, event log, run metadata, active adapter subscription, and four explicit timeouts: connection 3 seconds, mode confirmation 2 seconds, firing acknowledgement 2 seconds, and waveform completion 3 seconds after the profile duration.

Expose:

```ts
connect(adapter: DeviceAdapter, target?: string): Promise<void>
disconnect(): Promise<void>
selectProfile(profileId: ProfileId): Promise<void>
arm(metadata: RunMetadata): void
fire(): Promise<void>
reset(): void
subscribe(listener: (snapshot: ControllerSnapshot) => void): () => void
```

On valid completion, assemble a `TestResult` with a generated UUID, timestamps, adapter kind, metadata, profile, samples, raw peak, and `sequence-complete` outcome. Never calculate amperes.

- [ ] **Step 3: Run tests and commit**

Run: `npm test -- tests/controller/testController.test.ts`

Expected: PASS.

```bash
git add src/controller tests/controller
git commit -m "feat: orchestrate safe STOC test runs"
```

## Task 6: Add Local History and Exports

**Files:**
- Create: `src/storage/resultStore.ts`
- Create: `src/storage/exporters.ts`
- Create: `tests/storage/resultStore.test.ts`
- Create: `tests/storage/exporters.test.ts`

- [ ] **Step 1: Write persistence and export tests**

Verify newest-first history, recovery from invalid stored JSON, maximum retention of 50 runs, JSON round-trip, and CSV headers `sample_index,raw_adc`.

- [ ] **Step 2: Implement storage**

```ts
const KEY = 'stoc:test-results:v1';
const LIMIT = 50;

export function loadResults(storage: Storage = localStorage): TestResult[] {
  try { return JSON.parse(storage.getItem(KEY) ?? '[]') as TestResult[]; }
  catch { return []; }
}

export function saveResult(result: TestResult, storage: Storage = localStorage): TestResult[] {
  const results = [result, ...loadResults(storage)].slice(0, LIMIT);
  storage.setItem(KEY, JSON.stringify(results));
  return results;
}
```

- [ ] **Step 3: Implement pure export formatters and a browser download helper**

JSON must include the full result. CSV must include human-readable metadata as comment lines followed by sample index and raw ADC values. Sanitize spreadsheet-leading `=`, `+`, `-`, and `@` in entered metadata.

- [ ] **Step 4: Run tests and commit**

Run: `npm test -- tests/storage`

Expected: PASS.

```bash
git add src/storage tests/storage
git commit -m "feat: persist and export STOC results"
```

## Task 7: Build the Professional Operator Dashboard

**Files:**
- Create: `src/components/SystemHeader.tsx`
- Create: `src/components/ConnectionPanel.tsx`
- Create: `src/components/ProfileSelector.tsx`
- Create: `src/components/TestControls.tsx`
- Create: `src/components/WaveformChart.tsx`
- Create: `src/components/ResultSummary.tsx`
- Create: `src/components/EventTimeline.tsx`
- Create: `src/components/HistoryPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Create: `tests/ui/operatorFlow.test.tsx`

- [ ] **Step 1: Write the critical operator-flow test**

Render `App` with an injected simulator. Assert that Fire is disabled when disconnected, then connect, select Single Phase, arm, hold-to-fire, and verify that a completed result and waveform appear. Use accessible role and label queries only.

- [ ] **Step 2: Implement the application layout**

Use a restrained industrial visual language: slate background, cyan instrumentation accents, amber for armed state, red only for destructive/error states, green only for verified completion. Use a 12-column responsive grid with connection/setup on the left and live waveform/results on the right. Avoid decorative gradients behind data.

- [ ] **Step 3: Implement hold-to-fire**

`TestControls` starts a 1000 ms timer on pointer down, displays progress, cancels on pointer up/leave/cancel, and calls `onFire` only after the timer completes. Keyboard users activate an explicit confirmation dialog rather than relying on pointer hold.

- [ ] **Step 4: Implement waveform and summaries**

Use `ResponsiveContainer`, `LineChart`, numeric X axis labelled `Sample`, and Y domain `[0, 1023]` labelled `Raw ADC`. Disable chart animation for deterministic tests and fast rendering. Display design target, intended duration, sample count, raw peak, adapter type, and sequence outcome.

- [ ] **Step 5: Implement history and export controls**

Show the latest five runs with timestamp, profile, adapter label, and outcome. Provide JSON and CSV actions for the selected result and a print action using `window.print()`.

- [ ] **Step 6: Run UI tests and build**

Run: `npm test -- tests/ui/operatorFlow.test.tsx`

Run: `npm run build:web`

Expected: tests PASS and production build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src tests/ui
git commit -m "feat: build STOC operator dashboard"
```

## Task 8: Add Electron and Proteus Serial Communication

**Files:**
- Create: `electron/tsconfig.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/electron.d.ts`
- Create: `src/adapters/electronSerialAdapter.ts`
- Create: `tests/adapters/electronSerialAdapter.test.ts`

- [ ] **Step 1: Define the narrow preload API**

```ts
export interface StocDesktopApi {
  listPorts(): Promise<Array<{ path: string; manufacturer?: string }>>;
  openPort(path: string): Promise<void>;
  closePort(): Promise<void>;
  writeSerial(data: string): Promise<void>;
  onSerialData(listener: (chunk: string) => void): () => void;
  onSerialError(listener: (message: string) => void): () => void;
}
```

Expose only these functions through `contextBridge`; keep `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled.

- [ ] **Step 2: Write adapter tests with a fake preload API**

Verify commands `1`, `2`, `3`, and `F`, parser-driven normalized events, subscriber cleanup, and port closure.

- [ ] **Step 3: Implement Electron main-process serial ownership**

The main process alone imports `serialport`. Register IPC handlers for listing, opening at 9600/8N1, writing, and closing. Forward UTF-8 chunks and errors to the renderer. Reject writes without an open port. Close the port when the window closes.

- [ ] **Step 4: Implement the renderer adapter**

`ElectronSerialAdapter` uses `window.stocDesktop`, the incremental `SerialParser`, and the profile table. It maps protocol messages into `DeviceEvent` values and never exposes Electron IPC details to the controller.

- [ ] **Step 5: Run tests and desktop compilation**

Run: `npm test -- tests/adapters/electronSerialAdapter.test.ts`

Run: `npm run build:electron`

Expected: PASS and `dist-electron/main.js` exists.

- [ ] **Step 6: Commit**

```bash
git add electron src/adapters src/electron.d.ts tests/adapters package.json
git commit -m "feat: connect STOC dashboard to serial devices"
```

## Task 9: Validate Proteus Integration

**Files:**
- Modify: `projectsuccessfullyruned/EMP.pdsprj` through Proteus UI only
- Create: `docs/proteus-setup.md`
- Create: `docs/proteus-validation.md`

- [ ] **Step 1: Repair the firmware reference in Proteus**

Open the ATmega2560 properties and select the bundled `projectsuccessfullyruned/STOC_Firmware.ino.hex`, replacing the missing original Downloads path. Do not modify the schematic wiring during this dashboard milestone.

- [ ] **Step 2: Configure a virtual serial pair**

Create a paired COM connection using the already-available Windows virtual serial driver. Assign one endpoint to Proteus COMPIM and the other to the dashboard. Configure both endpoints at 9600 baud, 8N1, without hardware flow control.

- [ ] **Step 3: Exercise the protocol manually**

For each profile, verify the dashboard sends the correct mode byte and receives its `MODE:` confirmation. Fire once and capture `FIRING`, `FIRE_COMPLETE`, and `WAVEFORM:`. Do not repeatedly fire while investigating the previously identified SCR polarity concern.

- [ ] **Step 4: Document the exact result**

Record Proteus version, COM endpoints, firmware path, successful messages, observed waveform sample count, screenshots, and every blocker. Clearly distinguish dashboard communication success from electrical validation.

- [ ] **Step 5: Commit**

```bash
git add projectsuccessfullyruned/EMP.pdsprj docs/proteus-setup.md docs/proteus-validation.md
git commit -m "docs: validate Proteus dashboard connection"
```

## Task 10: Package, Document, and Rehearse the Delivery

**Files:**
- Create: `README.md`
- Create: `docs/demo-script.md`
- Create: `docs/limitations.md`
- Create: `docs/release-checklist.md`

- [ ] **Step 1: Write the operator README**

Include prerequisites, `npm install`, browser startup, desktop startup, production build, Windows packaging, simulator workflow, Proteus setup link, exports, troubleshooting, and the distinction between design targets and measured current.

- [ ] **Step 2: Write the five-minute presentation script**

Use this timed structure: 30 seconds problem/objective, 45 seconds architecture, 60 seconds connect and profile selection, 60 seconds arm/fire/capture, 45 seconds waveform/result/export, 30 seconds honest limitations, 30 seconds production roadmap.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run lint`

Expected: zero TypeScript errors.

Run: `npm run build:web`

Expected: browser production build succeeds.

Run: `npm run package:win`

Expected: a portable Windows executable is produced under `dist/` or a precise native-module packaging blocker is recorded.

- [ ] **Step 4: Perform manual acceptance**

Complete all three profiles in simulator mode, export JSON and CSV, reload and verify history, exercise an invalid action, disconnect and reconnect, then repeat the five-minute script without developer tools. If Proteus is available, repeat the connection flow once with the documented live configuration.

- [ ] **Step 5: Create the release checklist**

Record the exact executable/build path, tested browser, tested Windows version, Proteus status, known limitations, and fallback presentation instructions. No unchecked critical item may be described as complete.

- [ ] **Step 6: Commit**

```bash
git add README.md docs
git commit -m "docs: prepare STOC dashboard demonstration"
```

## Execution Order for the One-Day Deadline

- **Guaranteed demonstration path:** Tasks 1-7 and Task 10 browser verification.
- **Live integration path:** Task 8, then Task 9.
- **Stop-the-line rule:** If desktop packaging or Proteus consumes more than 90 minutes without measurable progress, document the blocker and return to polishing and rehearsing the guaranteed simulator build.
- **Safety rule:** Do not modify or energize real high-current hardware during this software milestone.

