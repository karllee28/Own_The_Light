// Time slave. Arduino Nano (ATmega328P).
// Listens on D6 at 9600 for seconds as a plain integer line and holds
// that time on an 8x32 WS2812B matrix. 90 stays at 01:30 until the
// next command. Values above 99:59 clamp.
//
// Wiring: master D3 -> this D6. Common GND. Both boards are 5V.
// Matrix DIN on D4. LAYOUT_COLUMN matches the Makerlab 8x32 panel.
// Set LAYOUT to LAYOUT_ROW if the picture is still scrambled.
// D0 and D1 stay free for USB.

#include <Adafruit_NeoPixel.h>
#include <SoftwareSerial.h>

static const uint8_t DATA_PIN = 4;
static const uint8_t MATRIX_W = 32;
static const uint8_t MATRIX_H = 8;
static const uint16_t NUM_LEDS = MATRIX_W * MATRIX_H;
static const uint8_t LAYOUT_ROW = 0;
static const uint8_t LAYOUT_COLUMN = 1;
static const uint8_t LAYOUT = LAYOUT_COLUMN;
static const bool FLIP_X = false;
static const bool FLIP_Y = false;
static const uint8_t DIGIT_W = 5;
static const uint8_t DIGIT_H = 7;
static const int TIME_MAX = 99 * 60 + 59;

static const uint8_t DIGITS[10][DIGIT_H] = {
  {0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E},
  {0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E},
  {0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F},
  {0x0E, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0E},
  {0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02},
  {0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E},
  {0x0E, 0x10, 0x1E, 0x11, 0x11, 0x11, 0x0E},
  {0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08},
  {0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E},
  {0x0E, 0x11, 0x11, 0x0F, 0x01, 0x01, 0x0E},
};

// RX D6 from the master. TX D7 is unused.
SoftwareSerial link(6, 7);
Adafruit_NeoPixel strip(NUM_LEDS, DATA_PIN, NEO_GRB + NEO_KHZ800);

char lineBuf[16];
uint8_t lineLen = 0;
bool lineOverflow = false;
int shownSeconds = -1;

uint16_t xyToIndex(uint8_t x, uint8_t y) {
  if (FLIP_X) {
    x = MATRIX_W - 1 - x;
  }
  if (FLIP_Y) {
    y = MATRIX_H - 1 - y;
  }
  if (LAYOUT == LAYOUT_ROW) {
    if (y & 1) {
      return (uint16_t)y * MATRIX_W + (MATRIX_W - 1 - x);
    }
    return (uint16_t)y * MATRIX_W + x;
  }
  if (x & 1) {
    return (uint16_t)x * MATRIX_H + (MATRIX_H - 1 - y);
  }
  return (uint16_t)x * MATRIX_H + y;
}

void setXY(uint8_t x, uint8_t y, uint32_t color) {
  if (x >= MATRIX_W || y >= MATRIX_H) {
    return;
  }
  strip.setPixelColor(xyToIndex(x, y), color);
}

void drawDigit(int x, int y, int digit, uint32_t color) {
  for (uint8_t row = 0; row < DIGIT_H; row++) {
    uint8_t bits = DIGITS[digit][row];
    for (uint8_t col = 0; col < DIGIT_W; col++) {
      if (bits & (1 << (4 - col))) {
        setXY((uint8_t)(x + col), (uint8_t)(y + row), color);
      }
    }
  }
}

void drawColon(int x, int y, uint32_t color) {
  setXY((uint8_t)x, (uint8_t)(y + 2), color);
  setXY((uint8_t)x, (uint8_t)(y + 4), color);
}

void drawTime(int seconds) {
  if (seconds < 0) {
    seconds = 0;
  }
  if (seconds > TIME_MAX) {
    seconds = TIME_MAX;
  }

  int mm = seconds / 60;
  int ss = seconds % 60;
  const int glyphs[5] = {mm / 10, mm % 10, -1, ss / 10, ss % 10};
  // 4 digits (5px) + colon (1px) + 4 one-pixel gaps = 25.
  int x = (MATRIX_W - 25) / 2;
  const int y = (MATRIX_H - DIGIT_H) / 2;
  const uint32_t color = strip.Color(255, 0, 0);

  strip.clear();
  for (int i = 0; i < 5; i++) {
    if (glyphs[i] < 0) {
      drawColon(x, y, color);
      x += 1 + 1;
    } else {
      drawDigit(x, y, glyphs[i], color);
      x += DIGIT_W + 1;
    }
  }
  strip.show();
  shownSeconds = seconds;
}

bool parseSeconds(const char *text, int &seconds) {
  if (text == nullptr || text[0] == '\0') {
    return false;
  }
  long value = 0;
  for (const char *p = text; *p != '\0'; p++) {
    if (*p < '0' || *p > '9') {
      return false;
    }
    value = value * 10 + (*p - '0');
    if (value > 99999) {
      return false;
    }
  }
  seconds = (int)value;
  return true;
}

void handleLine(const char *text) {
  int seconds = 0;
  if (!parseSeconds(text, seconds)) {
    return;
  }
  if (seconds > TIME_MAX) {
    seconds = TIME_MAX;
  }
  if (seconds != shownSeconds) {
    drawTime(seconds);
  }
}

void setup() {
  link.begin(9600);
  strip.begin();
  strip.setBrightness(40);
  drawTime(0);
}

void loop() {
  while (link.available() > 0) {
    char c = (char)link.read();
    if (c == '\n' || c == '\r') {
      if (!lineOverflow && lineLen > 0) {
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
