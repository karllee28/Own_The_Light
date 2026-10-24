# Own The Light

Three Arduino Nano boards. The master reads commands from a Node.js script over USB, then forwards the score to one Nano and the time to the other. Those two only listen. The time Nano drives one 8x32 WS2812B matrix. The score Nano drives two 16x16 WS2812B panels side by side. The master also drives 12 SK6812 RGB chains, 16 pixels each (blue, orange, or off). There are no buttons.

A classic Nano has only one hardware serial port, and that port is the USB connection. The links between Nanos use SoftwareSerial on other pins, so USB can stay plugged in.

```
Node.js  --USB-->  Master Nano  --D2-->  Score Nano D6  -->  two 16x16 panels
                         |
                         +--D3-->  Time Nano D6   -->  8x32 matrix
                         |
                         +-->  12 SK6812 chains (D4-D12, A0, A3, A4)
```

USB baud rate is **115200**. Each link between Nanos is **9600**. All three boards are 5V, so those two wires do not need a level shifter.

## Boards and sketches

Open each folder as its own Arduino IDE sketch. Install the **Adafruit NeoPixel** library. In the IDE, pick **Arduino Nano** for every board.

| Board | Sketch | Role |
| --- | --- | --- |
| Master Nano | [master/master.ino](master/master.ino) | Reads USB commands, forwards score and time, drives 12 light chains |
| Score Nano | [score_nano/score_nano.ino](score_nano/score_nano.ino) | Draws the score (0–9999) in red on two 16x16 panels |
| Time Nano | [time_nano/time_nano.ino](time_nano/time_nano.ino) | Holds seconds as `MM:SS` (90 → `01:30`), red |

On boot the matrices show `0` and `00:00`, the 12 chains are off, and the master prints `READY` on USB.

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
| A3 | SK6812 chain 11 data (16 pixels) |
| A4 | SK6812 chain 12 data (16 pixels) |
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

- The time display is one 8x32 matrix (256 WS2812B pixels). The score display is two 16x16 panels (512 WS2812B pixels). Power them from a 5V supply that can feed all the pixels. Do not power any panel from the Arduino 5V pin.
- Each of the 12 master chains is 16 pixels on one data pin (`PIXELS_PER_PIN` in `master.ino`), 192 pixels in total. `B1` lights all 16 pixels on D4. `F1` turns that chain off without changing the others.
- Join all grounds: all three Nanos, the time matrix, both score panels, and the 12 chains.

### Brightness

Each sketch has a `BRIGHTNESS_PERCENT` setting near the top, from 0 to 100. 100 is full brightness. Change the number and upload that sketch to its Nano again.

| Lights | Sketch | Default |
| --- | --- | --- |
| Score display | `score_nano/score_nano.ino` | 16 |
| Time display | `time_nano/time_nano.ino` | 16 |
| 12 game light chains | `master/master.ino` | 31 |

Higher values draw more current. At 100%, red digits on the score panels can draw about 3 A, the time matrix 1–2 A, and each game chain about 0.4 A in orange. Check that the 5V supply can deliver that before raising the brightness.

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
| `A` | `OFF ALL` | Turns all 12 chains off. |

The time Nano clamps 6000 to 32767 seconds to `99:59`. The master accepts a time up to 99999 and still replies `OK`. However, values above 32767 overflow on the time Nano and show a wrong time, so keep times at 5999 or below.

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
| 11 | A3 | `B11` | `O11` | `F11` |
| 12 | A4 | `B12` | `O12` | `F12` |

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

`BLUE`, `ORANGE`, and `OFF` take a chain number from 1 to 12. `OFF 2` through `OFF 12` turn off that chain only, the same as `F2` through `F12`.

### Replies

| Reply | When |
| --- | --- |
| `READY` | Master finished booting. |
| `OK` | Command accepted. For `S` and `T`, the number was written to the display link. |
| `ERR` | Empty extra words, a missing number, score above 9999, time above 99999, or a chain number outside 1–12. |

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

