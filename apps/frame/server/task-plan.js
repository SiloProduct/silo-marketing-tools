import fs from "node:fs";
import { countCombinations, validateTask } from "./domain.js";
import {
  taskNames,
  variableStage,
  activeImageRecipes,
  promptNames,
} from "../shared/task-variables.js";
import { frameStats } from "./frames.js";

// The agent and UI share the same task, validation, and combination semantics.
// Planning inspects saved work; it never submits a request or writes a draft.
export function taskPlan(task, store) {
  const assets = store.list("assets");
  const issues = validateTask(task, assets);
  for (const reference of task.references) {
    const asset = assets.find((a) => a.id === reference.assetId);
    if (asset && !fs.existsSync(asset.file))
      issues.push(
        `${asset.name}: the local reference file is missing. Restore it or import it again.`,
      );
  }
  try {
    fs.accessSync(task.folder, fs.constants.W_OK);
  } catch {
    issues.push(
      "The task folder is unavailable or not writable. Restore the folder or its storage location.",
    );
  }
  const combinations = countCombinations(task);
  const videos = combinations * task.takes;
  if (!Number.isSafeInteger(videos))
    issues.push(
      "This configuration creates too many combinations to count reliably. Reduce the lists or takes before production.",
    );
  const names = taskNames(task);
  const completedSlots = new Set(
    store
      .list("jobs")
      .filter(
        (j) =>
          j.taskId === task.id &&
          j.kind === "production" &&
          j.status === "completed" &&
          j.take <= task.takes &&
          Object.keys(j.snapshot.values).length === names.length &&
          names.every((name) =>
            task.variables
              .find((v) => v.name === name)
              ?.values.includes(j.snapshot.values[name]),
          ),
      )
      .map((j) => `${j.key}:${j.take}`),
  );
  const frames = frameStats(task, store);
  return {
    taskId: task.id,
    revision: task.revision,
    status: task.status,
    valid: issues.length === 0,
    issues: [...new Set(issues)],
    variables: names.map((name) => ({
      name,
      stage: variableStage(task, name),
      values: task.variables.find((v) => v.name === name)?.values.length || 0,
    })),
    counts: {
      combinations,
      takesPerCombination: task.takes,
      initialVideos: videos,
      completedCombinationTakes: completedSlots.size,
      unfinishedVideos: Math.max(0, videos - completedSlots.size),
      referenceImages: frames?.total || 0,
      reusableImages: frames?.ready || 0,
      missingImages: Math.max(0, (frames?.total || 0) - (frames?.ready || 0)),
    },
    imageVariations: activeImageRecipes(task).map((c) => ({
      sourceAssetId: c.sourceAssetId,
      role: task.references.find((r) => r.assetId === c.sourceAssetId)?.role,
      variables: promptNames(c.prompt),
    })),
    production: {
      mode: task.mode,
      videoLimit: task.limit,
      countScope:
        "Initial configured combinations. Continuous mode can add more; its limit counts videos per run. Images are generated only as needed.",
    },
    samplesCountTowardProduction: false,
  };
}
