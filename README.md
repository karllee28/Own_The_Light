# Own The Light

Three Arduino Nano boards. The master reads commands from a Node.js script over USB, then forwards the score to one Nano and the time to the other. Those two only listen. The time Nano drives one 8x32 WS2812B matrix. The score Nano drives two 16x16 WS2812B panels side by side. The master also drives 10 SK6812 RGB chains, 16 pixels each (blue, orange, or off). There are no buttons.

A classic Nano has only one hardware serial port, and that port is the USB connection. The links between Nanos use SoftwareSerial on other pins, so USB can stay plugged in.

```
Node.js  --USB-->  Master Nano  --D2-->  Score Nano D6  -->  two 16x16 panels
                         |
                         +--D3-->  Time Nano D6   -->  8x32 matrix
                         |
                         +-->  10 SK6812 chains (D4-D12 and A0)
```

USB baud rate is **115200**. Each link between Nanos is **9600**. All three boards are 5V, so those two wires do not need a level shifter.

## Boards and sketches

Open each folder as its own Arduino IDE sketch. Install the **Adafruit NeoPixel** library. In the IDE, pick **Arduino Nano** for every board.

| Board | Sketch | Role |
| --- | --- | --- |
| Master Nano | [master/master.ino](master/master.ino) | Reads USB commands, forwards score and time, drives 10 pixels |
| Score Nano | [score_nano/score_nano.ino](score_nano/score_nano.ino) | Draws the score (0–9999) in red on two 16x16 panels |
| Time Nano | [time_nano/time_nano.ino](time_nano/time_nano.ino) | Holds seconds as `MM:SS` (90 → `01:30`), red |

On boot the matrices show `0` and `00:00`, the 10 pixels are off, and the master prints `READY` on USB.

## Pin guide

### Master Nano

Leave D0 and D1 free. Those pins are the USB serial port.

| Nano pin | Connects to |
| --- | --- |
| USB | PC running the Node.js test |
| D2 | Score Nano D6 |
| D3 | Time Nano D6 |
| GND | GND on both display Nanos and the LED power supply |
| D4 | SK6812 chain 1 data (16 pixels) |
| D5 | SK6812 chain 2 data (16 pixels) |
| D6 | SK6812 chain 3 data (16 pixels) |
| D7 | SK6812 chain 4 data (16 pixels) |
| D8 | SK6812 chain 5 data (16 pixels) |
| D9 | SK6812 chain 6 data (16 pixels) |
| D10 | SK6812 chain 7 data (16 pixels) |
| D11 | SK6812 chain 8 data (16 pixels) |
| D12 | SK6812 chain 9 data (16 pixels) |
| A0 | SK6812 chain 10 data (16 pixels) |
| A1, A2 | Unused. Leave them open. |

Do not tie the two display D6 pins together. Each display has its own wire from the master.

### Score Nano and time Nano

Both display boards use the same Nano pins. Only the incoming wire is different: score D6 comes from master D2, time D6 comes from master D3.

The score uses two 16x16 panels side by side. D4 goes to the left panel DIN. The left panel DOUT goes to the right panel DIN. Mount the second panel to the right of the first, with DIN on the same corner. Power both panels from the 5V supply.

| Nano pin | Connects to |
| --- | --- |
| D6 | Serial in from the master |
| D7 | Unused. Leave it open. |
| D4 | Matrix DIN, with a 330–470Ω resistor in series |
| D0, D1 | Leave open so USB still works |
| GND | Master GND and the matrix power supply GND |

The score sketch uses `LAYOUT_ROW` for each 16x16 panel. Set it to `LAYOUT_COLUMN` if those digits are scrambled. The time sketch stays `LAYOUT_COLUMN` for its 8x32 panel. Wiring is in [MATRIX.md](MATRIX.md).

### Power

