# Proteus connection setup

This procedure connects the STOC Proteus simulation to the Electron dashboard through a Windows virtual serial-port pair. It does not validate the high-current circuit or certify the displayed design targets.

## Before you begin

You need:

- Proteus 8 with the bundled project open from `projectsuccessfullyruned/EMP.pdsprj`.
- The bundled firmware file `projectsuccessfullyruned/STOC_Firmware.ino.hex`.
- The STOC dashboard running as the Electron desktop application. The browser build has no direct serial-port access.
- A Windows virtual serial-port driver that can create a null-modem pair. No compatible driver or COM ports were detected on the development machine used for the 2026-07-13 validation record, so install or enable one on the presentation machine first.

The examples below use **COM10** for Proteus and **COM11** for the dashboard. If either number already exists on the presentation machine, select another unused pair and substitute those numbers throughout.

## 1. Correct the ATmega2560 firmware path

The packaged Proteus project still references an original-development path:

```text
..\Downloads\STOC_Firmware\build\arduino.avr.mega\STOC_Firmware.ino.hex
```

That path is not portable. Correct it in the Proteus UI; do not edit the `.pdsprj` archive by hand.

1. Open `projectsuccessfullyruned/EMP.pdsprj` in Proteus.
2. Stop the simulation if it is running.
3. On the schematic, double-click the **ATMEGA2560** component (or right-click it and choose **Edit Properties**).
4. In **Program File**, choose the folder/browse button.
5. Select the bundled `projectsuccessfullyruned/STOC_Firmware.ino.hex` from this repository.
6. Confirm the clock frequency remains **16 MHz**, matching the firmware timer calculations.
7. Choose **OK**, then save the project under a presentation-specific copy if you need to preserve the original archive unchanged.

Do not select the `.eep` file. The `.hex` named above is the application image intended for the Proteus MCU program-file field.

## 2. Create the virtual COM pair

Use the installed virtual serial-port driver's own configuration UI:

1. Create one null-modem/paired connection with endpoints **COM10** and **COM11**.
2. Confirm both endpoints appear in Windows Device Manager under **Ports (COM & LPT)** or in the driver's port list.
3. Ensure no serial monitor, terminal, Arduino IDE, or other process has either endpoint open.
4. Keep the driver configuration available until the first connection test is complete.

The two endpoints must be different: Proteus owns one endpoint and the dashboard owns the other. Never select the same COM port in both programs.

## 3. Configure Proteus COMPIM

1. In the schematic, double-click the **COMPIM** component.
2. Set **Physical Port** (or **Port**) to **COM10**.
3. Set the transmit and receive baud rates to **9600**.
4. Set **Data Bits** to **8**.
5. Set **Parity** to **None**.
6. Set **Stop Bits** to **1**.
7. Disable RTS/CTS, DSR/DTR, XON/XOFF, or any other hardware/software flow control.
8. Choose **OK**.

The intended link is therefore `9600 baud, 8 data bits, no parity, 1 stop bit, no flow control` (9600 8N1).

## 4. Start Proteus and connect the dashboard

1. Start the Proteus simulation and allow the MCU to initialize.
2. Start the Electron dashboard, not the browser-only build.
3. Confirm the connection panel identifies **Proteus / Arduino serial**. The Electron build selects this transport automatically when its desktop bridge is available.
4. Choose **Refresh ports**.
5. Select **COM11** in the **Serial port** list.
6. Choose **Connect**.
7. Confirm the header/connection panel reports the serial transport as connected before selecting a profile.

If COM11 is not listed, close anything that may own it, confirm the pair in Device Manager, and choose **Refresh ports** again. Do not switch Proteus to COM11; it must remain on the opposite endpoint, COM10.

## 5. Verify commands and responses

Test mode selection before attempting a fire command:

| Dashboard profile | Byte sent | Required firmware response |
| --- | --- | --- |
| Single Phase | `1` | `MODE: Single Phase` |
| Three Phase Whole Current | `2` | `MODE: Three Phase` |
| LTCT | `3` | `MODE: LTCT` |

For each profile:

1. Select the profile in the dashboard.
2. Confirm its `MODE:` message appears in the dashboard event timeline.
3. If no confirmation arrives, disconnect and investigate the serial pair; do not proceed to firing.

After all three mode confirmations have been observed, perform **one** controlled fire sequence:

1. Select the profile agreed for the presentation.
2. Enter the optional meter/operator metadata.
3. Choose **Arm test** and review the confirmation.
4. Hold **Hold to fire — 1 second** continuously once, or press Enter/Space on that control and choose **Confirm fire**, to send `F`.
5. Verify the event order is `FIRING`, then `FIRE_COMPLETE`, then `WAVEFORM:<comma-separated ADC samples>`.
6. Confirm a completed result and raw-ADC waveform appear.
7. Disconnect the dashboard and stop Proteus before changing any serial or schematic setting.

The firmware emits up to 200 raw ADC samples. These samples are not calibrated amperes, and sequence completion is not an electrical pass/fail result.

## Safety boundary

There is an unresolved concern that the documented optocoupler/SCR gate arrangement may invert the firmware's intended firing polarity. During this software milestone:

- Do not modify the schematic wiring while establishing communication.
- Do not repeatedly fire to troubleshoot the electrical stage.
- Perform at most one fire after all mode confirmations succeed.
- Treat the dashboard disconnect/emergency action as a communication stop only; it is not a physical emergency stop.
- Do not connect or energize real high-current hardware from this procedure.

Live serial success demonstrates only that the dashboard, virtual COM pair, COMPIM, and firmware protocol communicate. Electrical behavior requires a separate engineering validation.
