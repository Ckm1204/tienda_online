import fs from "node:fs";
import path from "node:path";
import { generateOpenApiSpec } from "../codegen-and-compat.js";

const outDir = path.resolve(import.meta.dirname, "../../generated");
fs.mkdirSync(outDir, { recursive: true });
const spec = generateOpenApiSpec();
fs.writeFileSync(path.join(outDir, "openapi.json"), JSON.stringify(spec, null, 2), "utf8");
console.log(`Generated OpenAPI 3.1 spec with ${Object.keys(spec.paths).length} paths.`);
