// Arduino Nano (ATmega328P) master.
// USB Serial (115200) receives commands from the Node.js test.
// D2 TX sends the score number to the score Nano D6 at 9600 (SoftwareSerial).
// D3 TX sends the time in seconds to the time Nano D6 at 9600 (SoftwareSerial).
// Pins D4-D12 and A0 each drive a chain of SK6812 RGB (index 1-10). No buttons.
// A1 and A2 are unused SoftwareSerial RX pins. Leave them unconnected.
//
// S15     score
// T90     time
// B1      pin 1 blue
// O3      pin 3 orange
// F1      pin 1 off
// A       all pins off
//
// Replies OK or ERR. Prints READY after boot.

#include <Adafruit_NeoPixel.h>
#include <SoftwareSerial.h>

static const uint8_t LED_COUNT = 10;
static const uint8_t PIXELS_PER_PIN = 16;
// SK6812 RGB strip: green, red, blue, no white channel.
// If blue and orange are still swapped, use NEO_RGB + NEO_KHZ800.
static const uint16_t SK6812_TYPE = NEO_GRB + NEO_KHZ800;
static const int SCORE_MAX = 9999;
static const long TIME_MAX = 99999;

// RX pins A1 and A2 are unused. TX only: D2 score, D3 time.
SoftwareSerial scoreLink(A1, 2);
SoftwareSerial timeLink(A2, 3);

// Created in setup(). An array initializer copies each object and then
// frees its pixel buffer, so show() would send nothing.
static const uint8_t LED_PINS[LED_COUNT] = {4, 5, 6, 7, 8, 9, 10, 11, 12, A0};
Adafruit_NeoPixel *leds[LED_COUNT];

char lineBuf[32];
uint8_t lineLen = 0;
bool lineOverflow = false;

void setPixel(uint8_t index, uint8_t r, uint8_t g, uint8_t b) {
  uint32_t color = leds[index]->Color(r, g, b);
  for (uint8_t pixel = 0; pixel < PIXELS_PER_PIN; pixel++) {
    leds[index]->setPixelColor(pixel, color);
  }
  leds[index]->show();
}

void setAllOff() {
  for (uint8_t i = 0; i < LED_COUNT; i++) {
    setPixel(i, 0, 0, 0);
  }
}

void toUpperInPlace(char *text) {
  for (char *p = text; *p != '\0'; p++) {
    if (*p >= 'a' && *p <= 'z') {
      *p = (char)(*p - 'a' + 'A');
    }
  }
}

const char *restAfter(const char *text, const char *word) {
  size_t n = strlen(word);
  if (strncmp(text, word, n) != 0) {
    return nullptr;
  }
  if (text[n] != ' ') {
    return nullptr;
  }
  const char *p = text + n;
  while (*p == ' ') {
    p++;
  }
  if (*p == '\0') {
    return nullptr;
  }
  return p;
}

bool parseUint(const char *text, long maxValue, long &out) {
  if (text == nullptr || text[0] == '\0') {
    return false;
  }
  long value = 0;
  for (const char *p = text; *p != '\0'; p++) {
    if (*p < '0' || *p > '9') {
      return false;
    }
    value = value * 10 + (*p - '0');
    if (value > maxValue) {
      return false;
    }
  }
  out = value;
  return true;
}

bool parseLedIndex(const char *text, uint8_t &index) {
  long value = 0;
  if (!parseUint(text, LED_COUNT, value) || value < 1) {
    return false;
  }
  index = (uint8_t)(value - 1);
  return true;
}

bool isShortCommand(const char *text) {
  if (text[0] == 'A' && text[1] == '\0') {
    return true;
  }
  char cmd = text[0];
  if (cmd != 'B' && cmd != 'O' && cmd != 'F' && cmd != 'S' && cmd != 'T') {
    return false;
  }
  const char *arg = text + 1;
  if (*arg == ' ') {
    arg++;
  }
  return *arg >= '0' && *arg <= '9';
}

void handleLine(char *text) {
  toUpperInPlace(text);

  if (isShortCommand(text)) {
    char cmd = text[0];
    const char *arg = text + 1;
    while (*arg == ' ') {
      arg++;
    }

    if (cmd == 'A') {
      setAllOff();
      Serial.println("OK");
      return;
    }

    if (cmd == 'S' || cmd == 'T') {
      long value = 0;
      long maxValue = (cmd == 'S') ? SCORE_MAX : TIME_MAX;
      if (!parseUint(arg, maxValue, value)) {
        Serial.println("ERR");
        return;
      }
      if (cmd == 'S') {
        scoreLink.println(value);
      } else {
        timeLink.println(value);
      }
      Serial.println("OK");
      return;
    }

    uint8_t index = 0;
    if (!parseLedIndex(arg, index)) {
      Serial.println("ERR");
      return;
    }
    if (cmd == 'B') {
      setPixel(index, 0, 0, 255);
    } else if (cmd == 'O') {
      setPixel(index, 255, 80, 0);
    } else {
      setPixel(index, 0, 0, 0);
    }
    Serial.println("OK");
    return;
  }

  if (strcmp(text, "OFF ALL") == 0) {
    setAllOff();
    Serial.println("OK");
    return;
  }

  const char *arg = restAfter(text, "SCORE");
  if (arg != nullptr) {
    long score = 0;
    if (!parseUint(arg, SCORE_MAX, score)) {
      Serial.println("ERR");
      return;
    }
    scoreLink.println(score);
    Serial.println("OK");
    return;
  }

  arg = restAfter(text, "TIME");
  if (arg != nullptr) {
    long seconds = 0;
    if (!parseUint(arg, TIME_MAX, seconds)) {
      Serial.println("ERR");
      return;
    }
    timeLink.println(seconds);
    Serial.println("OK");
    return;
  }

  arg = restAfter(text, "BLUE");
  if (arg != nullptr) {
    uint8_t index = 0;
    if (!parseLedIndex(arg, index)) {
      Serial.println("ERR");
      return;
    }
    setPixel(index, 0, 0, 255);
    Serial.println("OK");
    return;
  }

  arg = restAfter(text, "ORANGE");
  if (arg != nullptr) {
    uint8_t index = 0;
    if (!parseLedIndex(arg, index)) {
      Serial.println("ERR");
      return;
    }
    setPixel(index, 255, 80, 0);
    Serial.println("OK");
    return;
  }

  arg = restAfter(text, "OFF");
  if (arg != nullptr) {
    uint8_t index = 0;
    if (!parseLedIndex(arg, index)) {
      Serial.println("ERR");
      return;
    }
    setPixel(index, 0, 0, 0);
    Serial.println("OK");
    return;
  }

  Serial.println("ERR");
}

void setup() {
  Serial.begin(115200);
  scoreLink.begin(9600);
  timeLink.begin(9600);

  for (uint8_t i = 0; i < LED_COUNT; i++) {
    leds[i] = new Adafruit_NeoPixel(PIXELS_PER_PIN, LED_PINS[i], SK6812_TYPE);
    leds[i]->begin();
    leds[i]->setBrightness(80);
  }
  setAllOff();
  Serial.println("READY");
}

void loop() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n' || c == '\r') {
      if (lineOverflow) {
        Serial.println("ERR");
      } else if (lineLen > 0) {
        lineBuf[lineLen] = '\0';
        handleLine(lineBuf);
      }
      lineLen = 0;
      lineOverflow = false;
    } else if (lineLen < sizeof(lineBuf) - 1) {
      lineBuf[lineLen++] = c;
    } else {
      lineOverflow = true;
    }
  }
}
