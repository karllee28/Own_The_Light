# 8x32 matrix diagram

The time Nano drives one 8x32 WS2812B matrix (256 pixels). The score Nano drives two 16x16 WS2812B panels side by side (512 pixels, 16 rows by 32 columns). The only serial difference is which master pin feeds D6.

```
Master Nano                         Display Nano                         8x32 matrix
-----------                         ------------                         -----------

D2 (score) --+
             |
             +--------------------> D6  RX
D3 (time)  --+  (one wire only)

                                    D4 --[330 to 470 ohm]--> DIN
                                    GND ------------------> GND ----+
                                                                    |
5V supply ------------------------------------------------> 5V -----+
GND supply ------------------------------------------------> GND
```

Do not power the matrix from the Nano 5V pin. A 256-pixel panel can draw several amps at full white. The sketches set brightness to 40, which lowers that, but the panel still needs its own 5V supply. Tie the supply ground to the Nano ground.

## Wires on one display Nano

| From | To | Notes |
| --- | --- | --- |
| Master D2 | Score Nano D6 | Score number at 9600. Direct 5V wire. |
| Master D3 | Time Nano D6 | Time seconds at 9600. Direct 5V wire. |
| Display D4 | Matrix DIN | One 330–470 ohm resistor in series. |
| Display GND | Matrix GND and 5V supply GND | Required. Data will not work without it. |
| 5V supply + | Matrix 5V | Do not use the Nano 5V pin for the panel. |
| Display D7 | Leave open | SoftwareSerial TX, unused. |
| Display D0, D1 | Leave open | USB. |

The time matrix has one data wire. On the score Nano, chain the two 16x16 panels: D4 to the left DIN, left DOUT to the right DIN. Do not chain a score panel into the time panel. Feed 5V and GND to both score panels.

## Pixel order

The diagram below is the time Nano's 8x32 panel. `LAYOUT` is `LAYOUT_COLUMN` in [time_nano/time_nano.ino](time_nano/time_nano.ino). Data enters at DIN and runs down a column of 8, then back up the next column. Connect data to DIN, not DOUT.

Each score panel is 16x16. In [score_nano/score_nano.ino](score_nano/score_nano.ino), `LAYOUT_ROW` runs even rows left to right and odd rows right to left inside that square. The left panel is LEDs 0–255. The right panel is LEDs 256–511.

Viewed from the front, X is the column (0 at DIN, 31 at the far end) and Y is the row (0 at the DIN end of the first column, 7 at the other end):

```
        X0          X1          X2                 X31
Y0      0           15          16                 255
        |           ^           |                  ^
Y1      1           14          17                 254
Y2      2           13          18                 ...
Y3      3           12          19
Y4      4           11          20
Y5      5           10          21
Y6      6           9           22
Y7      7  ----->   8           23  ----->   ...   248
       DIN
```

LED index in the sketch when `LAYOUT` is `LAYOUT_COLUMN`:

- Even column: `index = x * 8 + y`
- Odd column: `index = x * 8 + (7 - y)`

If the digits are still scrambled, set `LAYOUT` to `LAYOUT_ROW` in that sketch and flash it again. That uses the old row zigzag: even rows `y * 32 + x`, odd rows `y * 32 + (31 - x)`. `FLIP_X` and `FLIP_Y` mirror the picture without changing the wiring.

## What each panel shows

Both panels are 32 columns by 8 rows. Digits are 5 pixels wide and 7 pixels tall, centered.

| Panel | Example command | What you see |
| --- | --- | --- |
| Score | `S15` | `15` in red |
| Time | `T90` | `01:30` in red, held until the next command |

The time layout is four digits plus a colon, 25 pixels wide, starting at column 3:

```
col:  3         9         15        21        27
      0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4
      [  1  ]   [  0  ] : [  3  ]   [  5  ]
```

The score is drawn across both 16x16 panels. `FONT_SIZE_PERCENT` at 100 uses the full 16-pixel height. A four-digit score is slightly narrower so it still fits in 32 columns.
