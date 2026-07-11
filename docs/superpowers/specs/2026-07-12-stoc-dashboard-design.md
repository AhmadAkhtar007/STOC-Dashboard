# STOC Energy Meter Test Dashboard Design

## Decision Summary

Build a professional demonstration dashboard for the existing Short Time Over Current (STOC) Proteus and ATmega2560 prototype. Version 1 is due on 2026-07-13 and must prioritize a reliable demonstration while retaining an architectural path toward a production test bench.

The product will use one React interface for a browser build and a Windows desktop application. The desktop application will use Electron for dependable serial-port access. A device-adapter boundary will allow the same dashboard to operate against a deterministic simulator, Proteus, or a physical Arduino Mega.

Version 1 is an educational and internship demonstration. It must not present simulated or uncalibrated measurements as certified test results.

## Goals

- Deliver a polished browser dashboard that can demonstrate the complete test workflow without external hardware.
- Deliver a Windows desktop shell capable of serial communication with Proteus and, later, an Arduino Mega.
- Support the existing firmware protocol without requiring a firmware change for Version 1.
- Make connection state, operating mode, test state, waveform data, and errors understandable to a non-specialist operator.
- Preserve clean boundaries so production safety, calibration, traceability, and reporting can be introduced later.

## Non-Goals for Version 1

- Certified current measurement or meter-compliance decisions
- Remote firing over a network
- Cloud hosting, user accounts, or a server database
- Firmware flashing from the dashboard
- Hardware emergency-stop claims
- PDF report generation
- Multi-device fleet management
- Production certification or regulatory compliance

## Users and Operating Context

The initial user is a student or internship presenter operating a Windows computer with Proteus installed. The presentation must continue successfully if live serial integration is unavailable, using a clearly labelled simulator mode.

Future users may be trained laboratory operators. Production use would require calibrated hardware, formal operating procedures, access control, physical interlocks, traceable records, and verification against the applicable standards.

## Architecture

The system has four primary boundaries:

1. **React dashboard** - renders the operator interface and delegates all test decisions to the controller.
2. **Test controller** - owns the legal state transitions and prevents unsafe or contradictory UI actions.
3. **Device adapter contract** - defines connection, mode selection, firing, event delivery, and disconnection without exposing transport details to the UI.
4. **Device implementations** - simulator, serial connection to Proteus, and later serial connection to physical Arduino hardware.

The delivery shells are:

- A browser build for presentation and simulated operation.
- An Electron Windows build for serial-port access.

No cloud backend is required. Version 1 test history is stored locally.

## Test State Model

The controller uses these states:

`disconnected -> connecting -> connected -> configured -> armed -> firing -> capturing -> complete`

Any active state may transition to `error` when a timeout, malformed response, disconnection, or device failure occurs. From `error`, the operator may reset to a reconnectable state. A disconnect always returns the controller to `disconnected`.

Rules:

- A test cannot be armed without a connection and selected profile.
- A test cannot fire without first being armed.
- A second fire command cannot be issued while a run is active.
- Profile and connection controls are locked during firing and capture.
- Completion requires a fire-complete event and a valid waveform message.
- A timeout or malformed waveform marks the run as failed and preserves diagnostics.

## Device Adapter Contract

Every device implementation provides equivalent behavior:

- List or describe available connection targets.
- Connect and report connection state.
- Disconnect and release resources.
- Select one of the three meter profiles.
- Fire the selected test.
- Emit normalized status, waveform, completion, diagnostic, and error events.

The simulator must follow the same event ordering as the real protocol and produce deterministic, profile-specific waveform data. The UI must always display the active adapter so simulated data cannot be mistaken for hardware data.

## Existing Serial Protocol

Version 1 supports 9600 baud, eight data bits, no parity, and one stop bit.

| Action | Outbound command | Expected inbound message |
| --- | --- | --- |
| Select Single Phase | `1` | `MODE: Single Phase` |
| Select Three Phase | `2` | `MODE: Three Phase` |
| Select LTCT | `3` | `MODE: LTCT` |
| Fire | `F` | `FIRING` |
| Fire complete | None | `FIRE_COMPLETE` |
| Waveform | None | `WAVEFORM:<comma-separated ADC values>` |

The serial parser must accept partial chunks, CRLF or LF terminators, unrelated diagnostic lines, and multiple messages arriving in one chunk. ADC values must be integers in the range 0 through 1023. Invalid waveform content must generate a visible error without crashing the application.

## Operator Interface

### Header

- Product name: STOC Energy Meter Test System
- Active adapter: Simulator, Proteus, or Hardware
- Connected or disconnected indicator
- COM port and baud rate where applicable
- Persistent disconnect control

