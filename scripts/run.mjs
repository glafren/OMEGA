import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const mode = process.argv[2] === "start" ? "start" : "dev";
const root = process.cwd();
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const children = [];

function commandExists(command, args = ["--version"]) {
  const result = spawnSync(command, args, { cwd: root, stdio: "ignore", shell: false });
  return result.status === 0;
}

function resolvePython() {
  if (process.env.PYTHON_EXECUTABLE) {
    return { command: process.env.PYTHON_EXECUTABLE, args: [] };
  }

  const candidates =
    process.platform === "win32"
      ? [
          { command: "py", args: [] },
          { command: "python", args: [] },
          { command: "python3", args: [] },
        ]
      : [
          { command: "python3", args: [] },
          { command: "python", args: [] },
        ];

  return candidates.find((candidate) => commandExists(candidate.command));
}

function launch(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  children.push(child);
  return child;
}

const python = resolvePython();
if (!python) {
  console.error("Python bulunamadi. Python 3.10+ kurun veya PYTHON_EXECUTABLE ortam degiskenini ayarlayin.");
  process.exit(1);
}

const stock = launch(python.command, [...python.args, path.join("backend", "stock", "siparis_app.py")], { OMEGA_STOCK_PORT: "8010" });
const web = launch(process.execPath, [nextBin, mode, "-p", "3000"]);

if (process.env.OMEGA_OPEN_BROWSER === "1") {
  setTimeout(() => {
    if (web.exitCode === null && process.platform === "win32") {
      const browser = spawn("cmd", ["/c", "start", "", "http://localhost:3000"], { detached: true, stdio: "ignore", windowsHide: true });
      browser.unref();
    }
  }, 1500);
}

function stop(code = 0) {
  for (const child of children) if (!child.killed) child.kill();
  process.exit(code);
}

stock.on("exit", (code) => {
  if (code && !web.killed) {
    console.error("Stok servisi durdu. Python bağımlılıklarını `npm run setup` ile kurun.");
    stop(code);
  }
});
web.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
