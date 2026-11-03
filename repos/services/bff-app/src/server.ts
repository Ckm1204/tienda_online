import http from "node:http";
import { BffApp } from "./app.js";
import type { HttpRequest } from "./types.js";

const PORT = parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || "0.0.0.0";

const app = new BffApp();

export function createHttpServer(bffApp = app) {
  const server = http.createServer(async (req, res) => {
    const method = (req.method || "GET").toUpperCase() as HttpRequest["method"];
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const path = url.pathname;
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
    const origin = req.headers.origin as string | undefined;

    const headers: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers[key.toLowerCase()] = value;
      } else if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(", ");
      }
    }

    const chunks: Buffer[] = [];
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    req.on("end", async () => {
      try {
        const rawBody = Buffer.concat(chunks);
        let body: unknown = undefined;

        if (rawBody.length > 0) {
          const contentType = headers["content-type"] || "";
          const contentEncoding = headers["content-encoding"] || "";
          if (contentEncoding.includes("gzip") || contentType.includes("application/octet-stream")) {
            body = rawBody;
          } else if (contentType.includes("application/json")) {
            try {
              body = JSON.parse(rawBody.toString("utf-8"));
            } catch {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "INVALID_JSON_BODY" }));
              return;
            }
          } else {
            body = rawBody.toString("utf-8");
          }
        }

        const request: HttpRequest = {
          method,
          path,
          ip,
          origin,
          headers,
          body,
          rawBodySizeBytes: rawBody.length
        };

        const response = await bffApp.handleRequest(request);

        for (const [hKey, hVal] of Object.entries(response.headers)) {
          res.setHeader(hKey, String(hVal));
        }

        res.statusCode = response.status;

        if (response.body === undefined || response.body === null) {
          res.end();
        } else if (typeof response.body === "string" || Buffer.isBuffer(response.body)) {
          res.end(response.body);
        } else {
          if (!res.getHeader("Content-Type")) {
            res.setHeader("Content-Type", "application/json");
          }
          res.end(JSON.stringify(response.body));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "INTERNAL_ERROR", detail: message }));
      }
    });
  });

  return server;
}

const server = createHttpServer(app);

export function startServer(port = PORT, host = HOST) {
  server.listen(port, host, () => {
    console.log(`[bff-app] Server listening on http://${host}:${port}`);
  });

  process.on("SIGTERM", () => {
    console.log("[bff-app] Received SIGTERM, initiating graceful shutdown...");
    app.isShuttingDown = true;
    server.close(() => {
      console.log("[bff-app] Server closed cleanly.");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    console.log("[bff-app] Received SIGINT, initiating graceful shutdown...");
    app.isShuttingDown = true;
    server.close(() => {
      console.log("[bff-app] Server closed cleanly.");
      process.exit(0);
    });
  });

  return server;
}

const isDirectRun = Boolean(
  process.argv[1]?.includes("server") && process.env.NODE_ENV !== "test"
);

if (isDirectRun) {
  startServer();
}

export { server, app };
