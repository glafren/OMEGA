import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({ test: { environment: "node", exclude: ["**/node_modules/**", "**/.next/**"] }, resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } } });
