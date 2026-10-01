import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

export function resolveRuntime(root, fallback = process.execPath) {
  const file = path.join(root, ".frame-runtime.json");
  let runtime = fallback;
  if (fs.existsSync(file)) {
    try {
      const value = JSON.parse(fs.readFileSync(file, "utf8"));
      if (
        typeof value.nodePath !== "string" ||
        !path.isAbsolute(value.nodePath)
      )
        throw new Error();
      runtime = value.nodePath;
    } catch {
      throw new Error(
        "Frame runtime configuration is invalid. Ask your agent to configure its Node runtime again.",
      );
    }
  }
  let version;
  try {
    version = execFileSync(runtime, ["-p", "process.versions.node"], {
      encoding: "utf8",
    }).trim();
  } catch {
    throw new Error(
      "Frame's configured Node runtime is unavailable. Ask your agent to configure Node 22.13 or newer.",
    );
  }
  const [major, minor] = version.split(".").map(Number);
  if (!Number.isInteger(major) || major < 22 || (major === 22 && minor < 13))
    throw new Error(
      "Frame requires Node 22.13 or newer. Ask your agent to configure the installed runtime.",
    );
  return runtime;
}

export function launch(root, { open = true } = {}) {
  const runtime = resolveRuntime(root);
  let result;
  try {
    result = JSON.parse(
      execFileSync(
        runtime,
        [path.join(root, "scripts/frame.js"), "service", "start"],
        {
          cwd: root,
          encoding: "utf8",
          timeout: 35000,
          stdio: ["ignore", "pipe", "pipe"],
        },
      ),
    );
  } catch (error) {
    let message =
      "Frame could not start. Ask your agent to inspect the local service.";
    try {
      message = JSON.parse(String(error.stderr)).error.message;
    } catch {}
    throw new Error(message);
  }
  if (!result.ok || result.data?.service !== "frame")
    throw new Error("Frame did not return a verified startup result.");
  const url = new URL(result.data.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1")
    throw new Error("Frame returned an unexpected local address.");
  if (open) {
    const command =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
          ? "rundll32.exe"
          : "xdg-open";
    const args =
      process.platform === "win32"
        ? ["url.dll,FileProtocolHandler", url.href]
        : [url.href];
    const child = spawn(command, args, { detached: true, stdio: "ignore" });
    child.on("error", () =>
      console.error(`Open Frame in your browser: ${url.href}`),
    );
    child.unref();
  }
  console.log(`Frame: ${url.origin}`);
  return result.data;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = fs.realpathSync(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
  try {
    launch(root, { open: !process.argv.includes("--no-open") });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
