import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { uid, now } from "./domain.js";

export function defaultDataDir() {
  return (
    process.env.FRAME_DATA_DIR ||
    (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || os.homedir(), "Frame")
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Application Support", "Frame")
        : path.join(os.homedir(), ".local", "share", "frame"))
  );
}
export const slug = (name) =>
  name
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9 -]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 70) || "Untitled";
export function atomicWrite(file, content) {
  const temp = `${file}.${uid()}.tmp`;
  try {
    fs.writeFileSync(temp, content);
    fs.renameSync(temp, file);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
export class Store {
  constructor(dir = defaultDataDir()) {
    this.dir = path.resolve(dir);
    fs.mkdirSync(this.dir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.dir, "frame.sqlite"));
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS records (bucket TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(bucket,id));",
    );
    if (!this.get("config", "settings"))
      this.put("config", {
        id: "settings",
        outputDir: process.env.FRAME_OUTPUT_DIR || path.join(this.dir, "Media"),
      });
  }
  get(bucket, id) {
    const row = this.db
      .prepare("SELECT body FROM records WHERE bucket=? AND id=?")
      .get(bucket, id);
    return row ? JSON.parse(row.body) : null;
  }
  list(bucket) {
    return this.db
      .prepare("SELECT body FROM records WHERE bucket=? ORDER BY rowid")
      .all(bucket)
      .map((r) => JSON.parse(r.body));
  }
  put(bucket, value) {
    this.db
      .prepare(
        "INSERT INTO records (bucket,id,body) VALUES (?,?,?) ON CONFLICT(bucket,id) DO UPDATE SET body=excluded.body",
      )
      .run(bucket, value.id, JSON.stringify(value));
    return value;
  }
  remove(bucket, id) {
    this.db
      .prepare("DELETE FROM records WHERE bucket=? AND id=?")
      .run(bucket, id);
  }
  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  createTask(task) {
    task.folder = path.join(
      this.get("config", "settings").outputDir,
      `${slug(task.name)}-${task.id.slice(0, 8)}`,
    );
    for (const sub of ["references", "samples", "production"])
      fs.mkdirSync(path.join(task.folder, sub), { recursive: true });
    this.put("tasks", task);
    this.manifest(task.id);
    return task;
  }
  manifest(taskId) {
    const task = this.get("tasks", taskId);
    if (!task) return;
    atomicWrite(
      path.join(task.folder, "task-manifest.json"),
      JSON.stringify(
        {
          formatVersion: 1,
          task,
          runs: this.list("runs").filter((r) => r.taskId === taskId),
          assets: this.list("assets").filter((a) => a.taskId === taskId),
          generations: this.list("jobs").filter((j) => j.taskId === taskId),
        },
        null,
        2,
      ),
    );
  }
  addAsset({
    taskId = null,
    name,
    mime,
    bytes,
    duration = null,
    metadata = {},
    parentId = null,
    interactionId = null,
    kind = "reference",
    runId = null,
    id = uid(),
  }) {
    const task = taskId ? this.get("tasks", taskId) : null;
    const run = runId ? this.get("runs", runId) : null;
    const base = task
      ? path.join(
          task.folder,
          kind === "frame"
            ? "references/generated"
            : kind === "sample"
              ? "samples"
              : kind === "production"
                ? `production/run-${String(run?.number || 1).padStart(3, "0")}`
                : "references",
        )
      : path.join(this.get("config", "settings").outputDir, "Reference studio");
    fs.mkdirSync(base, { recursive: true });
    const ext = {
      "image/png": ".png",
      "image/jpeg": ".jpg",
      "image/webp": ".webp",
      "video/mp4": ".mp4",
      "video/webm": ".webm",
    }[mime];
    if (!ext) throw new Error("Use PNG, JPEG, WebP, MP4 or WebM media.");
    const file = path.join(base, `${slug(name)}-${id.slice(0, 8)}${ext}`);
    atomicWrite(file, bytes);
    const asset = {
      id,
      taskId,
      name,
      mime,
      file,
      kind,
      runId,
      duration,
      parentId,
      interactionId,
      metadata,
      createdAt: now(),
      size: bytes.length,
    };
    atomicWrite(`${file}.json`, JSON.stringify(asset, null, 2));
    this.put("assets", asset);
    if (taskId) this.manifest(taskId);
    return asset;
  }
  close() {
    this.db.close();
  }
}
