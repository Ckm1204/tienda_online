import fs from "node:fs";
import path from "node:path";

/**
 * HU-015: Generador de microservicio (`pnpm gen:service <nombre>`) conectado a `@tiendita/service-kit`.
 */
export function generateServiceSkeleton(repoRoot: string, serviceName: string): string {
  if (!/^[a-z][a-z0-9-]*-service$/.test(serviceName)) {
    throw new Error(`Invalid service name '${serviceName}'. Expected '<name>-service'.`);
  }

  const serviceDir = path.join(repoRoot, "services", serviceName);
  const srcDir = path.join(serviceDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  const pkgJson = {
    name: `@tiendita/${serviceName}`,
    version: "0.1.0",
    private: true,
    type: "module",
    main: "./dist/index.js",
    types: "./dist/index.d.ts",
    scripts: {
      build: "tsc -p tsconfig.json",
      test: "vitest run",
      lint: "tsc --noEmit"
    },
    dependencies: {
      "@tiendita/config": "workspace:*",
      "@tiendita/contracts": "workspace:*",
      "@tiendita/service-kit": "workspace:*",
      zod: "^3.24.1"
    },
    devDependencies: {
      "@types/node": "^22.10.0",
      typescript: "^5.7.2",
      vitest: "^2.1.8"
    }
  };

  fs.writeFileSync(path.join(serviceDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n", "utf8");
  fs.writeFileSync(
    path.join(serviceDir, "tsconfig.json"),
    JSON.stringify(
      {
        extends: "../../tsconfig.base.json",
        compilerOptions: { outDir: "./dist", rootDir: "./src" },
        include: ["src/**/*"]
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  fs.writeFileSync(
    path.join(serviceDir, "Dockerfile"),
    `FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "dist/index.js"]\n`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(srcDir, "index.ts"),
    `import { ServiceLifecycleManager, OutboxStore, InboxConsumerRunner } from "@tiendita/service-kit";\n\nexport const serviceName = "${serviceName}";\nexport const lifecycle = new ServiceLifecycleManager();\nexport const outbox = new OutboxStore();\nexport const inbox = new InboxConsumerRunner();\n`,
    "utf8"
  );

  return serviceDir;
}
