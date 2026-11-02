// k6 Load Test Script: Reconexión masiva de terminales offline (HU-132)
// Simula 5.000 terminales subiendo su Outbox a /v1/sync/push tras corte masivo de energía

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    mass_reconnection: {
      executor: "ramping-vus",
      startVUs: 100,
      stages: [
        { duration: "30s", target: 500 },  // Reconexión inicial tras volver la luz
        { duration: "1m", target: 2000 },   // Pico de cajas reconectándose
        { duration: "2m", target: 5000 },   // 5.000 terminales concurrentes
        { duration: "30s", target: 0 }      // Drenado de colas y retorno a estado estable
      ]
    }
  },
  thresholds: {
    "http_req_duration{endpoint:sync_push}": ["p(99)<800"], // HU-132, HU-426: p99 < 800 ms
    "http_req_failed": ["rate<0.005"]                       // Error rate < 0.5 %
  }
};

const BASE_URL = __ENV.API_URL || "https://api.tienditaonline.co";

export default function () {
  const terminalId = `term_sim_${__VU}`;
  const seq = __ITER + 1;

  // Jitter aleatorio para evitar thundering herd
  const jitterMs = Math.random() * 2000;
  sleep(jitterMs / 1000);

  const payload = JSON.stringify({
    events: [
      {
        event_id: `evt_${__VU}_${seq}`,
        terminal_seq: seq,
        event_type: "sale.recorded",
        payload: {
          total_cents: 1250000,
          terminal_id: terminalId
        },
        payload_hash: "mock_hash_384_bits_placeholder_k6",
        occurred_at_ms: Date.now(),
        hlc: `${Date.now()}:0:${terminalId}`
      }
    ]
  });

  const headers = {
    "Content-Type": "application/json",
    "X-Terminal-Id": terminalId,
    "X-Tenant-Id": "tenant_loadtest_01"
  };

  const res = http.post(`${BASE_URL}/v1/sync/push`, payload, {
    headers,
    tags: { endpoint: "sync_push" }
  });

  check(res, {
    "status is 200 or 503 load-shedding": (r) => r.status === 200 || r.status === 503,
    "transaction completed or queued": (r) => r.status === 200 || r.headers["Retry-After"] !== undefined
  });
}
