import { defineConfig, type Plugin } from "vite";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Dev-only capture endpoint. The in-app preview browser can't screenshot a
// live WebGL canvas (the capture path hangs), so instead the page POSTs its
// own rendered pixels here and we drop them on disk for the tooling to read.
// Serve-only + a fixed path under .shots/ (gitignored) — never ships.
function shotSink(): Plugin {
  return {
    name: "shot-sink",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__shot", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end("POST only"); return; }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => {
          try {
            const dir = resolve(process.cwd(), ".shots");
            mkdirSync(dir, { recursive: true });
            writeFileSync(resolve(dir, "latest.png"), Buffer.concat(chunks));
            res.statusCode = 200; res.end("ok");
          } catch (e) {
            res.statusCode = 500; res.end(String(e));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [shotSink()],
  // Honour a harness/CI-assigned PORT; fall back to 5173 for local dev.
  server: { port: Number(process.env.PORT) || 5173, strictPort: false },
});