- Each 8x32 matrix is 256 WS2812B pixels. Power it from a 5V supply that can feed the strip. Do not power a matrix from the Arduino 5V pin.
- Each of the 10 master chains is 16 pixels on one data pin (`PIXELS_PER_PIN` in `master.ino`). `B1` lights all 16 pixels on D4. `F1` turns that chain off without changing the others.
- Join all grounds: all three Nanos, both matrices, and the 10 pixels.

## Serial commands

Send one command per line to the master USB port at **115200**. The master answers `OK` or `ERR` on that same port. Letters are not case-sensitive, and one space is allowed after the letter (`B 1` is the same as `B1`).

`B`, `O`, and `F` change only the master chains. They are not sent to the display Nanos. `S` and `T` are forwarded as a plain number.

### Score, time, and all off

| Command | Same as | What it does |
| --- | --- | --- |
| `S15` | `SCORE 15` | Sends `15` out D2 to the score Nano. Allowed range is 0–9999. |
| `S0` | `SCORE 0` | Score shows `0`. |
| `T90` | `TIME 90` | Sends `90` out D3. The time Nano shows `01:30` and holds it. |
| `T0` | `TIME 0` | Time shows `00:00` and holds it. |
| `A` | `OFF ALL` | Turns all 10 chains off. |

The time Nano clamps anything above 99:59 to `99:59`. The master accepts a time up to 99999 and still replies `OK`.

What the display Nanos actually receive:

```
S15  ->  score Nano reads 15
T90  ->  time Nano reads 90
```

### Each chain

A color command paints every pixel on that pin. `F` turns off only that pin.

| Chain | Pin | Blue | Orange | Off |
| --- | --- | --- | --- | --- |
| 1 | D4 | `B1` | `O1` | `F1` |
| 2 | D5 | `B2` | `O2` | `F2` |
| 3 | D6 | `B3` | `O3` | `F3` |
| 4 | D7 | `B4` | `O4` | `F4` |
| 5 | D8 | `B5` | `O5` | `F5` |
| 6 | D9 | `B6` | `O6` | `F6` |
| 7 | D10 | `B7` | `O7` | `F7` |
| 8 | D11 | `B8` | `O8` | `F8` |
| 9 | D12 | `B9` | `O9` | `F9` |
| 10 | A0 | `B10` | `O10` | `F10` |

Blue is `0,0,255`. Orange is `255,80,0`. Off is `0,0,0`. The chains are SK6812 RGB, so there is no white channel.

### Long forms

| Command | Same as |
| --- | --- |
| `SCORE 15` | `S15` |
| `TIME 90` | `T90` |
| `BLUE 1` | `B1` |
| `ORANGE 3` | `O3` |
| `OFF 1` | `F1` |
| `OFF ALL` | `A` |

`BLUE`, `ORANGE`, and `OFF` take a chain number from 1 to 10. `OFF 2` through `OFF 10` turn off that chain only, the same as `F2` through `F10`.

### Replies

| Reply | When |
| --- | --- |
| `READY` | Master finished booting. |
| `OK` | Command accepted. For `S` and `T`, the number was written to the display link. |
| `ERR` | Empty extra words, a missing number, score above 9999, time above 99999, or a chain number outside 1–10. |

## Node.js test

From `test-serial`, install once, then start the session with the master Nano's COM port. The process stays open. Type one command per line.

```
cd test-serial
npm install
node send.js COM5
```

```
> S15
> T90
> B1
> O3
> F1
> A
> quit
```

The script prints `READY` when the Nano finishes resetting, then prints `OK` or `ERR` after each command. `quit` or Ctrl+C closes the port.

## Construct 3 over WebSocket

The master Nano has no network hardware, so a Node.js bridge on the PC runs a WebSocket server and writes each message to the master's USB port. Construct 3 sends the same commands listed above.

```
Construct 3  --ws://localhost:8080-->  bridge.js  --USB 115200-->  Master Nano
```

Only one program can open the COM port. Close `send.js` and the Arduino Serial Monitor first.

