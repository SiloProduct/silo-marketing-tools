import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { config } from "dotenv";
import { defaultDataDir } from "../server/store.js";

const appRoot = fs.realpathSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samePath = (left, right) => {
  try {
    return fs.realpathSync(left) === fs.realpathSync(right);
  } catch {
    return false;
  }
};
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
};

export async function manageService(
  action,
  {
    root = appRoot,
    dataDir = defaultDataDir(),
    port = Number(process.env.PORT) || 4310,
    serverScript = path.join(root, "server/index.js"),
  } = {},
) {
  if (!["start", "stop"].includes(action))
    throw new Error("Use service start or stop.");
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Frame port is invalid.");
  fs.mkdirSync(dataDir, { recursive: true });
  const dir = fs.realpathSync(dataDir);
  const rootPath = fs.realpathSync(root);
  const pidFile = path.join(dir, "service.pid");
  const url = `http://127.0.0.1:${port}`;
  const readPid = () => {
    if (!fs.existsSync(pidFile)) return null;
    const pid = Number(fs.readFileSync(pidFile, "utf8"));
    if (!Number.isSafeInteger(pid) || pid <= 0)
      throw new Error(
        "Frame service record is invalid; no process was interrupted.",
      );
    return pid;
  };
  const health = async () => {
    let response;
    try {
      response = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(1500),
        redirect: "error",
        headers: { Connection: "close" },
      });
    } catch (error) {
      if (error.cause?.code === "ECONNREFUSED") return null;
      throw new Error(
        "Cannot verify the local listener; no process was interrupted.",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {}
    if (
      !response.ok ||
      data?.service !== "frame" ||
      data.apiVersion !== 1 ||
      !Number.isSafeInteger(data.processId) ||
      data.processId <= 0 ||
      !samePath(data.appRoot, rootPath) ||
      !samePath(data.stateDir, dir)
    )
      throw new Error(
        "The port belongs to another service or Frame installation; no process was interrupted.",
      );
    return data;
  };
  let pid = readPid();
  const current = await health();
  if (pid && alive(pid)) {
    if (!current || current.processId !== pid)
      throw new Error(
        "Frame PID and listener do not match; no process was interrupted.",
      );
    if (action === "start") return `Frame is already running at ${url}`;
    // Recheck ownership immediately before sending the signal.
    const verified = await health();
    if (readPid() !== pid || verified?.processId !== pid)
      throw new Error(
        "Frame changed while checking its service; no process was interrupted.",
      );
    process.kill(pid, "SIGTERM");
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (!alive(pid)) {
        if (readPid() === pid) fs.unlinkSync(pidFile);
        return "Frame stopped. Progress is saved.";
      }
      try {
        await health();
      } catch (error) {
        // An owned process closing its connections can reset a health request.
        // Preserve the record while it is still alive; never signal again.
        if (!alive(pid)) {
          if (readPid() === pid) fs.unlinkSync(pidFile);
          return "Frame stopped. Progress is saved.";
        }
      }
      await delay(100);
    }
    throw new Error(
      "Frame did not stop within five seconds; its service record was preserved.",
    );
  }
  if (current)
    throw new Error(
      "Frame is listening without its matching service record; use its original terminal. No process was interrupted.",
    );
  // Remove a stale record only after establishing that its PID is dead.
  if (pid) {
    if (readPid() !== pid)
      throw new Error(
        "Frame service record changed; retry after inspecting it.",
      );
    fs.unlinkSync(pidFile);
  }
  if (action === "stop") return "Frame is not running as a background service.";
  if (!fs.existsSync(path.join(rootPath, "dist")))
    throw new Error("Run npm run build first.");
  const logPath = path.join(dir, "service.log");
  const log = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [serverScript], {
    cwd: rootPath,
    detached: true,
    stdio: ["ignore", log, log],
    env: { ...process.env, FRAME_DATA_DIR: dir, PORT: String(port) },
  });
  fs.closeSync(log);
  child.on("error", () => {});
  if (!Number.isSafeInteger(child.pid))
    throw new Error(`Frame could not start. See ${logPath}`);
  pid = child.pid;
  fs.writeFileSync(pidFile, String(pid));
  child.unref();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    await delay(100);
    const started = await health();
    if (started?.processId === pid)
      return `Frame is running in the background: ${url}`;
    if (!alive(pid)) break;
  }
  if (!alive(pid) && readPid() === pid) fs.unlinkSync(pidFile);
  throw new Error(
    `Frame could not start. See ${logPath}. Any live service record was preserved.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  config({ path: path.join(appRoot, ".env"), quiet: true });
  try {
    console.log(await manageService(process.argv[2]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
