/*
  ============================================================
  STOC (Short Time Over Current) Test System - Firmware
  Target: ATMEGA2560 (Arduino Mega 2560)
  Project: PEL Internship - Transformer Design Dept.
  ============================================================
  Functions covered:
   1. Debounced button reading (Phase select + Fire)
   2. LED indicator logic (Red/Yellow/Green)
   3. Serial command parsing (GUI control)
   4. Timer1-based precise pulse generation (10ms / 500ms)
      -> Direct AVR register access for hardware-level accuracy
   5. ADC waveform capture + serial transmission
   6. LCD status updates
  ============================================================
*/

#include <LiquidCrystal.h>

// ---------------- Pin Definitions ----------------
#define BTN_SINGLE   22   // PA0 - Single Phase select
#define BTN_THREE    23   // PA1 - Three Phase select
#define BTN_LTCT     24   // PA2 - LTCT select
#define BTN_FIRE     25   // PA3 - Fire trigger

#define LED_RED      41   // PG0 - Single Phase indicator
#define LED_YELLOW   40   // PG1 - Three Phase indicator
#define LED_GREEN    39   // PG2 - LTCT indicator

#define SCR_GATE_PIN 53   // PB0 -> Optocoupler -> SCR Gate

#define ADC_CHANNEL  A8   // PC0 / A8 - waveform feedback input

// LCD pins: RS, E, D4, D5, D6, D7  (PF0, PF1, PF4-PF7)
LiquidCrystal lcd(A0, A1, A4, A5, A6, A7);

// ---------------- Phase Selection ----------------
enum PhaseType { NONE, SINGLE_PHASE, THREE_PHASE, LTCT };
volatile PhaseType selectedPhase = NONE;

// ---------------- Timer1 CTC values (Prescaler = 256) ----------------
// Formula: OCR1A = (F_CPU / Prescaler) * time_seconds - 1
#define OCR_10MS   624     // 10 ms pulse  (Single Phase / Three Phase)
#define OCR_500MS  31249   // 500 ms pulse (LTCT)

volatile bool pulseComplete = false;

// ---------------- ADC Waveform Buffer ----------------
#define BUFFER_SIZE 200
uint16_t waveformBuffer[BUFFER_SIZE];
volatile uint16_t sampleIndex = 0;

// ---------------- Debounce Handling ----------------
#define DEBOUNCE_MS 40
unsigned long lastDebounceTime[4] = {0, 0, 0, 0};
bool lastRawReading[4]     = {HIGH, HIGH, HIGH, HIGH}; // last raw (unfiltered) pin reading
bool currentStableState[4] = {HIGH, HIGH, HIGH, HIGH}; // confirmed/debounced state

// ============================================================
//  SETUP
// ============================================================
void setup() {
  Serial.begin(9600);

  pinMode(BTN_SINGLE, INPUT_PULLUP);
  pinMode(BTN_THREE, INPUT_PULLUP);
  pinMode(BTN_LTCT, INPUT_PULLUP);
  pinMode(BTN_FIRE, INPUT_PULLUP);

  pinMode(LED_RED, OUTPUT);
  pinMode(LED_YELLOW, OUTPUT);
  pinMode(LED_GREEN, OUTPUT);
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_YELLOW, LOW);
  digitalWrite(LED_GREEN, LOW);

  pinMode(SCR_GATE_PIN, OUTPUT);
  digitalWrite(SCR_GATE_PIN, LOW);

  lcd.begin(16, 2);
  lcd.setCursor(0, 0);
  lcd.print("STOC Test System");
  lcd.setCursor(0, 1);
  lcd.print("Status: Ready");

  setupTimer1();
}

// ============================================================
//  TIMER1 SETUP (CTC Mode, Prescaler 256, interrupt-driven)
// ============================================================
void setupTimer1() {
  TCCR1A = 0;
  TCCR1B = 0;
  TCNT1  = 0;
  TCCR1B |= (1 << WGM12);     // CTC mode
  TIMSK1 |= (1 << OCIE1A);    // Enable Compare Match A interrupt
  // Timer clock source (prescaler) enabled only when firing starts
}

// ------------------------------------------------------------
// ISR: fires exactly when the pulse duration (OCR1A) elapses
// ------------------------------------------------------------
ISR(TIMER1_COMPA_vect) {
  digitalWrite(SCR_GATE_PIN, LOW);                     // End pulse
  TCCR1B &= ~((1 << CS12) | (1 << CS11) | (1 << CS10)); // Stop timer
  TCNT1 = 0;
  pulseComplete = true;
}

