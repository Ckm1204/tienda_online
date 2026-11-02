import fs from "node:fs";
import path from "node:path";
import { BASELINE_CONTRACT_DESCRIPTORS, generateRustContractsCode } from "../codegen-and-compat.js";

const outDir = path.resolve(import.meta.dirname, "../../generated");
fs.mkdirSync(outDir, { recursive: true });

const rustCode = generateRustContractsCode([...BASELINE_CONTRACT_DESCRIPTORS]);
fs.writeFileSync(path.join(outDir, "contracts.rs"), rustCode, "utf8");
fs.writeFileSync(
  path.join(outDir, "schemas.json"),
  JSON.stringify(BASELINE_CONTRACT_DESCRIPTORS, null, 2),
  "utf8"
);
console.log("Generated contracts.rs and schemas.json");
