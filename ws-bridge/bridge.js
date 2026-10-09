// WebSocket to USB serial bridge for Construct 3.
// Construct 3 connects to ws://localhost:8080 and sends text commands.
// Each command is written to the master Nano as one line, and the next one
// waits for its OK or ERR. Opening the port resets the Nano, so commands
// wait until READY.
//
//   node bridge.js COM5
//   node bridge.js COM5 8080
//
// A message may hold several commands separated by newlines ("B1\nO3").

const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { WebSocketServer } = require("ws");

const portPath = process.argv[2];
const wsPort = Number(process.argv[3] || 8080);

if (!portPath || !Number.isInteger(wsPort) || wsPort <= 0) {
  console.error("Usage: node bridge.js COM5 [websocket port, default 8080]");
  process.exit(1);
}

const port = new SerialPort({
  path: portPath,
  baudRate: 115200,
  autoOpen: false,
});
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

// The Nano drops USB bytes while it updates LEDs or writes SoftwareSerial,
// so only one command is in flight. The next goes out after OK or ERR.
const REPLY_TIMEOUT_MS = 300;

let ready = false;
let busy = false;
let replyTimer = null;
const pending = [];

function writeNext() {
  if (!ready || busy || pending.length === 0) {
    return;
  }
  busy = true;
  const command = pending.shift();
  port.write(command + "\n", (err) => {
    if (err) {
      console.error("Serial write failed: " + err.message);
    }
  });
  replyTimer = setTimeout(() => {
    console.error("No reply to " + command);
    commandDone();
  }, REPLY_TIMEOUT_MS);
}

function commandDone() {
  clearTimeout(replyTimer);
  replyTimer = null;
  busy = false;
  writeNext();
}

function sendCommand(command) {
  pending.push(command);
  writeNext();
}

parser.on("data", (line) => {
  const text = String(line).trim();
  if (!text) {
    return;
  }
  console.log("Nano: " + text);
  if (text === "READY" && !ready) {
    ready = true;
    writeNext();
  } else if (text === "OK" || text === "ERR") {
    commandDone();
  }
});

port.on("error", (err) => {
  console.error(err.message);
  process.exit(1);
});

port.open((err) => {
  if (err) {
    console.error(err.message);
    process.exit(1);
  }
  console.log("Serial open on " + portPath + ". Waiting for READY.");
});

const wss = new WebSocketServer({ port: wsPort });

wss.on("listening", () => {
  console.log("WebSocket listening on ws://localhost:" + wsPort);
});

wss.on("error", (err) => {
  console.error("WebSocket error: " + err.message);
  process.exit(1);
});

wss.on("connection", (socket, request) => {
  const who = request.socket.remoteAddress;
  console.log("Client connected: " + who);

  socket.on("message", (data) => {
    const commands = String(data).split(/[\r\n]+/);
    for (const raw of commands) {
      const command = raw.trim();
      if (!command) {
        continue;
      }
      console.log("C3: " + command);
      sendCommand(command);
    }
  });

  socket.on("close", () => {
    console.log("Client disconnected: " + who);
  });
});

let closing = false;

function shutdown() {
  if (closing) {
    return;
  }
  closing = true;
  wss.close();
  if (port.isOpen) {
    port.close(() => process.exit(0));
    return;
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
