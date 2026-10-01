import { createHash, randomUUID } from "node:crypto";
import {
  taskNames,
  frameEnabled,
  frameNames,
  imageRecipes,
  activeImageRecipes,
  promptNames,
} from "../shared/task-variables.js";

export const uid = () => randomUUID();
export const now = () => new Date().toISOString();
export const normalize = (s) =>
  String(s).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
export const unique = (values) =>
  [
    ...new Map(values.map((v) => [normalize(v), String(v).trim()])).values(),
  ].filter(Boolean);
export const placeholders = (prompt) => [
  ...new Set(
    [...String(prompt).matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map(
      (m) => m[1],
    ),
  ),
];
export function resolvePrompt(prompt, values) {
  return prompt.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (_, name) => values[name] ?? `{${name}}`,
  );
}
export const combinationKey = (values) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        Object.entries(values).sort(([a], [b]) => a.localeCompare(b)),
      ),
    )
    .digest("hex");
export function countCombinations(task) {
  if (!task.prompt.trim()) return 0;
  return taskNames(task).reduce(
    (n, name) =>
      n * (task.variables.find((v) => v.name === name)?.values.length || 0),
    1,
  );
}
export function* combinations(task, index = 0, values = {}) {
  const names = taskNames(task);
  if (index === names.length) {
    yield values;
    return;
  }
  const name = names[index];
  for (const value of task.variables.find((v) => v.name === name)?.values || [])
    yield* combinations(task, index + 1, { ...values, [name]: value });
}
export const VIDEO_MODEL = "gemini-omni-1.1-flash";
export const TEXT_MODEL = "gemini-3.8-flash";
export const IMAGE_MODELS = ["gemini-3.1-flash-image", "gemini-3-pro-image"];
export const ROLES = [
  "Subject appearance",
  "Visual style",
  "Composition",
  "Starting frame",
  "Ending frame",
  "Video to edit",
  "Video to extend",
];
export function newTask(name = "Untitled task") {
  return {
    id: uid(),
    name,
    prompt: "",
    variables: [],
    references: [],
    startingFrame: null,
    versions: [],
    revision: 1,
    mode: "batch",
    takes: 4,
    limit: null,
    status: "draft",
    error: null,
    runId: null,
    expansion: 0,
    section: "references",
    createdAt: now(),
    updatedAt: now(),
    settings: {
      model: VIDEO_MODEL,
      aspectRatio: "16:9",
      resolution: "720p",
      task: "auto",
    },
    history: {},
  };
}
export function validateTask(task, assets = [], { sample = false } = {}) {
  const errors = [];
  if (!task.prompt.trim()) errors.push("Write a video prompt first.");
  for (const name of taskNames(task))
    if (!task.variables.find((v) => v.name === name)?.values.length)
      errors.push(`Add at least one value for ${name.replaceAll("_", " ")}.`);
  if (!Number.isInteger(task.takes) || task.takes < 1 || task.takes > 20)
    errors.push("Choose between 1 and 20 takes.");
  if (task.settings.model !== VIDEO_MODEL)
    errors.push("Choose a supported video model.");
  if (!["16:9", "9:16"].includes(task.settings.aspectRatio))
    errors.push("Choose landscape or portrait video.");
  if (!["360p", "720p", "1080p", "4k"].includes(task.settings.resolution))
    errors.push("Choose a supported resolution.");
  if (
    ![
      "auto",
      "text_to_video",
      "image_to_video",
      "reference_to_video",
      "edit",
      "extend",
    ].includes(task.settings.task)
  )
    errors.push("Choose a supported generation mode.");
  if (
    !sample &&
    task.mode === "continuous" &&
    !task.variables.some((v) => v.expand && taskNames(task).includes(v.name))
  )
    errors.push("Turn on continuous ideas for at least one variable.");
  if (task.limit !== null && (!Number.isInteger(task.limit) || task.limit < 1))
    errors.push("The optional video limit must be a positive whole number.");
  if (frameEnabled(task)) errors.push(...validateFrame(task, assets));
  const refs = task.references.map((r) => ({
    ...r,
    asset: assets.find((a) => a.id === r.assetId),
  }));
  if (refs.some((r) => !r.asset))
    errors.push("A reference is missing. Remove it or import it again.");
  const video = refs.filter((r) => r.asset?.mime.startsWith("video/"));
  const source = video.filter((r) =>
    ["Video to edit", "Video to extend"].includes(r.role),
  );
  const likeness = video.filter((r) => !source.includes(r));
  if (source.length > 1 || (source.length && likeness.length))
    errors.push(
      "Use one source video for editing or extension, without other video references.",
    );
  if (likeness.length > 3) errors.push("Use at most three video references.");
  for (const r of video) {
    const max = source.includes(r) ? 10 : 3;
    if (!r.asset.duration || r.asset.duration > max + 0.05)
      errors.push(
        `${r.asset.name}: use a clip of ${max} seconds or less for this purpose.`,
      );
  }
  for (const r of refs)
    if (!ROLES.includes(r.role))
      errors.push("Choose a valid reference purpose.");
  if (
    refs.some(
      (r) =>
        r.asset?.mime.startsWith("image/") &&
        ["Video to edit", "Video to extend"].includes(r.role),
    )
  )
    errors.push("Editing and extension sources must be videos.");
  if (
    refs.some(
      (r) =>
        r.asset?.mime.startsWith("video/") &&
        ["Starting frame", "Ending frame"].includes(r.role),
    )
  )
    errors.push("First and last frames must be images.");
  for (const role of ["Starting frame", "Ending frame"])
    if (refs.filter((r) => r.role === role).length > 1)
      errors.push(`Use only one ${role.toLowerCase()}.`);
  if (
    refs.some((r) => r.role === "Ending frame") &&
    !refs.some((r) => r.role === "Starting frame")
  )
    errors.push("Add a starting frame alongside the ending frame.");
  if (task.settings.task === "text_to_video" && refs.length)
    errors.push(
      "Text-only generation cannot use references. Choose Automatic instead.",
    );
  if (
    task.settings.task === "image_to_video" &&
    !refs.some((r) => r.asset?.mime.startsWith("image/"))
  )
    errors.push("Add an image for image-to-video generation.");
  if (["edit", "extend"].includes(task.settings.task) && !source.length)
    errors.push(
      "Add a source video and choose its editing or extension purpose.",
    );
  if (task.settings.task === "reference_to_video" && !refs.length)
    errors.push("Add a reference for reference-based generation.");
  return unique(errors);
}
export function validateFrame(task, assets = []) {
  const errors = [];
  for (const config of activeImageRecipes(task)) {
    const source = assets.find((a) => a.id === config.sourceAssetId);
    if (
      !source?.mime.startsWith("image/") ||
      !task.references.some(
        (r) =>
          r.assetId === config.sourceAssetId &&
          [
            "Starting frame",
            "Ending frame",
            "Subject appearance",
            "Visual style",
            "Composition",
          ].includes(r.role),
      )
    )
      errors.push(
        "Choose an existing image reference with a compatible purpose.",
      );
    if (!config.prompt.trim())
      errors.push("Describe how each selected reference image should change.");
    if (!IMAGE_MODELS.includes(config.settings.model))
      errors.push("Choose a supported image model for the reference image.");
    if (
      ![
        "auto",
        "16:9",
        "9:16",
        "1:1",
        "4:3",
        "3:4",
        "3:2",
        "2:3",
        "4:5",
        "5:4",
        "21:9",
      ].includes(config.settings.aspectRatio)
    )
      errors.push("Choose a supported reference-image format.");
    if (!["1K", "2K", "4K"].includes(config.settings.imageSize))
      errors.push("Choose a supported reference-image resolution.");
    if (task.settings.task === "text_to_video")
      errors.push(
        "Image variations need a video mode that accepts references. Choose Automatic.",
      );
    for (const name of promptNames(config.prompt))
      if (!task.variables.find((v) => v.name === name)?.values.length)
        errors.push(`Add at least one value for ${name.replaceAll("_", " ")}.`);
  }
  return errors;
}
export function sanitizeTask(input, previous) {
  const task = structuredClone(previous);
  for (const key of ["name", "prompt", "mode", "section"])
    if (typeof input[key] === "string") task[key] = input[key];
  if (task.name.length > 160 || task.prompt.length > 30000)
    throw new Error("The name or prompt is too long.");
  if (!["batch", "continuous"].includes(task.mode))
    throw new Error("Choose a valid production mode.");
  if (input.takes !== undefined) task.takes = Number(input.takes);
  if (input.limit !== undefined)
    task.limit =
      input.limit === null || input.limit === "" ? null : Number(input.limit);
  if (input.settings)
    task.settings = {
      ...task.settings,
      ...Object.fromEntries(
        Object.entries(input.settings).filter(([k]) =>
          ["model", "aspectRatio", "resolution", "task"].includes(k),
        ),
      ),
    };
  if (input.references)
    task.references = input.references
      .slice(0, 14)
      .map((r) => ({ assetId: String(r.assetId), role: String(r.role) }));
  if (
    input.imageVariations !== undefined ||
    input.startingFrame !== undefined
  ) {
    const configs =
      input.imageVariations !== undefined
        ? input.imageVariations
        : input.startingFrame
          ? [input.startingFrame]
          : [];
    if (!Array.isArray(configs) || configs.length > 14)
      throw new Error("Choose up to 14 reference images to vary.");
    const seen = new Set();
    task.imageVariations = configs.map((config) => {
      const sourceAssetId = String(config.sourceAssetId || "");
      if (!sourceAssetId || seen.has(sourceAssetId))
        throw new Error("Each reference image can have only one edit prompt.");
      seen.add(sourceAssetId);
      const previousConfig = imageRecipes(previous).find(
        (c) => c.sourceAssetId === sourceAssetId,
      );
      const prompt = String(config.prompt || "");
      if (prompt.length > 30000)
        throw new Error("The image-edit prompt is too long.");
      const versions = [...(previousConfig?.versions || [])];
      if (previousConfig?.prompt && prompt !== previousConfig.prompt)
        versions.push({ prompt: previousConfig.prompt, at: now() });
      return {
        enabled: !!config.enabled,
        sourceAssetId,
        prompt,
        settings: {
          model: config.settings?.model || IMAGE_MODELS[0],
          aspectRatio: config.settings?.aspectRatio || "auto",
          imageSize: config.settings?.imageSize || "1K",
        },
        versions: versions.slice(-40),
      };
    });
    // Retain a compatibility alias for old clients; new clients use the array.
    task.startingFrame = task.imageVariations[0] || null;
  }
  if (input.variables)
    task.variables = input.variables.slice(0, 12).map((v) => ({
      name: String(v.name),
      values: unique(v.values || []).slice(0, 2000),
      instructions: String(v.instructions || "").slice(0, 10000),
      expand: !!v.expand,
    }));
  for (const name of taskNames(task))
    if (!task.variables.some((v) => v.name === name))
      task.variables.push({
        name,
        values: [],
        instructions: "",
        expand: false,
      });
  task.variables = task.variables.filter((v) =>
    [
      ...taskNames(task),
      ...imageRecipes(task).flatMap((c) => promptNames(c.prompt)),
    ].includes(v.name),
  );
  if (task.prompt !== previous.prompt)
    task.versions = [...task.versions, { prompt: previous.prompt, at: now() }]
      .filter((v) => v.prompt)
      .slice(-40);
  for (const v of task.variables)
    task.history[v.name] = unique([
      ...(task.history[v.name] || []),
      ...v.values,
    ]);
  task.revision++;
  task.updatedAt = now();
  return task;
}
