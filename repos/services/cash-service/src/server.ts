import http from "node:http";
import { createServiceServer } from "@tiendita/service-kit";
import { CashService } from "./index.js";

const PORT = parseInt(process.env.PORT || "3007", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const cashService = new CashService();

export function createServer(service = cashService, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "cash-service",
    port,
    host
  });
}

const server = createServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[cash-service] Listening on http://${host}:${port}`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
