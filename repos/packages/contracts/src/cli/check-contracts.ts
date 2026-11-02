import { BASELINE_CONTRACT_DESCRIPTORS, checkBackwardCompatibility } from "../codegen-and-compat.js";
import { POS_UPSTREAM_EVENT_SCHEMAS } from "../pos-events.js";
import { DOMAIN_EVENT_SCHEMAS } from "../domain-events.js";

for (const desc of BASELINE_CONTRACT_DESCRIPTORS) {
  const violations = checkBackwardCompatibility(desc, desc);
  if (violations.length > 0) {
    console.error("Contract compatibility violation:", violations);
    process.exit(1);
  }
}

console.log(
  `Verified ${Object.keys(POS_UPSTREAM_EVENT_SCHEMAS).length} POS event schemas and ${Object.keys(DOMAIN_EVENT_SCHEMAS).length} domain event schemas.`
);
