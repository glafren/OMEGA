import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();

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

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const python = resolvePython();
if (!python) {
  console.error("Python bulunamadi. Python 3.10+ kurun veya PYTHON_EXECUTABLE ortam degiskenini ayarlayin.");
  process.exit(1);
}

run(python.command, [...python.args, "-m", "pip", "install", "-r", "requirements.txt"]);

const playwrightCli = path.join(root, "node_modules", "playwright", "cli.js");
run(process.execPath, [playwrightCli, "install", "chromium"]);