```
cd ws-bridge
npm install
node bridge.js COM5
```

An optional second argument changes the WebSocket port: `node bridge.js COM5 9000`. The bridge prints the Nano's `READY`, `OK`, and `ERR` in its console. Nothing is sent back to Construct 3. Commands that arrive before `READY` are held and sent once the Nano finishes resetting. After that the bridge sends one command at a time and waits for `OK` or `ERR` before the next. The Nano misses USB bytes while it updates a chain or sends a number to a display, so commands sent back to back could be lost.

One message can carry one command, or several separated by newlines (`"B1" & newline & "O3"`).

### Keyboard game without Construct 3

`game.js` is a keyboard version of the game that talks only to the WebSocket server in `bridge.js`. Run it in a normal terminal window (PowerShell or Command Prompt) so it can read single key presses.

#### How to operate

1. Plug in the master Nano and start the bridge in the first terminal:

   ```
   cd ws-bridge
   npm install
   node bridge.js COM5
   ```

   Wait for `Nano: READY`.

2. Open a second terminal and start the game:

   ```
   cd ws-bridge
   node game.js
   ```

3. The game asks for a difficulty first. Press `1`, `2`, or `3`. SPACE does nothing until a difficulty is picked.
4. Press SPACE to start a 30-second round. The score resets to 0 and the time display shows `00:30`.
5. Chase the orange light by pressing its key (A–J). Ignore the blue light.
6. When time runs out, all chains turn off and the final score stays on the display.
7. Pick another difficulty if you like, then press SPACE to play again. Press ESC to quit.

#### Keys

| Key | What it does | When |
| --- | --- | --- |
| `1` | Easy mode | On startup and between rounds |
| `2` | Medium mode | On startup and between rounds |
| `3` | Hard mode | On startup and between rounds |
| SPACE | Start a round | After a difficulty is picked |
| `A`–`J` | Hit chain 1–10 | During a round |
| ESC or Ctrl+C | Quit | Any time |

| Key | A | B | C | D | E | F | G | H | I | J |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chain | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |

#### Rules

- Orange lights jump to random chains on their own. Press an orange chain's key before it moves to score 1 point. That orange then jumps right away and gets a fresh timer. Easy mode has 6 oranges lit at once, medium 4, hard 1.
- A blue light jumps around at random as a distraction. It never sits on an orange chain. Hitting blue or a wrong key scores nothing.
- The time display counts down from 30. The score display shows the points.
- The score resets to 0 only when the next round starts. It stays on the display after a round ends and after ESC.

#### Difficulty

| Key | Mode | Oranges at once | Each orange stays for | Blue jumps every |
| --- | --- | --- | --- | --- |
| `1` | Easy | 6 | 2.0 s | 1.2 s |
| `2` | Medium | 4 | 1.0 s | 0.7 s |
| `3` | Hard | 1 | 0.6 s | 0.4 s |

A difficulty must be picked on startup. After that it stays the same for the next rounds, and can be changed between rounds but not during one. To tune the number of oranges or the speeds, edit `MODES` at the top of `game.js`.

### Construct 3 setup

Add the **WebSocket** plugin to the project, then use events like these:

| Event | Action |
| --- | --- |
| System: On start of layout | WebSocket: Connect to `"ws://localhost:8080"` |
| WebSocket: On opened | WebSocket: Send text `"A"` |
| When the score changes | WebSocket: Send text `"S" & Score` |
| System: Every 1 seconds | WebSocket: Send text `"T" & TimeLeft` |
| Light chain blue | WebSocket: Send text `"B" & ChainNumber` |
| Light chain orange | WebSocket: Send text `"O" & ChainNumber` |
| Turn chain off | WebSocket: Send text `"F" & ChainNumber` |

Preview in the browser and NW.js or desktop exports can reach `ws://localhost`. A game hosted on an `https://` page would need `wss://`, which this bridge does not provide.
