import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Worker } from "../server/worker.js";
import { createApp } from "../server/app.js";
// Isolated state, no credentials, no external generation requests.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-browser-"));
const store = new Store(dir),
  provider = { key: null },
  worker = new Worker(store, provider),
  app = createApp(store, worker, provider);
app.use(express.static(path.resolve(process.env.FRAME_TEST_DIST || "dist")));
app.get("/{*path}", (req, res) =>
  res.sendFile(
    path.resolve(process.env.FRAME_TEST_DIST || "dist", "index.html"),
  ),
);
const server = app.listen(4311, "127.0.0.1");
process.on("SIGTERM", () => {
  server.close();
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
});
