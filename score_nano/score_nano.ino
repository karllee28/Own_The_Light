 // Score slave. Arduino Nano (ATmega328P).
// Listens on D6 at 9600 for a plain integer line from the master Nano
// and draws it across two 16x16 WS2812B panels side by side (16 rows x 32 columns).
//
// Wiring: master D2 -> this D6. Common GND. Both boards are 5V.
// D4 -> left panel DIN. Left panel DOUT -> right panel DIN.
// Mount the second panel to the right of the first, DIN on the same corner.
// Give both panels their own 5V and GND. Do not power them from the Nano.
// LAYOUT_ROW is a 16x16 zigzag: even rows left to right, odd rows right to left.
// Set LAYOUT to LAYOUT_COLUMN if the picture is still scrambled.
// D0 and D1 stay free for USB.

#include <Adafruit_NeoPixel.h>
#include <SoftwareSerial.h>

static const uint8_t DATA_PIN = 4;
static const uint8_t PANEL_SIZE = 16;
static const uint8_t PANEL_COUNT = 2;
static const uint8_t MATRIX_W = PANEL_SIZE * PANEL_COUNT;
static const uint8_t MATRIX_H = PANEL_SIZE;
static const uint16_t NUM_LEDS = PANEL_SIZE * PANEL_SIZE * PANEL_COUNT;
static const uint8_t LAYOUT_ROW = 0;
static const uint8_t LAYOUT_COLUMN = 1;
static const uint8_t LAYOUT = LAYOUT_ROW;
static const bool FLIP_X = false;
static const bool FLIP_Y = true;
static const uint8_t FONT_W = 8;
static const uint8_t FONT_H = 16;
// 100 fills the 16-pixel height of both 16x16 panels. 50 draws the score at half size.
static const uint8_t FONT_SIZE_PERCENT = 65;
static const int SCORE_MAX = 9999;

// 16 rows, bit 7 is the leftmost pixel. Two-pixel strokes, square corners.
static const uint8_t DIGITS[10][FONT_H] = {
  {0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF},
  {0x38, 0x38, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x18, 0x7E, 0x7E},
  {0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xC0, 0xFF, 0xFF},
  {0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0xFF, 0xFF},
  {0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03},
  {0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0, 0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0xFF, 0xFF},
  {0xFF, 0xFF, 0xC0, 0xC0, 0xC0, 0xC0, 0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF},
  {0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03},
  {0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF},
  {0xFF, 0xFF, 0xC3, 0xC3, 0xC3, 0xC3, 0xFF, 0xFF, 0x03, 0x03, 0x03, 0x03, 0x03, 0x03, 0xFF, 0xFF},
};

// RX D6 from the master. TX D7 is unused.
SoftwareSerial link(6, 7);
Adafruit_NeoPixel strip(NUM_LEDS, DATA_PIN, NEO_GRB + NEO_KHZ800);

char lineBuf[16];
uint8_t lineLen = 0;
bool lineOverflow = false;
int shownScore = -1;

uint16_t xyToIndex(uint8_t x, uint8_t y) {
  if (FLIP_X) {
    x = MATRIX_W - 1 - x;
  }
  if (FLIP_Y) {
    y = MATRIX_H - 1 - y;
  }
  uint8_t panel = x / PANEL_SIZE;
  uint8_t localX = x % PANEL_SIZE;
  uint16_t base = (uint16_t)panel * PANEL_SIZE * PANEL_SIZE;
  if (LAYOUT == LAYOUT_COLUMN) {
    if (localX & 1) {
      return base + (uint16_t)localX * PANEL_SIZE + (PANEL_SIZE - 1 - y);
    }
    return base + (uint16_t)localX * PANEL_SIZE + y;
  }
  if (y & 1) {
    return base + (uint16_t)y * PANEL_SIZE + (PANEL_SIZE - 1 - localX);
  }
  return base + (uint16_t)y * PANEL_SIZE + localX;
}

void setXY(uint8_t x, uint8_t y, uint32_t color) {
  if (x >= MATRIX_W || y >= MATRIX_H) {
    return;
  }
  strip.setPixelColor(xyToIndex(x, y), color);
}

void drawDigit(int x, int y, int digit, int pixelW, int pixelH, uint32_t color) {
  for (uint8_t row = 0; row < FONT_H; row++) {
    uint8_t bits = DIGITS[digit][row];
    int y0 = y + (row * pixelH) / FONT_H;
    int y1 = y + ((row + 1) * pixelH) / FONT_H;
    for (uint8_t col = 0; col < FONT_W; col++) {
      if ((bits & (1 << (FONT_W - 1 - col))) == 0) {
        continue;
      }
      int x0 = x + (col * pixelW) / FONT_W;
      int x1 = x + ((col + 1) * pixelW) / FONT_W;
      for (int py = y0; py < y1; py++) {
        for (int px = x0; px < x1; px++) {
          setXY((uint8_t)px, (uint8_t)py, color);
        }
      }
    }
  }
}

void drawScore(int score) {
  if (score < 0) {
    score = 0;
  }
  if (score > SCORE_MAX) {
    score = SCORE_MAX;
  }

  int digits[4];
  int count = 0;
  if (score == 0) {
    digits[0] = 0;
    count = 1;
  } else {
    int rev[4];
    int value = score;
    while (value > 0 && count < 4) {
      rev[count++] = value % 10;
      value /= 10;
    }
    for (int i = 0; i < count; i++) {
      digits[i] = rev[count - 1 - i];
    }
  }

  // 100% is 16 pixels tall, the full height of the 16x16 panels.
  // Fewer than four digits are 8 pixels wide. Four digits are 7 pixels wide.
  int percent = FONT_SIZE_PERCENT;
  if (percent < 1) {
    percent = 1;
  }
  if (percent > 100) {
    percent = 100;
  }
  int glyphH = MATRIX_H * percent / 100;
  int glyphW = ((count <= 3) ? 8 : 7) * percent / 100;
  if (glyphH < 1) {
    glyphH = 1;
  }
  if (glyphW < 1) {
    glyphW = 1;
  }
  int width = count * glyphW + (count - 1);
  if (width > MATRIX_W) {
    glyphW = (MATRIX_W - (count - 1)) / count;
    if (glyphW < 1) {
      glyphW = 1;
    }
    width = count * glyphW + (count - 1);
  }
  int x = (MATRIX_W - width) / 2;
  int y = (MATRIX_H - glyphH) / 2;
  const uint32_t color = strip.Color(255, 0, 0);

  strip.clear();
  for (int i = 0; i < count; i++) {
    drawDigit(x, y, digits[i], glyphW, glyphH, color);
    x += glyphW + 1;
  }
  strip.show();
  shownScore = score;
}

bool parseScore(const char *text, int &score) {
  if (text == nullptr || text[0] == '\0') {
    return false;
  }
  long value = 0;
  for (const char *p = text; *p != '\0'; p++) {
    if (*p < '0' || *p > '9') {
      return false;
    }
    value = value * 10 + (*p - '0');
    if (value > SCORE_MAX) {
      return false;
    }
  }
  score = (int)value;
  return true;
}

void handleLine(const char *text) {
  int score = 0;
  if (!parseScore(text, score)) {
    return;
  }
  if (score != shownScore) {
    drawScore(score);
  }
}

void setup() {
  link.begin(9600);
  strip.begin();
  strip.setBrightness(40);
  drawScore(0);
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
