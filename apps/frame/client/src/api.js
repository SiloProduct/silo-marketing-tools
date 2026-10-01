import { taskNames } from "../../shared/task-variables.js";
export async function api(url, body, method = "POST") {
  const form = body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    method: body === undefined ? "GET" : method,
    headers:
      body === undefined
        ? {}
        : {
            "x-frame-request": "1",
            ...(!form ? { "Content-Type": "application/json" } : {}),
          },
    body: body === undefined ? undefined : form ? body : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
export const pretty = (s) => s.replaceAll("_", " ");
export const names = (prompt) => [
  ...new Set(
    [...prompt.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((m) => m[1]),
  ),
];
export const total = (t) =>
  taskNames(t).reduce(
    (n, name) =>
      n * (t.variables.find((v) => v.name === name)?.values.length || 0),
    1,
  );
export const resolved = (prompt, values) =>
  prompt.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (_, n) => values[n] || `{${n}}`,
  );
export const fmt = (n) => new Intl.NumberFormat().format(n);
export async function uploadFile(file, taskId) {
  let duration = "";
  if (file.type.startsWith("video/"))
    duration = await new Promise((resolve, reject) => {
      const el = document.createElement("video");
      const url = URL.createObjectURL(file);
      el.preload = "metadata";
      el.src = url;
      const cleanup = () => {
        URL.revokeObjectURL(url);
        el.removeAttribute("src");
      };
      el.onloadedmetadata = () => {
        const d = el.duration;
        cleanup();
        resolve(Number.isFinite(d) ? String(d) : "");
      };
      el.onerror = () => {
        cleanup();
        reject(new Error("This video could not be read. Try an MP4 file."));
      };
    });
  const form = new FormData();
  form.append("file", file);
  if (taskId) form.append("taskId", taskId);
  if (duration) form.append("duration", duration);
  return api("/assets/upload", form);
}
