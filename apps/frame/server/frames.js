import fs from "node:fs";
import { createHash } from "node:crypto";
import { resolvePrompt } from "./domain.js";
import {
  frameEnabled,
  frameCount,
  activeImageRecipes,
  promptNames,
} from "../shared/task-variables.js";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const hashes = new Map();
function sourceHash(asset) {
  if (!asset || !fs.existsSync(asset.file))
    throw new Error(
      "The original reference image is missing. Restore it or choose another image in References.",
    );
  const stat = fs.statSync(asset.file),
    signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  if (hashes.get(asset.file)?.signature !== signature) {
    if (hashes.size > 200) hashes.clear();
    hashes.set(asset.file, {
      signature,
      hash: digest(fs.readFileSync(asset.file)),
    });
  }
  return hashes.get(asset.file).hash;
}
export function frameRecipe(
  task,
  values,
  store,
  config = activeImageRecipes(task)[0],
) {
  const source = store.get("assets", config.sourceAssetId);
  const sourceDigest = sourceHash(source);
  const selected = Object.fromEntries(
    promptNames(config.prompt).map((name) => [name, values[name]]),
  );
  const prompt = resolvePrompt(config.prompt, selected);
  const settings = {
    model: config.settings.model,
    aspectRatio: config.settings.aspectRatio,
    imageSize: config.settings.imageSize,
  };
  const key = digest(
    JSON.stringify({ source: source.id, sourceDigest, prompt, settings }),
  );
  return {
    key,
    snapshot: {
      prompt,
      template: config.prompt,
      values: selected,
      settings,
      references: [{ assetId: source.id, role: "Asset to refine" }],
      parentId: source.id,
      sourceDigest,
      frameKey: key,
      revision: task.revision,
    },
  };
}
export function matchingFrame(store, taskId, key) {
  const matches = store
    .list("jobs")
    .filter(
      (j) =>
        j.taskId === taskId &&
        j.kind === "frame" &&
        j.key === key &&
        j.status !== "cancelled",
    );
  // A successful replacement supersedes an older frame. A failed replacement
  // never invalidates a previously usable image.
  return (
    matches
      .filter((j) =>
        [
          "pending",
          "submitting",
          "submitted",
          "downloading",
          "uncertain",
        ].includes(j.status),
      )
      .at(-1) ||
    matches.filter((j) => j.status === "completed").at(-1) ||
    matches.at(-1)
  );
}
export function frameStats(task, store) {
  if (!frameEnabled(task)) return null;
  const ready = new Set();
  for (const job of store
    .list("jobs")
    .filter(
      (j) =>
        j.taskId === task.id && j.kind === "frame" && j.status === "completed",
    )) {
    const config = activeImageRecipes(task).find(
      (c) => c.sourceAssetId === job.snapshot.parentId,
    );
    if (!config) continue;
    if (
      !promptNames(config.prompt).every((name) =>
        task.variables
          .find((v) => v.name === name)
          ?.values.includes(job.snapshot.values[name]),
      )
    )
      continue;
    try {
      if (
        frameRecipe(task, job.snapshot.values, store, config).key === job.key &&
        fs.existsSync(store.get("assets", job.assetId)?.file || "")
      )
        ready.add(job.key);
    } catch {
      /* Missing sources are reported by generation validation. */
    }
  }
  return { total: frameCount(task), ready: ready.size };
}