// ============================================================
//  BUTTON DEBOUNCE
// ============================================================
bool readButtonDebounced(int pin, int index) {
  bool reading = digitalRead(pin);
  bool pressedEvent = false;

  // Reset debounce timer whenever the raw reading changes
  if (reading != lastRawReading[index]) {
    lastDebounceTime[index] = millis();
  }

  // Only accept the new reading as "stable" after it holds for DEBOUNCE_MS
  if ((millis() - lastDebounceTime[index]) > DEBOUNCE_MS) {
    if (reading != currentStableState[index]) {
      currentStableState[index] = reading;
      if (currentStableState[index] == LOW) {
        pressedEvent = true;  // valid new press detected
      }
    }
  }

  lastRawReading[index] = reading;
  return pressedEvent;
}

// ============================================================
//  LED + LCD HELPERS
// ============================================================
void updateLEDs() {
  digitalWrite(LED_RED,    selectedPhase == SINGLE_PHASE ? HIGH : LOW);
  digitalWrite(LED_YELLOW, selectedPhase == THREE_PHASE  ? HIGH : LOW);
  digitalWrite(LED_GREEN,  selectedPhase == LTCT          ? HIGH : LOW);
}

void updateLCDStatus(const char* line2) {
  lcd.setCursor(0, 1);
  lcd.print("                "); // clear line (16 spaces)
  lcd.setCursor(0, 1);
  lcd.print(line2);
}

// ============================================================
//  FIRE SEQUENCE (precise pulse + waveform capture)
// ============================================================
void fireSCR() {
  if (selectedPhase == NONE) {
    Serial.println("ERROR: No phase selected");
    return;
  }

  uint16_t ocrValue = (selectedPhase == LTCT) ? OCR_500MS : OCR_10MS;

  updateLCDStatus("Firing...");
  Serial.println("FIRING");

  sampleIndex = 0;
  pulseComplete = false;

  noInterrupts();
  OCR1A = ocrValue;
  TCNT1 = 0;
  interrupts();

  digitalWrite(SCR_GATE_PIN, HIGH);   // Start pulse
  TCCR1B |= (1 << CS12);              // Start Timer1 (prescaler 256)

  // Capture waveform samples as fast as possible until pulse ends
  while (!pulseComplete) {
    if (sampleIndex < BUFFER_SIZE) {
      waveformBuffer[sampleIndex] = analogRead(ADC_CHANNEL);
      sampleIndex++;
    }
  }

  updateLCDStatus("Done");
  Serial.println("FIRE_COMPLETE");

  // Transmit captured waveform to GUI
  Serial.print("WAVEFORM:");
  for (uint16_t i = 0; i < sampleIndex; i++) {
    Serial.print(waveformBuffer[i]);
    if (i < sampleIndex - 1) Serial.print(",");
  }
  Serial.println();

  delay(500);
  updateLCDStatus("Ready");
}

// ============================================================
//  SERIAL COMMAND HANDLER (GUI -> MCU)
//  '1' = Single Phase   '2' = Three Phase   '3' = LTCT   'F'/'f' = Fire
// ============================================================
void handleSerialCommands() {
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    switch (cmd) {
      case '1':
        selectedPhase = SINGLE_PHASE;
        updateLEDs();
        updateLCDStatus("Single Phase");
        Serial.println("MODE: Single Phase");
        break;
      case '2':
        selectedPhase = THREE_PHASE;
        updateLEDs();
        updateLCDStatus("Three Phase");
        Serial.println("MODE: Three Phase");
        break;
      case '3':
        selectedPhase = LTCT;
        updateLEDs();
        updateLCDStatus("LTCT");
        Serial.println("MODE: LTCT");
        break;
      case 'F':
      case 'f':
        fireSCR();
        break;
      default:
        break; // ignore unrecognized bytes
    }
  }
}

// ============================================================
//  MAIN LOOP
// ============================================================
void loop() {
  handleSerialCommands();

  if (readButtonDebounced(BTN_SINGLE, 0)) {
    selectedPhase = SINGLE_PHASE;
    updateLEDs();
    updateLCDStatus("Single Phase");
  }
  if (readButtonDebounced(BTN_THREE, 1)) {
    selectedPhase = THREE_PHASE;
    updateLEDs();
    updateLCDStatus("Three Phase");
  }
  if (readButtonDebounced(BTN_LTCT, 2)) {
    selectedPhase = LTCT;
    updateLEDs();
    updateLCDStatus("LTCT");
  }
  if (readButtonDebounced(BTN_FIRE, 3)) {
    fireSCR();
  }
}
