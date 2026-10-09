// Own The Light game. Connects to the WebSocket server in bridge.js.
// Orange lights jump to random chains on their own. Chase them: press an
// orange chain's key before it moves to score 1 point. Easy mode has 6
// oranges at once, medium 4, hard 1. A blue light also jumps around
// at random to distract. Blue keys score nothing. The round lasts 30 seconds.
// The final score stays on the display until the next round starts.
//
//   Key:   A B C D E F G H I J
//   Chain: 1 2 3 4 5 6 7 8 9 10
//
//   On startup pick a difficulty first: 1 easy, 2 medium, 3 hard.
//   It can be changed again between rounds.
//   SPACE starts a round, ESC or Ctrl+C quits.
//
//   node game.js
//   node game.js ws://localhost:8080

const readline = require("readline");
const WebSocket = require("ws");

const url = process.argv[2] || "ws://localhost:8080";
const KEYS = "abcdefghij";
const ROUND_SECONDS = 30;
// oranges: how many orange lights are on at once.
// orangeMs: how long each orange light stays before it jumps.
// blueMs: how often the blue light jumps.
const MODES = {
  1: { name: "Easy", oranges: 6, orangeMs: 2000, blueMs: 1200 },
  2: { name: "Medium", oranges: 4, orangeMs: 1000, blueMs: 700 },
  3: { name: "Hard", oranges: 1, orangeMs: 600, blueMs: 400 },
};

const socket = new WebSocket(url);

let mode = null;
let playing = false;
let score = 0;
let timeLeft = 0;
let oranges = [];
let orangeTimers = [];
let blue = 0;
let ticker = null;
let blueTimer = null;

function send(...commands) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(commands.join("\n"));
  }
}

function randomChain(...avoid) {
  let next = 0;
  do {
    next = 1 + Math.floor(Math.random() * KEYS.length);
  } while (avoid.includes(next));
  return next;
}

function keyFor(chain) {
  return KEYS[chain - 1].toUpperCase();
}

// Moves orange number i to a free chain and gives it a fresh orangeMs.
function moveOrange(i, ...extra) {
  const old = oranges[i];
  oranges[i] = randomChain(...oranges, blue);
  send("F" + old, "O" + oranges[i], ...extra);
  scheduleOrange(i);
}

function scheduleOrange(i) {
  clearTimeout(orangeTimers[i]);
  orangeTimers[i] = setTimeout(() => moveOrange(i), mode.orangeMs);
}

function moveBlue() {
  const old = blue;
  blue = randomChain(old, ...oranges);
  send("F" + old, "B" + blue);
}

function stopTimers() {
  clearInterval(ticker);
  clearInterval(blueTimer);
  orangeTimers.forEach(clearTimeout);
  ticker = blueTimer = null;
  orangeTimers = [];
}

function startRound() {
  playing = true;
  score = 0;
  timeLeft = ROUND_SECONDS;
  oranges = [];
  for (let i = 0; i < mode.oranges; i++) {
    oranges.push(randomChain(...oranges));
  }
  blue = randomChain(...oranges);
  send("S0", "A", "T" + timeLeft, ...oranges.map((c) => "O" + c), "B" + blue);
  console.log("\nGo! " + mode.name + " mode. Chase the orange lights.");

  oranges.forEach((_, i) => scheduleOrange(i));
  blueTimer = setInterval(moveBlue, mode.blueMs);
  ticker = setInterval(() => {
    timeLeft--;
    send("T" + timeLeft);
    if (timeLeft <= 0) {
      endRound();
    }
  }, 1000);
}

function endRound() {
  stopTimers();
  playing = false;
  oranges = [];
  blue = 0;
  send("A", "T0");
  console.log("\nTime's up! " + mode.name + " score: " + score);
  printMenu();
}

function printMenu() {
  if (!mode) {
    console.log("Select difficulty: 1 Easy, 2 Medium, 3 Hard. ESC to quit.");
    return;
  }
  console.log("Mode: " + mode.name + ". Press 1 Easy, 2 Medium, 3 Hard to change.");
  console.log("Press SPACE to start, ESC to quit.");
}

function hit(i) {
  score++;
  const old = oranges[i];
  moveOrange(i, "S" + score);
  console.log("Hit " + keyFor(old) + "  score " + score + "  time " + timeLeft);
}

function quit() {
  stopTimers();
  send("A");
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
  }
  socket.close();
  setTimeout(() => process.exit(0), 200);
}

function onKey(str, key) {
  if (!key) {
    return;
  }
  if (key.name === "escape" || (key.ctrl && key.name === "c")) {
    quit();
    return;
  }
  if (!playing) {
    if (key.name === "space") {
      if (mode) {
        startRound();
      } else {
        console.log("Select difficulty first: 1 Easy, 2 Medium, 3 Hard.");
      }
    } else if (MODES[key.name]) {
      mode = MODES[key.name];
      console.log("Mode: " + mode.name + ". Press SPACE to start.");
    }
    return;
  }
  const chain = KEYS.indexOf(key.name) + 1;
  const i = chain > 0 ? oranges.indexOf(chain) : -1;
  if (i >= 0) {
    hit(i);
  }
}

socket.on("open", () => {
  console.log("Connected to " + url + ".");
  console.log("Keys A-J = chains 1-10. Chase the orange lights, ignore the blue one.");
  printMenu();

  send("A");

  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on("keypress", onKey);
});

socket.on("error", (err) => {
  console.error("Could not reach " + url + ": " + err.message);
  console.error("Start the WebSocket server in bridge.js first.");
  process.exit(1);
});

socket.on("close", () => {
  process.exit(0);
});
