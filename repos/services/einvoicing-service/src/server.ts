import http from "node:http";
import { createServiceServer } from "@tiendita/service-kit";
import { EinvoicingService } from "./index.js";

const PORT = parseInt(process.env.PORT || "3012", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const einvoicingService = new EinvoicingService();

export function createEinvoicingServer(service = einvoicingService, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "einvoicing-service",
    port,
    host,
    handleRequest: async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const method = (req.method || "GET").toUpperCase();

      if (method === "POST" && url.pathname === "/v1/dian/generate-cude") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        const cude = service.fiscalEngine.calculateCude(body);
        const qrUrl = service.fiscalEngine.generateDianQrUrl(cude);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ cude, qrUrl }));
        return true;
      }

      if (method === "POST" && url.pathname === "/v1/dian/build-invoice-xml") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        const xml = service.ubl.buildUblXml(body);
        const validation = service.ubl.validateUblStructure(xml);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ xml, validation }));
        return true;
      }

      if (method === "POST" && url.pathname === "/v1/dian/check-uvt") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));

        const result = service.fiscalEngine.checkUvtThreshold(body.totalCents, {
          uvtValueCents: body.uvtValueCents,
          customerRequestedInvoice: body.customerRequestedInvoice
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return true;
      }

      if (method === "GET" && url.pathname === "/v1/dian/monitoring-summary") {
        const summary = service.contingencyWorm.getSuperAdminMonitoringSummary();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(summary));
        return true;
      }

      return false;
    }
  });
}

const server = createEinvoicingServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[einvoicing-service] Listening on http://${host}:${port}`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
