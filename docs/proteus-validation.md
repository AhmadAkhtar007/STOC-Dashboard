# Proteus integration validation record

**Record date:** 2026-07-13

**Scope:** Development-machine readiness and repository-level serial integration evidence

**Electrical validation:** Not performed

## Executive result

Live Proteus-to-dashboard communication was **not validated on this machine**. The development environment did not expose Proteus, a compatible virtual COM-pair driver, or any serial ports, so there was no honest route to run the Proteus project or connect COMPIM to the Electron dashboard.

The dashboard's serial protocol, parser, Electron bridge, serial lifecycle, and simulator are covered by automated tests. That evidence reduces software risk but does not replace a live Proteus run. The presentation machine must complete the acceptance checklist below before anyone describes Proteus integration as demonstrated.

## Environment checks performed

The following checks were made on the Windows development host on 2026-07-13:

| Check | Observed result | Consequence |
| --- | --- | --- |
| Proteus/Labcenter uninstall registration | No discoverable entry | Proteus installation could not be established from installed-program metadata. |
| Proteus executable or `.pdsprj` file association | No discoverable executable or association | The project could not be opened through an identified Proteus installation. |
| Virtual COM/com0com installation | No discoverable entry | A null-modem COM pair could not be configured. |
| `Win32_SerialPort` devices | No devices reported | The Electron dashboard had no serial endpoint to open. |

These are absence-of-discovery results for this host, not proof that another presentation computer lacks the required software.

## Repository facts verified

- `projectsuccessfullyruned/EMP.pdsprj` contains the Proteus project archive.
- The ATmega2560 Program File setting in that archive points to the non-portable path `..\Downloads\STOC_Firmware\build\arduino.avr.mega\STOC_Firmware.ino.hex`.
- The correct bundled application image is `projectsuccessfullyruned/STOC_Firmware.ino.hex`.
- COMPIM is configured for 9600 baud in the packaged project.
- The firmware initializes serial at 9600 baud and accepts mode bytes `1`, `2`, and `3`, plus fire byte `F` (lowercase `f` is also accepted by the current firmware).
- The firmware's expected response sequence uses `MODE: Single Phase`, `MODE: Three Phase`, `MODE: LTCT`, `FIRING`, `FIRE_COMPLETE`, and `WAVEFORM:` messages.
- The desktop dashboard lists discovered serial ports, opens the selected endpoint at 9600 8N1, sends only supported command bytes, incrementally parses firmware output, and maps it into controller events.

The `.pdsprj` file was not modified during this validation record. The firmware-path repair must be performed through the Proteus UI as described in [Proteus connection setup](./proteus-setup.md).

## What automated evidence establishes

Repository tests exercise these software-only behaviors:

- Incremental parsing of fragmented and combined serial lines.
- Recognition of mode, firing, completion, waveform, diagnostic, and error messages.
- Rejection of malformed, oversized, or out-of-range waveform payloads.
- Mapping dashboard profiles to firmware bytes `1`, `2`, and `3`, and firing to `F`.
- Electron preload listener registration and cleanup.
- Serial-port open/write/drain/close and unexpected-disconnect lifecycle behavior.
- Safe controller sequencing and deterministic simulator completion.

This evidence can be reproduced with:

```powershell
npm test -- tests/protocol tests/adapters/electronSerialAdapter.test.ts tests/electron
npm run build:electron
```

Passing these commands establishes that the code compiles and behaves against controlled test doubles. It does **not** establish that Windows virtual ports, Proteus COMPIM, the packaged schematic, or the SCR power stage work on a real presentation machine.

### Verification run on 2026-07-13

- `npm test` completed with **12 test files and 124 tests passing**, including 10 deterministic simulator-adapter tests, 20 protocol-parser tests, 18 Electron serial-adapter tests, 8 serial-port-manager tests, and the guarded operator-flow tests.
- The focused serial command `npm test -- tests/protocol tests/adapters/electronSerialAdapter.test.ts tests/electron` completed with **4 test files and 49 tests passing**.
- `npm run build:electron` completed successfully and emitted `dist-electron/main.js` and `dist-electron/preload.cjs`.

