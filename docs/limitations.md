# Known limitations and safety boundaries

This document defines what the current STOC dashboard does **not** establish. These are release boundaries, not presentation footnotes.

## Measurement and compliance

- **Current is uncalibrated.** The firmware returns 10-bit ADC samples. No validated sensor transfer function, transformer ratio, offset correction, gain calibration, uncertainty budget, or traceable reference converts those samples into amperes.
- **Profile currents are design targets.** The displayed 1200 A, 3000 A, and 300 A values describe the intended test profiles. The simulator and current Proteus model do not prove those physical currents were generated.
- **No electrical pass/fail decision exists.** “Sequence complete” reports successful software sequencing and data capture. It is not a meter-compliance decision and does not implement the documented -3% criterion.
- **Exports are not certificates.** JSON, CSV, print summaries, and local history are not signed, tamper-evident, access-controlled, or tied to a calibration record.

## Power-stage engineering

- **SCR gate polarity is unresolved.** The documented optocoupler/SCR arrangement appears capable of inverting the firmware's intended gate logic. A qualified electrical engineer must confirm the actual circuit before real-hardware use.
- **SCR commutation limits pulse control.** An SCR normally remains conducting until current falls below its holding current, commonly at an AC zero crossing. Timing the gate output for 10 ms or 500 ms does not by itself prove the load-current pulse has that exact duration.
- **No high-current hardware validation has occurred.** Busbars, transformer saturation, thermal performance, clearances, fusing, isolation, contactors, arc-flash boundaries, and meter survivability are outside the verified software scope.

## Acquisition

- **The firmware captures at most 200 samples.** This gives a bounded payload but cannot represent the complete 500 ms LTCT event at a useful continuous sampling rate. The LTCT chart therefore shows only the returned capture, not proof of the entire electrical pulse.
- **Raw sample timing is not traceable.** The result records run timestamps and the profile duration, but it does not provide a calibrated per-sample timebase or uncertainty.
- **Malformed or incomplete serial payloads fail the run.** This is safer than presenting partial data, but the legacy protocol has no checksum, sequence number, device identity, or retry framing.

## Connection and environment

- **Live Proteus integration is not validated in the current development environment.** Proteus, a compatible virtual COM-pair driver, and serial ports were not discoverable on the checked host. Automated tests validate software behavior against controlled doubles; they do not replace a live COMPIM run.
- **The bundled Proteus MCU path is not portable.** The ATmega2560 Program File property must be set through the Proteus UI to the bundled `STOC_Firmware.ino.hex` before a live run.
- **The browser build is simulator-only.** Direct serial access is confined to the Electron bridge.
- **The Windows portable package is not available.** The latest packaging attempt timed out and produced no `.exe`. Partial `release/` artifacts are not a distributable application.

## Safety controls

- **Software disconnect is not an emergency stop.** It stops further dashboard communication and requests port closure. It cannot guarantee an energized SCR or power circuit turns off.
- **No physical interlocks are integrated.** The dashboard does not currently receive enclosure, contactor, grounding, overtemperature, overcurrent, zero-crossing, or emergency-stop readiness signals.
- **The hold-to-fire control reduces accidental activation but is not a safety-rated control.** It is a user-interface safeguard only.
- **Remote firing is unsupported.** The application has no authentication or authorization and must not be exposed as a network firing service.

## Storage and security

- Results are stored in local browser/Electron renderer storage, not a managed database.
- Anyone with access to the Windows profile or exported files may read or alter records.
- Operator metadata is not encrypted, digitally signed, or centrally backed up.
- The project requires no credentials or `.env` secrets. Do not place secrets in source code, run notes, exported data, or repository files.

## Required work before production use

At minimum, production use requires independent electrical review, corrected and verified power-stage behavior, calibrated current acquisition, a hardwired emergency stop, safety-rated interlocks/contactors, protocol integrity and device identity, role-based authorization, tamper-evident audit records, formal acceptance criteria, repeatability studies, and applicable regulatory/certification review.

The current dashboard is suitable for a controlled educational demonstration and continued engineering development only.
