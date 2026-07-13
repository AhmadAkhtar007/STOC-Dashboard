# STOC dashboard release checklist

**Release candidate:** 0.1.0

**Evidence date:** 2026-07-13

**Scope:** baseline browser demonstration plus compiled Electron/serial application

This checklist records observed evidence. It does not treat planned work or partial artifacts as completed deliverables.

## Functional scope

- [x] Browser dashboard starts in simulator mode.
- [x] Operator workflow includes connect, profile selection, optional metadata, arm, deliberate fire, capture, result, history, and export controls.
- [x] All three profiles are represented with design-target wording.
- [x] Raw samples are labelled as ADC values rather than amperes.
- [x] “Sequence complete” is not presented as electrical pass/fail.
- [x] Electron transport contains COM-port discovery and 9600 8N1 serial operation.
- [ ] Live Proteus/COMPIM communication validated on this host. **Not completed:** Proteus, a virtual COM-pair driver, and serial endpoints were not available/discoverable in the checked environment.
- [ ] Physical Arduino/high-current operation validated. **Not in this release scope.**

## Automated and build evidence

The established pre-documentation verification record reports:

- `npm test`: **12 test files, 124 tests passed**.
- `npm run build:web`: web production build completed and emitted `dist/`.
- `npm run build:desktop`: web and Electron compilation completed and emitted `dist/` plus `dist-electron/`.
- Manual browser runtime: one simulator flow completed with **200 samples** and **no browser console errors** observed.

The documentation revision was verified with the following fresh commands. These checks do not expand the claims above; they confirm the documentation revision did not break the checked codebase.

- [x] `npm test -- --pool=forks --maxWorkers=1` — 12 files, 124 tests passed.
- [x] `npm run test:types` — exited successfully with no TypeScript errors. The project has no separate lint script.
- [x] `npm run build:web` — exited successfully; Vite transformed 621 modules and emitted `dist/`.
- [x] `npm run build:desktop` — exited successfully; the web build repeated and Electron emitted `dist-electron/main.js` plus `dist-electron/preload.cjs`.
- [x] `git diff --check` — the complete staged documentation diff passed with no whitespace errors.

## Windows packaging status

- [x] `npm run package:win` was attempted.
- [x] The attempt timed out during packaging.
- [x] **No portable `.exe` was produced.**
- [x] `release/win-unpacked/` and `release/stoc-dashboard-0.1.0-x64.nsis.7z` are partial/intermediate outputs and are **not** being claimed as a shipped Windows executable.
- [ ] Windows portable executable generated and launched. **Pending; do not claim complete.**

Per the release instruction, `package:win` is not retried during this documentation pass.

## Presentation-machine checks

- [ ] Supported Node.js version installed (`^20.19.0` or `>=22.12.0`).
- [ ] `npm install` or `npm ci` completes on the presentation machine.
- [ ] Browser simulator loads locally.
- [ ] One rehearsal follows [the five-minute demo script](demo-script.md).
- [ ] Browser download/print behavior is checked under the presentation account.
- [ ] Screen scaling keeps the control, waveform, result, and timeline readable.
- [ ] The presenter can state the limitations in [known limitations](limitations.md) without describing raw/simulated values as calibrated current.

If live Proteus is planned, complete every critical item in [the Proteus validation checklist](proteus-validation.md) before the presentation. Otherwise, present the browser simulator and describe Proteus serial communication as pending live environment validation.

## Safety and honesty gate

- [x] Software disconnect is documented as not being a physical emergency stop.
- [x] SCR polarity and commutation concerns are documented.
- [x] The 200-sample limit and LTCT coverage limitation are documented.
- [x] No calibrated-current or meter-certification claim is made.
- [x] No cloud, remote firing, user authorization, or tamper-evident record claim is made.
- [x] No `.env` file or secrets are required; operators are warned not to place secrets in run metadata.

## Release decision

**Approved use:** controlled browser-simulator demonstration and continued Electron/serial engineering.

**Not approved:** a packaged Windows executable, a live-validated Proteus demonstration on the checked host, physical high-current operation, calibrated measurement, official pass/fail testing, or certification reporting.