### Test Setup

The three test profiles are:

| Profile | Documented target | Duration |
| --- | ---: | ---: |
| Single Phase | 1200 A | 10 ms |
| Three Phase Whole Current | 3000 A | 10 ms |
| LTCT | 300 A | 500 ms |

In simulator and Proteus modes, target currents must be labelled as design targets, not measured current.

Optional run metadata includes meter serial number, operator name, and notes.

### Arming and Firing

The workflow is:

1. Connect.
2. Select a profile.
3. Press **Arm Test**.
4. Review the selected target and warning.
5. Press and hold **Fire Test** for approximately one second.
6. Lock configuration controls until the test completes or fails.

The software disconnect action only stops commands and closes communication. It must not be described as a physical emergency stop. Production hardware requires a hardwired emergency-stop circuit, contactor, and independent interlocks.

### Live Test View

Display:

- Current controller state
- Progress or elapsed-time indication
- Waveform chart
- Sample count
- Peak raw ADC reading
- Intended and observed sequence duration
- Timestamped status and diagnostic events

Raw ADC values must remain labelled as raw until calibration data and a validated conversion method are available.

### Results and History

Each completed or failed run records:

- Unique local identifier
- Timestamp
- Adapter type
- Profile
- Entered meter and operator metadata
- Intended duration
- Sequence outcome
- Sample count and raw peak
- Waveform samples
- Diagnostics or failure reason

Version 1 supports local history, JSON export, CSV waveform export, and a print-friendly browser view. Any displayed Pass or Fail refers only to successful completion of the command and capture sequence, not meter compliance.

## Error Handling

- Disable arming and firing while disconnected.
- Time out mode selection, firing acknowledgement, completion, and waveform receipt independently.
- Reject repeated fire commands during an active run.
- Preserve all recognized and unrecognized serial messages in the diagnostic timeline.
- Convert transport failures and parsing failures into normalized controller errors.
- Allow the operator to disconnect and reconnect without refreshing the application.
- Never silently switch from a live adapter to simulation during an active test.
- Clearly identify simulator use throughout the run and exported result.

## Testing Strategy

Automated tests must cover:

- Every legal and illegal controller state transition
- Command mapping for all three profiles
- Serial parsing across fragmented and combined input chunks
- Invalid, empty, and out-of-range waveform values
- Timeout and disconnect behavior
- Prevention of repeated firing
- Simulator event ordering and deterministic waveform generation
- Result summary calculations and local serialization

Interface tests must cover the critical operator path: connect, select, arm, hold-to-fire, capture, view result, and export. Manual acceptance must be performed in the browser simulator and Electron shell. Proteus integration is a separate acceptance gate and must have its exact configuration and outcome documented.

## Version 1 Acceptance Criteria

1. The browser dashboard runs without installation.
2. Simulator mode completes all three profiles.
3. Selection, arming, hold-to-fire, progress, waveform charting, local history, and export work.
4. The Electron Windows build starts successfully.
5. Proteus serial integration is attempted and its setup and result are documented.
6. Failure of live Proteus integration does not prevent the simulator presentation.
7. Simulated and raw measurements are never labelled as certified current.
8. A README covers setup, operation, architecture, troubleshooting, and limitations.
9. Automated tests cover the controller, protocol parser, simulator, and result calculations.
10. A five-minute presentation script is included and rehearsed.

## Delivery Priorities for 2026-07-13

1. Shared application foundation and test state model
2. Deterministic simulator and complete operator workflow
3. Professional dashboard layout and waveform visualization
4. Local history and JSON/CSV export
5. Automated tests and browser production build
6. Electron desktop shell
7. Proteus serial integration and documentation
8. README and five-minute demonstration script

If schedule pressure occurs, lower items may be reported as explicit blockers, but the simulator demonstration, honest labelling, and test-controller safeguards may not be removed.

## Production Evolution

The production path is intentionally separate from the demonstration milestone:

1. Correct and validate the SCR gate-drive polarity and actual current-pulse behavior.
2. Replace the text protocol with versioned structured messages, request identifiers, checksums, device identity, and readiness/interlock reporting.
3. Extend waveform capture to cover the full LTCT interval at a defined sample rate.
4. Establish traceable current calibration and verified engineering units.
5. Add independent hardware interlocks, contactor control, emergency stop, and fail-safe outputs.
6. Add authenticated roles, immutable audit history, calibration records, formal test profiles, and signed reports.
7. Validate the complete system against the applicable electrical safety and meter-testing standards before production claims.

