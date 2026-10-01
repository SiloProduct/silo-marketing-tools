import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import { Store } from "./store.js";
import { GeminiProvider } from "./provider.js";
import { Worker } from "./worker.js";
import { createApp } from "./app.js";

const store = new Store(),
  provider = new GeminiProvider(),
  worker = new Worker(store, provider);
const app = createApp(store, worker, provider);
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const dist = path.resolve("dist");
  if (!fs.existsSync(dist))
    throw new Error("Run npm run build before starting Frame.");
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) =>
    res.sendFile(path.join(dist, "index.html")),
  );
}
const port = Number(process.env.PORT) || 4310;
const server = app.listen(port, "127.0.0.1", () => {
  worker.start();
  console.log(`Frame is ready at http://127.0.0.1:${port}`);
});
server.on("error", (e) => {
  console.error(
    e.code === "EADDRINUSE"
      ? "Frame is already running on this port."
      : e.message,
  );
  process.exit(1);
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    worker.stop();
    server.close();
    setTimeout(() => process.exit(0), 100).unref();
  });
