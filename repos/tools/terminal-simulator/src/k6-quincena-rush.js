// k6 Load Test Script: Pico de Ventas en Quincena Colombiana (HU-132, HU-425)
// Simula 2.000 clientes concurrentes realizando ventas atómicas en simultáneo
// y 500 administradores consultando el dashboard en vivo por SSE.

import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  scenarios: {
    // Escenario 1: Cajeros cerrando ventas rápidamente en horas pico (12pm - 2pm y 6pm - 8pm)
    cashier_checkout_rush: {
      executor: "ramping-arrival-rate",
      startRate: 50,
      timeUnit: "1s",
      preAllocatedVUs: 500,
      maxVUs: 2500,
      stages: [
        { duration: "30s", target: 300 },   // Calentamiento
        { duration: "2m", target: 1500 },   // Pico de quincena (1.500 ventas/segundo)
        { duration: "1m", target: 1500 },   // Sostenido
        { duration: "30s", target: 100 }    // Enfriamiento
      ]
    },
    // Escenario 2: Dueños monitoreando métricas en vivo en la app de gestión
    management_dashboard_live: {
      executor: "constant-vus",
      vus: 200,
      duration: "4m"
    }
  },
  thresholds: {
    "http_req_duration{scenario:cashier_checkout_rush}": ["p(95)<350", "p(99)<700"],
    "http_req_duration{scenario:management_dashboard_live}": ["p(95)<200"],
    "http_req_failed": ["rate<0.01"] // Menos del 1% de fallos bajo carga pico
  }
};

const BASE_URL = __ENV.API_URL || "http://127.0.0.1:3000";

export default function () {
  const isManager = __VU % 10 === 0;

  if (isManager) {
    // Consulta de reporte agregado por parte del tendero en apps/management
    const res = http.get(`${BASE_URL}/v1/app/reports/dashboard`, {
      headers: {
        "Accept": "application/json",
        "X-Tenant-Id": "t_esmeralda_01",
        "Authorization": "Bearer mock_jwt_owner_token"
      },
      tags: { scenario: "management_dashboard_live" }
    });

    check(res, {
      "dashboard status is 200": (r) => r.status === 200 || r.status === 304
    });

    sleep(1);
  } else {
    // Venta en mostrador con medios de pago mixtos (Efectivo + Nequi)
    const payload = JSON.stringify({
      sale_id: `sale_q_${__VU}_${__ITER}`,
      total_cents: 3580000, // $35.800 COP
      cash_received_cents: 2000000,
      digital_received_cents: 1580000,
      lines_count: 4,
      dian_document_type: "POS_EQUIVALENT",
      timestamp_epoch: Date.now()
    });

    const res = http.post(`${BASE_URL}/v1/app/sales`, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Terminal-Id": `CAJA-0${(__VU % 5) + 1}`,
        "X-Tenant-Id": "t_esmeralda_01",
        "Idempotency-Key": `idem_sale_${__VU}_${__ITER}`
      },
      tags: { scenario: "cashier_checkout_rush" }
    });

    check(res, {
      "sale registered or queued": (r) => r.status === 200 || r.status === 201 || r.status === 429
    });

    sleep(0.5);
  }
}
