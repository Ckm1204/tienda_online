import { auditDependencyLicenses } from "./license-audit.js";

const result = auditDependencyLicenses([
  { name: "typescript", version: "5.7.2", license: "Apache-2.0" },
  { name: "vitest", version: "2.1.8", license: "MIT" },
  { name: "zod", version: "3.24.1", license: "MIT" },
  { name: "turbo", version: "2.3.3", license: "MIT" }
]);

if (!result.passed) {
  console.error("Forbidden licenses found:", result.forbidden);
  process.exit(1);
}
console.log("License check passed: 0 forbidden licenses.");
