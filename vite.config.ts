import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [preact()],
  base: "./",
  build: {
    outDir: "../docs/akakari-query-builder",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
