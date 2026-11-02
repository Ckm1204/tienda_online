#!/usr/bin/env node
// Marca una lista de Historias de Usuario como completadas `- [x] HU-XXX:`
// tanto en `docs/11-backlog-historias-usuario.md` como en los archivos de `docs/backlog/`.
import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(import.meta.dirname, "../../..");
const monolithicPath = path.join(workspaceRoot, "docs", "11-backlog-historias-usuario.md");
const modularRoot = path.join(workspaceRoot, "docs", "backlog");

const targetCodes = new Set();

for (const rawArg of process.argv.slice(2)) {
  for (const part of rawArg.split(",")) {
    const trimmed = part.trim();
    if (/^EP-\d{2}$/i.test(trimmed)) {
      const prefix = trimmed.toUpperCase();
      for (const dirEntry of fs.readdirSync(modularRoot, { withFileTypes: true })) {
        if (dirEntry.isDirectory() && dirEntry.name.toUpperCase().startsWith(prefix)) {
          const epPath = path.join(modularRoot, dirEntry.name);
          for (const ftFile of fs.readdirSync(epPath)) {
            if (ftFile.startsWith("FT-") && ftFile.endsWith(".md")) {
              const ftText = fs.readFileSync(path.join(epPath, ftFile), "utf8");
              for (const m of ftText.matchAll(/^### - \[[ x]\] (HU-\d{3}):/gm)) {
                targetCodes.add(m[1]);
              }
            }
          }
        }
      }
      continue;
    }
    if (trimmed.includes("..") || /^\d+-\d+$/.test(trimmed)) {
      const sep = trimmed.includes("..") ? ".." : "-";
      const [a, b] = trimmed.split(sep).map((s) => parseInt(s.replace(/[^\d]/g, ""), 10));
      if (!Number.isNaN(a) && !Number.isNaN(b)) {
        for (let n = a; n <= b; n++) {
          targetCodes.add(`HU-${String(n).padStart(3, "0")}`);
        }
      }
      continue;
    }
    const n = parseInt(trimmed.replace(/[^\d]/g, ""), 10);
    if (!Number.isNaN(n) && n >= 1 && n <= 505) {
      targetCodes.add(`HU-${String(n).padStart(3, "0")}`);
    }
  }
}

function markInFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let changed = false;
  for (const code of targetCodes) {
    const pattern = new RegExp(`^### - \\[ \\] (${code}:)`, "m");
    if (pattern.test(content)) {
      content = content.replace(pattern, "### - [x] $1");
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(filePath, content, "utf8");
  }
}

if (targetCodes.size > 0) {
  markInFile(monolithicPath);
  for (const epEntry of fs.readdirSync(modularRoot, { withFileTypes: true })) {
    if (!epEntry.isDirectory()) continue;
    const epPath = path.join(modularRoot, epEntry.name);
    for (const ftFile of fs.readdirSync(epPath)) {
      if (ftFile.startsWith("FT-") && ftFile.endsWith(".md")) {
        markInFile(path.join(epPath, ftFile));
      }
    }
  }
}

const monoText = fs.readFileSync(monolithicPath, "utf8");
const doneCount = (monoText.match(/^### - \[x\] HU-\d{3}:/gm) || []).length;
const pendingCount = (monoText.match(/^### - \[ \] HU-\d{3}:/gm) || []).length;
console.log(`Backlog progress: ${doneCount} / ${doneCount + pendingCount} HUs completed ([x]).`);
