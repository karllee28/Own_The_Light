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
// EXIT when X is pressed, which closes the kiosk and stops the bridge.

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
const SOUNDS = path.join(__dirname, "public", "sounds");
const AUDIO_TYPES = {
  mp4: "audio/mp4",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
};

function notFound(response) {
  response.writeHead(404, { "Content-Type": "text/plain" });
  response.end("Not found");
}

function serveFile(response, file, type) {
  fs.readFile(file, (err, data) => {
    if (err) {
      notFound(response);
      return;
    }
    response.writeHead(200, { "Content-Type": type });
    response.end(data);
  });
}

// Settings and best scores from the game page.
const SETTINGS_FILE = path.join(__dirname, "settings.json");
const SETTINGS_LIMIT = 16 * 1024;

function sendSettings(response) {
  fs.readFile(SETTINGS_FILE, "utf8", (err, text) => {
    response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    response.end(err ? "{}" : text);
  });
}

function saveSettings(request, response) {
  const chunks = [];
  let size = 0;
  request.on("data", (chunk) => {
    size += chunk.length;
    if (size > SETTINGS_LIMIT) {
      response.writeHead(413, { "Content-Type": "text/plain" });
      response.end("Too large");
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on("end", () => {
    if (size > SETTINGS_LIMIT) {
      return;
    }
    let data = null;
    try {
      data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      // Handled below.
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      response.writeHead(400, { "Content-Type": "text/plain" });
      response.end("Expected a JSON object");
      return;
    }
    // Write a temp file first so a crash cannot leave half a settings file.
    const temp = SETTINGS_FILE + ".tmp";
    fs.writeFile(temp, JSON.stringify(data, null, 2), (err) => {
      if (err) {
        console.error("Could not save settings: " + err.message);
        response.writeHead(500, { "Content-Type": "text/plain" });
        response.end("Could not save");
        return;
      }
      fs.rename(temp, SETTINGS_FILE, (renameErr) => {
        if (renameErr) {
          console.error("Could not save settings: " + renameErr.message);
        }
        response.writeHead(renameErr ? 500 : 204);
        response.end();
      });
    });
  });
}

const server = http.createServer((request, response) => {
  const url = request.url.split("?")[0];
  if (url === "/settings") {
    if (request.method === "GET") {
      sendSettings(response);
    } else if (request.method === "PUT") {
      saveSettings(request, response);
    } else {
      notFound(response);
    }
    return;
  }
  if (request.method !== "GET") {
    notFound(response);
    return;
  }
  if (url === "/" || url === "/index.html") {
    serveFile(response, PAGE, "text/html; charset=utf-8");
    return;
  }
  const sound = /^\/sounds\/([a-z0-9_-]+)\.(mp4|m4a|mp3|wav|ogg)$/i.exec(url);
  if (sound) {
    const ext = sound[2].toLowerCase();
    serveFile(response, path.join(SOUNDS, sound[1] + "." + ext), AUDIO_TYPES[ext]);
    return;
  }
  notFound(response);
});

const wss = new WebSocketServer({ server });

function serverError(err) {
  if (err.code === "EADDRINUSE") {
    console.error("Port " + wsPort + " is already in use. Is the bridge already running in another window?");
  } else {
    console.error("Server error: " + err.message);
  }
  process.exit(1);
}

server.on("error", serverError);
wss.on("error", serverError);

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
    "--autoplay-policy=no-user-gesture-required",
    "--user-data-dir=" + path.join(os.tmpdir(), "own-the-light-kiosk"),
  ], { stdio: "ignore" });
  browser.on("error", (err) => {
    console.error("Could not open the kiosk browser: " + err.message);
    browser = null;
  });
  browser.on("exit", () => {
    browser = null;
  });
  console.log("Kiosk open. Press X on the game page to exit.");
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
