// WebSocket to USB serial bridge for Construct 3.
// Construct 3 connects to ws://localhost:8080 and sends text commands.
// Each command is written to the master Nano as one line, and the next one
// waits for its OK or ERR. Opening the port resets the Nano, so commands
// wait until READY.
//
//   node bridge.js COM5
//   node bridge.js COM5 8080
//   node bridge.js COM5 --kiosk
//
// A message may hold several commands separated by newlines ("B1\nO3").
// The game page in public/index.html is served at http://localhost:8080.
// With --kiosk the page opens full screen in Edge or Chrome. The page sends
// EXIT when F1 is pressed, which closes the kiosk and stops the bridge.

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { execFileSync, spawn } = require("child_process");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");
const { WebSocketServer } = require("ws");

const args = process.argv.slice(2);
const kiosk = args.includes("--kiosk");
const [portPath, wsPortArg] = args.filter((arg) => arg !== "--kiosk");
const wsPort = Number(wsPortArg || 8080);

if (!portPath || !Number.isInteger(wsPort) || wsPort <= 0) {
  console.error("Usage: node bridge.js COM5 [websocket port, default 8080] [--kiosk]");
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

const PAGE = path.join(__dirname, "public", "index.html");

const server = http.createServer((request, response) => {
  const url = request.url.split("?")[0];
  if (request.method !== "GET" || (url !== "/" && url !== "/index.html")) {
    response.writeHead(404, { "Content-Type": "text/plain" });
    response.end("Not found");
    return;
  }
  fs.readFile(PAGE, (err, html) => {
    if (err) {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Could not read public/index.html");
      return;
    }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html);
  });
});

const wss = new WebSocketServer({ server });

server.on("error", (err) => {
  console.error("Server error: " + err.message);
  process.exit(1);
});

server.listen(wsPort, () => {
  console.log("Game page on http://localhost:" + wsPort);
  console.log("WebSocket listening on ws://localhost:" + wsPort);
  if (kiosk) {
    openKiosk("http://localhost:" + wsPort);
  }
});

const BROWSERS = [
  [process.env["ProgramFiles(x86)"], "Microsoft/Edge/Application/msedge.exe"],
  [process.env.ProgramFiles, "Microsoft/Edge/Application/msedge.exe"],
  [process.env.ProgramFiles, "Google/Chrome/Application/chrome.exe"],
  [process.env["ProgramFiles(x86)"], "Google/Chrome/Application/chrome.exe"],
  [process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"],
]
  .filter(([base]) => base)
  .map(([base, exe]) => path.join(base, exe));

let browser = null;

function openKiosk(url) {
  const exe = BROWSERS.find((file) => fs.existsSync(file));
  if (!exe) {
    console.error("Edge or Chrome was not found. Open " + url + " in a browser yourself.");
    return;
  }
  // A separate profile makes this a new browser process that can be closed
  // without touching other open browser windows.
  browser = spawn(exe, [
    "--kiosk",
    url,
    "--edge-kiosk-type=fullscreen",
    "--no-first-run",
    "--disable-pinch",
    "--overscroll-history-navigation=0",
    "--user-data-dir=" + path.join(os.tmpdir(), "own-the-light-kiosk"),
  ], { stdio: "ignore" });
  browser.on("error", (err) => {
    console.error("Could not open the kiosk browser: " + err.message);
    browser = null;
  });
  browser.on("exit", () => {
    browser = null;
  });
  console.log("Kiosk open. Press F1 on the game page to exit.");
}

function closeBrowser() {
  if (!browser) {
    return;
  }
  try {
    execFileSync("taskkill", ["/PID", String(browser.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already closed.
  }
  browser = null;
}

// Lets the lights-off commands reach the Nano before the port closes.
function exitWhenIdle() {
  const deadline = Date.now() + 2000;
  const check = setInterval(() => {
    if ((!busy && pending.length === 0) || Date.now() > deadline) {
      clearInterval(check);
      shutdown();
    }
  }, 50);
}

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
      if (command.toUpperCase() === "EXIT") {
        if (kiosk) {
          console.log("Exit requested from the game page.");
          exitWhenIdle();
        }
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
  closeBrowser();
  wss.close();
  server.close();
  if (port.isOpen) {
    port.close(() => process.exit(0));
    return;
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", closeBrowser);