Opening the port resets the Nano. Wait until the script prints `READY` before typing. Commands typed earlier are lost. After that the script prints `OK` or `ERR` after each command. Type one command at a time, because the Nano can miss bytes from commands pasted back to back. `quit` or Ctrl+C closes the port.

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

### Game page in the browser

The quickest way to start everything is to double-click **`run-all.bat`** in the project folder. It installs the packages on the first run, finds the master Nano's COM port, starts the bridge, and opens the game page full screen in kiosk mode (Edge, or Chrome if Edge is missing). The script remembers the last COM port it used, saved in `ws-bridge/last-port.txt`. If that port is plugged in, it is used without asking. Otherwise the script looks for the Nano. If exactly one COM port is found, it uses that one. If there are none or several, it lists them and asks, and pressing Enter picks the last port. To choose a port directly, run `run-all.bat COM5` from a terminal. That port is then remembered for next time. Delete `last-port.txt` to forget the saved port.

Press **X** on the game page to exit. X ends any round, turns all lights off, closes the full-screen window, and stops the bridge. It works during a round too, so players should not press it by accident. Right-click is disabled on the page so players cannot open browser menus. If the page has lost its connection to the bridge, X only closes the window, and Ctrl+C in the script window stops the bridge. To start the kiosk without the script, run `node bridge.js COM5 --kiosk` in `ws-bridge`.

The bridge also serves a game page. Start the bridge, wait for `Nano: READY`, then open **http://localhost:8080** in a browser. The page connects to the bridge automatically and shows `Bridge connected` in the top right corner.

```
cd ws-bridge
npm install
node bridge.js COM5
```

The page draws the board from the switch and LED layout drawing. Lights 1–10 are in the same places as in the drawing. Lights 11 and 12 sit at the ends of the two diagonal lines that start at 1 and 2. The black box at the top shows the score and time, like the matrix displays.

To play, click or tap a light, or press its key (`A`–`L` for lights 1–12). SPACE or **Start** begins a 3-second countdown. Large `3`, `2`, `1` numbers appear over the board with a beep on each, then `GO!` and the round starts. The lights stay off and button presses do nothing during the countdown. ESC or **Stop** cancels the countdown or ends a round early. Lights on the page change color together with the real chains.

Settings can be changed between rounds. Every change is saved right away by the bridge in `ws-bridge/settings.json`, together with the best score for each mode. They are loaded again the next time the page opens, even after exiting the kiosk with X, restarting the PC, or using a different browser. To go back to the defaults, press **Reset to defaults**, or delete `settings.json` while the bridge is stopped.

The settings are:

| Group | Setting | Range | Default |
| --- | --- | --- | --- |
| Difficulty | Mode | Easy, Medium, Hard, Custom | Easy |
| Difficulty | Orange lights at once | 1–10 | 6 |
| Difficulty | Orange stays (seconds) | 0.2–10 | 2.0 |
| Difficulty | Blue distraction | On or off | On |
| Difficulty | Blue jumps every (seconds) | 0.2–10 | 1.2 |
| Time | Round length (seconds) | 5–5999 | 30 |
| Score | Points per orange hit | 1–100 | 1 |
| Score | Penalty for hitting blue | 0–100 | 0 |
| Score | Penalty for an unlit button | 0–100 | 0 |
| Score | Score needed to win | 1–9999 | 15 |
| Sound | Sound effects | On or off | On |
| Sound | Volume | 0–100 | 70 |

Picking Easy, Medium, or Hard fills in the three timing fields with the values from the difficulty table below. Editing any of them switches the mode to Custom. The score never drops below 0 or goes above 9999. The page also keeps the best score for each mode.

The page and `game.js` both send commands to the same lights, so run only one of them at a time.

#### Light test

The **Light test** buttons in the settings check the wiring of the 12 chains without starting a game. The board on the page shows the same colors, so you can compare it with the real lights.

