/**
 * HU-498: Colección de pruebas de humo (Post-Deploy Smoke Tests).
 * Verifica `/health/ready`, autenticación, push sintético e integridad de lectura.
 */
export interface SmokeProbeTarget {
  name: string;
  checkReady: () => Promise<{ status: number; ready: boolean }>;
  checkAuth: () => Promise<{ status: number }>;
  checkSyntheticSyncPush: () => Promise<{ status: number; ackUpToSeq: number }>;
  checkDashboardRead: () => Promise<{ status: number }>;
}

export interface SmokeSuiteReport {
  passed: boolean;
  durationMs: number;
  failures: string[];
}

export async function runPostDeploySmokeSuite(
  target: SmokeProbeTarget,
  maxDurationMs = 30_000
): Promise<SmokeSuiteReport> {
  const start = Date.now();
  const failures: string[] = [];

  try {
    const ready = await target.checkReady();
    if (ready.status !== 200 || !ready.ready) {
      failures.push(`Health ready failed with status ${ready.status}`);
    }

    const auth = await target.checkAuth();
    if (auth.status !== 200) {
      failures.push(`Auth probe failed with status ${auth.status}`);
    }

    const push = await target.checkSyntheticSyncPush();
    if (push.status !== 200 || push.ackUpToSeq < 1) {
      failures.push(`Synthetic sync push failed with status ${push.status}`);
    }

    const dash = await target.checkDashboardRead();
    if (dash.status !== 200) {
      failures.push(`Dashboard read failed with status ${dash.status}`);
    }
  } catch (err) {
    failures.push(`Unhandled smoke exception: ${err instanceof Error ? err.message : String(err)}`);
  }

  const durationMs = Date.now() - start;
  if (durationMs > maxDurationMs) {
    failures.push(`Smoke test exceeded max duration (${durationMs}ms > ${maxDurationMs}ms)`);
  }

  return {
    passed: failures.length === 0,
    durationMs,
    failures
  };
}
