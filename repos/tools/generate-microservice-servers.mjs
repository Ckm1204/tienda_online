import fs from "node:fs";
import path from "node:path";

const services = [
  { name: "tenant-service", className: "TenantService", instanceName: "tenantService", port: 3001 },
  { name: "identity-service", className: "IdentityService", instanceName: "identityService", port: 3002 },
  { name: "device-service", className: "DeviceService", instanceName: "deviceService", port: 3003 },
  { name: "catalog-service", className: "CatalogService", instanceName: "catalogService", port: 3004 },
  { name: "sales-service", className: "SalesService", instanceName: "salesService", port: 3005 },
  { name: "cash-service", className: "CashService", instanceName: "cashService", port: 3007 },
  { name: "inventory-service", className: "InventoryService", instanceName: "inventoryService", port: 3008 },
  { name: "customer-service", className: "CustomerService", instanceName: "customerService", port: 3009 },
  { name: "reporting-service", className: "ReportingService", instanceName: "reportingService", port: 3010 },
  { name: "audit-service", className: "AuditService", instanceName: "auditService", port: 3011 },
  { name: "notification-service", className: "NotificationService", instanceName: "notificationService", port: 3013 }
];

for (const s of services) {
  const dir = path.join("repos", "services", s.name);
  const srcDir = path.join(dir, "src");
  const serverPath = path.join(srcDir, "server.ts");
  const dockerfilePath = path.join(dir, "Dockerfile");

  const serverContent = `import http from "node:http";
import { createServiceServer } from "@tiendita/service-kit";
import { ${s.className} } from "./index.js";

const PORT = parseInt(process.env.PORT || "${s.port}", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const ${s.instanceName} = new ${s.className}();

export function createServer(service = ${s.instanceName}, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "${s.name}",
    port,
    host
  });
}

const server = createServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(\`[${s.name}] Listening on http://\${host}:\${port}\`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
`;

  const dockerfileContent = `FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/${s.name} build
EXPOSE ${s.port}
ENV PORT=${s.port}
CMD ["node", "services/${s.name}/dist/server.js"]
`;

  fs.writeFileSync(serverPath, serverContent, "utf8");
  fs.writeFileSync(dockerfilePath, dockerfileContent, "utf8");
  console.log(`Created server.ts and Dockerfile for ${s.name}`);
}
