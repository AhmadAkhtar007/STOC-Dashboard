# Five-minute STOC dashboard demonstration

This script uses the browser simulator, the verified and dependable presentation path. Start the dashboard before the audience arrives and keep the Proteus project available only as supporting context unless the separate live validation checklist has been completed on that machine.

## Before the clock starts

- Run `npm run dev:web` and open the Vite URL.
- Confirm the dashboard loads in Simulator mode.
- Keep this script and `EMP.pdf` available in separate windows.
- Do not pre-populate a completed result; the audience should see one controlled end-to-end sequence.
- If the presentation machine was prepared for live Proteus, retain the simulator as the immediate fallback.

## 0:00–0:40 — Frame the problem

Say:

> This system controls a Short Time Over Current test workflow for three electricity-meter profiles. Today you are seeing the professional operator dashboard and its safe software sequence. The displayed currents are design targets, while this demonstration uses a deterministic simulator and raw ADC values—not calibrated amperes.

Point to the connection state and the three test profiles. Briefly name the targets:

- Single Phase: 1200 A design target for 10 ms
- Three Phase Whole Current: 3000 A design target for 10 ms
- LTCT: 300 A design target for 500 ms

## 0:40–1:15 — Explain the architecture

Say:

> One interface supports two transports. The browser uses a deterministic simulator, while the Electron desktop build accesses Proteus or an Arduino through a controlled serial bridge. The test controller enforces the same connect, configure, arm, fire, capture, and completion sequence for either transport.

Choose **Connect simulator**. Point out the connected state and event timeline.

## 1:15–2:05 — Configure a traceable run

Select **Single Phase** for the fastest, easiest-to-explain profile.

Enter:

- Meter serial: `DEMO-MTR-001`
- Operator name: the presenter's name
- Run notes: `Controlled simulator demonstration`

Say:

> The profile defines the intended test envelope. Operator and meter metadata travel with the local result and its exports. No current calibration is implied here.

Point to the profile's target current and duration, including the “design target” wording.

## 2:05–2:50 — Demonstrate the safety gate

Choose **Arm test**.

Say:

> Firing is not available while disconnected or unconfigured. Arming freezes the run metadata and creates a deliberate operator gate. Mouse users must hold the firing control for one second; keyboard users receive a second confirmation dialog.

Hold **Hold to fire — 1 second** continuously. Do not click repeatedly.

As the state changes, point to firing, capture, and the event timeline.

## 2:50–3:40 — Read the waveform honestly

When the run completes, point to the waveform, sample count, peak raw reading, elapsed duration, and **Sequence complete** result.

Say:

> The simulator has returned 200 deterministic samples. The chart is deliberately labelled raw ADC. Sequence complete proves that the command and acquisition workflow completed; it is not an electrical meter pass or a certified current measurement.

Point out the simulated-data label and the new local-history entry.

## 3:40–4:20 — Show traceability and exports

Choose **Export JSON** or **Export CSV**. If browser download prompts would disrupt screen sharing, describe both controls and use **Print summary** instead.

Say:

> JSON preserves the structured run and waveform. CSV gives metadata plus sample index/value rows for engineering analysis. Results are stored locally; this version has no cloud service, accounts, or certification database.

## 4:20–5:00 — Close with the production path

Say:

> The next hardware milestone uses this same interface through Electron and 9600-baud serial communication with Proteus, then the Arduino Mega. Before real high-current operation, we must validate SCR polarity and commutation, calibrate the current-measurement chain, add physical interlocks and a hardwired emergency stop, and create tamper-evident test records. The dashboard is the control foundation, not a claim that those electrical and certification steps are already complete.

End on the completed result and waveform. Do not end on Proteus setup screens or a terminal.

## Fallbacks

- **Proteus or COM connection fails:** immediately return to the browser simulator and say that live communication remains pending presentation-machine validation. Do not troubleshoot serial wiring in front of the audience.
- **Download prompt is hidden:** use **Print summary**, or point to the export controls and continue.
- **Pointer hold is interrupted:** re-arm only if the interface requires it, then hold the button continuously. Do not rapid-click.
- **Unexpected UI error:** disconnect, refresh the page, reconnect the simulator, and repeat the Single Phase sequence.
- **Question about pass/fail:** answer that this release reports workflow completion. Electrical pass/fail requires calibrated current measurements and approved acceptance rules.