| Button | What it does |
| --- | --- |
| **All orange** | Lights all 12 chains orange. |
| **All blue** | Lights all 12 chains blue. |
| **One by one** | Lights chain 1 orange, then blue, then moves to chain 2, and so on up to 12, half a second per color. Use it to check that each chain is wired to the right position. |
| **All off** | Turns every chain off and stops a One by one test. |

A light that stays dark points to a wiring, power, or data pin problem on that chain. A light that shows the wrong color points to a color order problem: see `SK6812_TYPE` in `master.ino`. The test buttons are locked during a round. Starting a round or pressing X stops any test.

#### Sounds

The page plays 8-bit style sound effects through the PC speakers:

| Sound | When |
| --- | --- |
| `hit` | A coin sound when an orange light is hit. |
| `miss` | A low bump when blue or an unlit button is pressed. |
| `count` | A beep on each number of the 3, 2, 1 countdown. |
| `start` | A short rising jingle on "GO!" when the round starts. A `start` file of your own plays as soon as Start is pressed instead (see below). |
| `tick` | A beep each second for the last 5 seconds. |
| `win` | A fanfare when the round ends with at least the score needed to win. |
| `lose` | A falling "wah wah" when the round ends below that score. |

Stopping a round with ESC or **Stop** plays neither win nor lose. The **Hit**, **Miss**, **Win**, and **Lose** buttons under Sound play each effect so you can set the volume.

The sounds are generated by the browser, so no audio files are needed. To use your own, put one MP4 file per sound in `ws-bridge/public/sounds`:

```
ws-bridge/public/sounds/
  hit.mp4
  miss.mp4
  count.mp4
  start.mp4
  tick.mp4
  win.mp4
  lose.mp4
```

Each file replaces only its own sound, and any missing file keeps the built-in sound.

A custom `start` file is treated differently because it is usually a longer intro. It plays the moment Start is pressed, and the built-in countdown beeps are skipped so they do not play over it. Nothing extra plays on "GO!". If you also add a custom `count` file, it plays on each number of the countdown together with your start file. A start file of about 3 seconds lines up with the countdown. A longer one keeps playing into the round. Only the audio track of an MP4 plays. A video track is ignored, so keep the files short and small. The file names must be lowercase and exactly as shown. M4A, MP3, WAV, and OGG also work (`hit.mp3`, for example). If two files exist for one sound, the MP4 is used. Reload the page or restart `run-all.bat` after adding files. Only use audio you have the rights to. Sound clips ripped from Nintendo games are copyrighted.

### Keyboard game without Construct 3

`game.js` is a keyboard version of the game that talks only to the WebSocket server in `bridge.js`. Run it in a normal terminal window (PowerShell or Command Prompt) so it can read single key presses.

There are no physical buttons. The player uses 12 keys on the PC keyboard, `A` to `L`, one for each light chain. `1`, `2`, `3`, SPACE, and ESC choose the difficulty, start a round, and quit.

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
5. Chase the orange light by pressing its key (A–L). Ignore the blue light.
6. When time runs out, all chains turn off and the final score stays on the display.
7. Pick another difficulty if you like, then press SPACE to play again. Press ESC to quit.

#### Keys

| Key | What it does | When |
| --- | --- | --- |
| `1` | Easy mode | On startup and between rounds |
| `2` | Medium mode | On startup and between rounds |
| `3` | Hard mode | On startup and between rounds |
| SPACE | Start a round | After a difficulty is picked |
| `A`–`L` | Hit chain 1–12 | During a round |
| ESC or Ctrl+C | Quit | Any time |

| Key | A | B | C | D | E | F | G | H | I | J | K | L |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chain | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |

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

The bridge accepts connections from any computer on the local network, not only this PC. Anyone who can reach port 8080 can send commands to the lights.

Preview in the browser and NW.js or desktop exports can reach `ws://localhost`. A game hosted on an `https://` page would need `wss://`, which this bridge does not provide.
