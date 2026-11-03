import http from "node:http";
import { createServiceServer } from "@tiendita/service-kit";
import { CustomerService } from "./index.js";

const PORT = parseInt(process.env.PORT || "3009", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const customerService = new CustomerService();

export function createServer(service = customerService, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "customer-service",
    port,
    host
  });
}

const server = createServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[customer-service] Listening on http://${host}:${port}`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
