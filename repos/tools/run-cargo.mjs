#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function findCargo() {
  const isWindows = process.platform === "win32";
  const binaryName = isWindows ? "cargo.exe" : "cargo";

  // 1. Check in PATH directories
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, binaryName);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  // 2. Check in standard ~/.cargo/bin
  const homeCargo = path.join(os.homedir(), ".cargo", "bin", binaryName);
  if (fs.existsSync(homeCargo)) {
    return homeCargo;
  }

  // 3. Fallback to raw binary name
  return "cargo";
}

const cargoPath = findCargo();
const args = process.argv.slice(2);

const child = spawn(cargoPath, args, {
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});
