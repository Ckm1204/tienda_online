import http from "node:http";
import zlib from "node:zlib";
import { createServiceServer } from "@tiendita/service-kit";
import { CloudSyncService } from "./index.js";

const PORT = parseInt(process.env.PORT || "3006", 10);
const HOST = process.env.HOST || "0.0.0.0";

export const syncService = new CloudSyncService();

export function createSyncServer(service = syncService, port = PORT, host = HOST): http.Server {
  return createServiceServer({
    serviceName: "sync-service",
    port,
    host,
    handleRequest: async (req, res) => {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const method = (req.method || "GET").toUpperCase();

      if (method === "POST" && url.pathname === "/v1/sync/push") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        let bodyBuffer = Buffer.concat(chunks);

        const contentEncoding = (req.headers["content-encoding"] || "").toLowerCase();
        let gzipBuffer: Buffer;
        if (contentEncoding.includes("gzip")) {
          gzipBuffer = bodyBuffer;
        } else {
          gzipBuffer = zlib.gzipSync(bodyBuffer);
        }

        const tenantId = (req.headers["x-tenant-id"] as string) || url.searchParams.get("tenant_id") || "";
        const branchId = (req.headers["x-branch-id"] as string) || url.searchParams.get("branch_id") || "";
        const terminalId = (req.headers["x-terminal-id"] as string) || url.searchParams.get("terminal_id") || "";
        const appVersion = (req.headers["x-app-version"] as string) || "1.2.0";
        const batchSignature = (req.headers["x-batch-signature"] as string) || "valid-sig";

        if (!tenantId || !branchId || !terminalId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MISSING_HEADERS", detail: "x-tenant-id, x-branch-id, x-terminal-id required" }));
          return true;
        }

        try {
          const result = service.handlePushGzipBatch({
            tenantId,
            branchId,
            terminalId,
            appVersion,
            gzipBody: gzipBuffer,
            batchSignature
          });

          res.writeHead(result.httpStatus, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Sync Push Error";
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "SYNC_PUSH_FAILED", detail: message }));
          return true;
        }
      }

      if (method === "GET" && url.pathname === "/v1/sync/pull") {
        const tenantId = (req.headers["x-tenant-id"] as string) || url.searchParams.get("tenant_id") || "";
        const branchId = (req.headers["x-branch-id"] as string) || url.searchParams.get("branch_id") || "";
        const stream = url.searchParams.get("stream") || "products";
        const cursorXidStr = url.searchParams.get("cursor_xid") || url.searchParams.get("after_xid") || "0";

        if (!tenantId || !branchId) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "MISSING_REQUIRED_PARAMS", detail: "tenant_id and branch_id are required" }));
          return true;
        }

        try {
          const result = service.handlePullDownstream({
            tenantId,
            branchId,
            stream,
            cursorXid: BigInt(cursorXidStr)
          });

          const jsonStr = JSON.stringify(result, (_, v) => (typeof v === "bigint" ? v.toString() : v));
          res.writeHead(result.httpStatus, { "Content-Type": "application/json" });
          res.end(jsonStr);
          return true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Sync Pull Error";
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "SYNC_PULL_FAILED", detail: message }));
          return true;
        }
      }

      if (method === "POST" && (url.pathname === "/v1/sync/heartbeat" || url.pathname === "/v1/terminals/heartbeat")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const rawBody = Buffer.concat(chunks);

        let parsed: {
          tenant_id?: string;
          branch_id?: string;
          terminal_id?: string;
          local_time_ms?: number;
          pending_outbox_count?: number;
          oldest_pending_at_ms?: number | null;
        } = {};

        try {
          if (rawBody.length > 0) {
            parsed = JSON.parse(rawBody.toString("utf8"));
          }
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "INVALID_JSON_BODY" }));
          return true;
        }

        const tenantId = parsed.tenant_id || (req.headers["x-tenant-id"] as string) || "";
        const branchId = parsed.branch_id || (req.headers["x-branch-id"] as string) || "";
        const terminalId = parsed.terminal_id || (req.headers["x-terminal-id"] as string) || "";

        try {
          const result = service.handleHeartbeat({
            tenantId,
            branchId,
            terminalId,
            localTimeMs: parsed.local_time_ms ?? Date.now(),
            pendingOutboxCount: parsed.pending_outbox_count ?? 0,
            oldestPendingAtMs: parsed.oldest_pending_at_ms ?? null
          });

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return true;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Sync Heartbeat Error";
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "HEARTBEAT_FAILED", detail: message }));
          return true;
        }
      }

      return false;
    }
  });
}

const server = createSyncServer();

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[sync-service] Listening on http://${host}:${port}`);
  });
}

const isMain = process.argv[1]?.endsWith("server.js") || process.argv[1]?.endsWith("server.ts");
if (isMain) {
  startServer();
}