These counts describe the checked repository revision at the time of this record. They remain software-only evidence.

## What was not validated

- Proteus version and successful project load.
- The repaired ATmega2560 Program File property inside a saved Proteus project.
- Actual virtual COM endpoint names.
- COMPIM opening an endpoint without conflict.
- Live `MODE:` confirmations received by the Electron dashboard.
- Live `FIRING`, `FIRE_COMPLETE`, or `WAVEFORM:` messages.
- Live waveform sample count or waveform shape.
- Timing accuracy in Proteus.
- SCR gate polarity, commutation, or load-current duration.
- Any conversion from ADC units to amperes.
- Any meter-compliance or electrical pass/fail result.
- Any physical high-current hardware.

No screenshots are attached because there was no live Proteus session to document. Adding a fabricated or simulator-only screenshot to this record would misrepresent the validation state.

## Exact blocker

The live validation chain requires all of the following at the same time:

```text
Proteus + corrected MCU firmware path + virtual COM pair + one free endpoint for COMPIM
        + opposite free endpoint for the Electron dashboard
```

On the checked development host, Proteus was not discoverable, no virtual COM-pair driver was discoverable, and `Win32_SerialPort` returned no devices. Consequently the chain stopped before project launch and no live serial assertion could be made.

## Presentation-machine acceptance checklist

Record the actual values and evidence in a dated copy of this document. Do not check an item based on simulator behavior.

- [ ] Proteus version recorded: `____________________`
- [ ] Windows version/build recorded: `____________________`
- [ ] `EMP.pdsprj` opens without missing-library errors.
- [ ] ATmega2560 Program File is set through the UI to the bundled `STOC_Firmware.ino.hex`.
- [ ] MCU clock remains 16 MHz.
- [ ] Virtual COM driver/product and version recorded: `____________________`
- [ ] Proteus COMPIM endpoint recorded: `COM____`
- [ ] Dashboard endpoint recorded: `COM____`
- [ ] Endpoints are a paired null-modem connection and are not the same port.
- [ ] COMPIM and both endpoints use 9600 8N1 with no flow control.
- [ ] Electron dashboard **Refresh ports** lists the dashboard endpoint.
- [ ] Electron dashboard connects to the dashboard endpoint without another process owning it.
- [ ] Single Phase sends `1` and receives `MODE: Single Phase`.
- [ ] Three Phase Whole Current sends `2` and receives `MODE: Three Phase`.
- [ ] LTCT sends `3` and receives `MODE: LTCT`.
- [ ] A single controlled fire sends `F` only after arming.
- [ ] `FIRING` is observed in the dashboard event timeline.
- [ ] `FIRE_COMPLETE` is observed after `FIRING`.
- [ ] A `WAVEFORM:` payload is received and rendered.
- [ ] Observed raw waveform sample count recorded: `____________________`
- [ ] Screenshot of Proteus MCU/COMPIM properties captured: `____________________`
- [ ] Screenshot of the dashboard connected state and event timeline captured: `____________________`
- [ ] Screenshot of the completed raw-ADC waveform captured: `____________________`
- [ ] Dashboard is disconnected and Proteus is stopped after the one-fire check.
- [ ] Demonstration notes explicitly say communication success is not electrical validation.

## Acceptance decision

Proteus integration may be described as **live validated** only after every critical communication item above is checked with actual presentation-machine evidence. Until then, the truthful status is:

> Browser simulator demonstration verified; Electron/Proteus live connection pending presentation-machine environment setup and one controlled validation run.

The SCR polarity concern remains a separate stop-the-line item for electrical engineering review. Do not use additional fire attempts to investigate it.
