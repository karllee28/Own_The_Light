// Keeps the serial port open and sends each line you type.
// Opening the port resets the Nano, so this waits for READY once,
// then stays running until you type quit or press Ctrl+C.
//
//   node send.js COM5
//
//   > S15
//   > T90
//   > B1
//   > O3
//   > F1
//   > A
//   > quit

const readline = require("readline");
const { SerialPort } = require("serialport");
const { ReadlineParser } = require("@serialport/parser-readline");

const portPath = process.argv[2];

if (!portPath) {
  console.error("Usage: node send.js COM5");
  console.error("Then type commands, one per line. Type quit to exit.");
  process.exit(1);
}

const port = new SerialPort({
  path: portPath,
  baudRate: 115200,
  autoOpen: false,
});
const parser = port.pipe(new ReadlineParser({ delimiter: "\n" }));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "> ",
});

let closing = false;

function shutdown() {
  if (closing) {
    return;
  }
  closing = true;
  rl.close();
  if (port.isOpen) {
    port.close(() => process.exit(0));
    return;
  }
  process.exit(0);
}

parser.on("data", (line) => {
  const text = String(line).trim();
  if (!text) {
    return;
  }
  console.log(text);
  rl.prompt(true);
});

rl.on("line", (line) => {
  const command = line.trim();
  if (!command) {
    rl.prompt();
    return;
  }
  if (command.toLowerCase() === "quit" || command.toLowerCase() === "exit") {
    shutdown();
    return;
  }
  port.write(command + "\n", (err) => {
    if (err) {
      console.error(err.message);
      rl.prompt();
    }
  });
});

rl.on("close", () => {
  if (!closing && port.isOpen) {
    port.close(() => process.exit(0));
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
  console.log("Connected to " + portPath + ". Type a command, or quit to exit.");
  rl.prompt();
});
