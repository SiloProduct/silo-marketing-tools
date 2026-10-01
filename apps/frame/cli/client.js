import fs from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

export class CliError extends Error {
  constructor(code, message, exitCode = 1, details) {
    super(message);
    Object.assign(this, { code, exitCode, details });
  }
}
export const usage = (message) => {
  throw new CliError("INVALID_INPUT", message, 2);
};
export function baseUrl(options, root, configuredOnly = false) {
  const env = fs.existsSync(path.join(root, ".env"))
    ? parse(fs.readFileSync(path.join(root, ".env")))
    : {};
  const raw =
    (!configuredOnly && (options.url || process.env.FRAME_URL)) ||
    `http://127.0.0.1:${process.env.PORT || env.PORT || 4310}`;
  let url;
  try {
    url = new URL(raw);
  } catch {
    usage("Use a valid local service URL, e.g. http://127.0.0.1:4310.");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  )
    usage(
      "Frame CLI only connects to a local HTTP service. Remote hosts, credentials and URL paths are not supported.",
    );
  // The service binds IPv4; localhost should not unexpectedly resolve to ::1.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.origin;
}
export class Client {
  constructor(url, timeout = 240) {
    this.url = url;
    this.timeout = timeout;
  }
  async request(route, body, method = body === undefined ? "GET" : "POST") {
    const form = body instanceof FormData;
    let response;
    try {
      response = await fetch(`${this.url}/api${route}`, {
        method,
        redirect: "error",
        signal: AbortSignal.timeout(this.timeout * 1000),
        headers: {
          "x-frame-request": "1",
          ...(body !== undefined && !form
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body:
          body === undefined ? undefined : form ? body : JSON.stringify(body),
      });
    } catch (error) {
      const unavailable = ["ECONNREFUSED", "ENOTFOUND"].includes(
        error.cause?.code,
      );
      throw new CliError(
        unavailable
          ? "SERVICE_UNAVAILABLE"
          : method === "GET"
            ? "REQUEST_FAILED"
            : "OUTCOME_UNKNOWN",
        unavailable
          ? `Frame is not reachable at ${this.url}. Run the local launcher or frame service start.`
          : method === "GET"
            ? "Could not read the service response. Check Frame and try again."
            : "The request response was interrupted. Check task/job state before resubmitting; the operation may have been accepted.",
      );
    }
    let data;
    try {
      data = await response.json();
    } catch {
      throw new CliError(
        method === "GET" ? "NOT_FRAME" : "OUTCOME_UNKNOWN",
        method === "GET"
          ? "The local address did not return Frame JSON. Check the service and port."
          : "The service did not return a usable response. Inspect task/job state before resubmitting; the operation may have been accepted.",
      );
    }
    if (!response.ok)
      throw new CliError(
        response.status === 409 ? "CONFLICT" : "API_ERROR",
        data.error || "The request failed.",
        response.status === 409 ? 3 : 1,
        { status: response.status },
      );
    return data;
  }
  async health() {
    const data = await this.request("/health");
    if (data.service !== "frame" || data.apiVersion !== 1)
      throw new CliError(
        "SERVICE_VERSION",
        "This service does not support Frame CLI API v1. Update and restart the local Frame app.",
      );
    return { ...data, url: this.url };
  }
  asset(asset) {
    return asset
      ? {
          ...asset,
          mediaUrl: new URL(
            asset.url || `/api/assets/${asset.id}/file`,
            this.url,
          ).href,
        }
      : null;
  }
  task(task) {
    return {
      ...task,
      uiUrl: this.link(task.id, task.section || "references"),
      resultsUrl: this.link(task.id, "results"),
    };
  }
  job(job) {
    return {
      ...job,
      ...(job.asset ? { asset: this.asset(job.asset) } : {}),
      ...(job.taskId ? { uiUrl: this.link(job.taskId, "results") } : {}),
    };
  }
  link(id, section) {
    return `${this.url}/#task/${encodeURIComponent(id)}/${section}`;
  }
}
export function integer(value, fallback, min, max, name) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max)
    usage(`${name} must be a whole number from ${min} to ${max}.`);
  return n;
}
export async function jsonInput(file, stdin = process.stdin) {
  if (!file)
    usage(
      "Supply a UTF-8 JSON file with --file (or --values), or use - for stdin.",
    );
  let raw;
  try {
    if (file === "-") {
      raw = "";
      stdin.setEncoding?.("utf8");
      for await (const chunk of stdin) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 2 * 1024 * 1024)
          usage("JSON input must be at most 2 MiB.");
      }
    } else {
      if (fs.statSync(file).size > 2 * 1024 * 1024)
        usage("JSON input must be at most 2 MiB.");
      raw = fs.readFileSync(file, "utf8");
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    usage(
      "Could not read the JSON input file. Check its path and permissions.",
    );
  }
  let data;
  try {
    data = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    usage(
      "Input must be valid UTF-8 JSON. Use a JSON file or stdin rather than shell-escaped prompt text.",
    );
  }
  if (!data || typeof data !== "object" || Array.isArray(data))
    usage("JSON input must be an object.");
  return data;
}
