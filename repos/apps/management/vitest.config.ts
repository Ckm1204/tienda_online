import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "react-native": "react-native-web" } },
  test: {
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]]
  }
});