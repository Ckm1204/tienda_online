import http from "node:http";
import { createServiceServer } from "@tiendita/service-kit";
import { NotificationService } from "./index.js";

const PORT = parseInt(process.env.PORT || "3013", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const notificationService = new NotificationService();

export function createServer(service = notificationService, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "notification-service",
    port,
    host
  });
}

const server = createServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[notification-service] Listening on http://${host}:${port}`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
