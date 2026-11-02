import { runPostDeploySmokeSuite } from "./smoke.js";

const report = await runPostDeploySmokeSuite({
  name: "local-synthetic",
  checkReady: async () => ({ status: 200, ready: true }),
  checkAuth: async () => ({ status: 200 }),
  checkSyntheticSyncPush: async () => ({ status: 200, ackUpToSeq: 1 }),
  checkDashboardRead: async () => ({ status: 200 })
});

if (!report.passed) {
  console.error("Smoke test failed:", report.failures);
  process.exit(1);
}
console.log(`Smoke suite passed in ${report.durationMs}ms`);
