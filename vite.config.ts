import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  // Honour a harness/CI-assigned PORT; fall back to 5173 for local dev.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
});
