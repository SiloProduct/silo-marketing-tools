import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Worker } from "../server/worker.js";
import {
  newTask,
  uid,
  countCombinations,
  combinations,
  sanitizeTask,
} from "../server/domain.js";
import { frameCount, taskNames } from "../shared/task-variables.js";
import { frameStats, frameRecipe } from "../server/frames.js";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
  "base64",
);
function setup(
  t,
  food = ["apples", "berries", "peppers", "carrots", "snacks"],
  cameras = ["orbit", "pan", "push"],
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-stage-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const task = store.createTask(newTask("Image variations"));
  const source = store.addAsset({
    taskId: task.id,
    name: "Original",
    mime: "image/png",
    bytes: png,
  });
  Object.assign(task, {
    references: [{ assetId: source.id, role: "Starting frame" }],
    startingFrame: {
      enabled: true,
      sourceAssetId: source.id,
      prompt: "Replace contents with {food}. Preserve everything else.",
      settings: {
        model: "gemini-3.1-flash-image",
        aspectRatio: "auto",
        imageSize: "1K",
      },
      versions: [],
    },
    prompt: "Animate the starting image with {camera}.",
    variables: [
      { name: "food", values: food, instructions: "Foods", expand: false },
      {
        name: "camera",
        values: cameras,
        instructions: "Camera moves",
        expand: false,
      },
    ],
    takes: 4,
  });
  store.put("tasks", task);
  const submissions = [];
  const provider = {
    async submit(snapshot, refs) {
      submissions.push(
        structuredClone({
          snapshot,
          references: refs.map((r) => ({ id: r.asset.id, role: r.role })),
        }),
      );
      return {
        id: uid(),
        status: "completed",
        type: snapshot.settings.model.includes("image") ? "image" : "video",
      };
    },
    async retrieve() {
      return { id: uid(), status: "completed", type: "image" };
    },
    async download(response) {
      return {
        bytes: png,
        mime: response.type === "image" ? "image/png" : "video/mp4",
      };
    },
    async variations(task, name) {
      return [`new-${name}-${task.expansion}`];
    },
  };
  const worker = new Worker(store, provider);
  return { dir, store, task, source, provider, worker, submissions };
}
function start({ store, task }) {
  task.status = "running";
  task.runId = uid();
  store.put("runs", { id: task.runId, taskId: task.id, number: 1 });
  store.put("tasks", task);
}
async function finish(f, max = 350) {
  for (
    let i = 0;
    i < max && f.store.get("tasks", f.task.id).status === "running";
    i++
  )
    await f.worker.tick();
}
function addSecondImage(f, values = ["warm", "cool", "neutral"]) {
  const source = f.store.addAsset({
    taskId: f.task.id,
    name: "Style",
    mime: "image/png",
    bytes: png,
  });
  f.task.references.push({ assetId: source.id, role: "Visual style" });
  f.task.imageVariations = [
    f.task.startingFrame,
    {
      ...structuredClone(f.task.startingFrame),
      sourceAssetId: source.id,
      prompt: "Use {palette} colors. Preserve the subject.",
    },
  ];
  f.task.variables.push({
    name: "palette",
    values,
    instructions: "Color palettes",
    expand: false,
  });
  f.store.put("tasks", f.task);
  return source;
}
test("regenerating the second reference updates unfinished work only and retains the first reference", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  addSecondImage(f, ["warm"]);
  const values = { food: "apple", palette: "warm", camera: "orbit" };
  const sample = f.worker.createVideoJob(f.task, values, { kind: "sample" });
  for (let i = 0; i < 3; i++) await f.worker.tick();
  const original = structuredClone(f.store.get("jobs", sample.id));
  assert.equal(original.status, "completed");
  const pending = f.worker.createVideoJob(f.task, values, {
    kind: "production",
  });
  f.worker.settleDependencies();
  const replacement = f.worker.ensureFrame(f.task, values, {
    manual: true,
    regenerate: true,
    config: f.task.imageVariations[1],
  });
  await f.worker.tick();
  f.worker.settleDependencies();
  const updated = f.store.get("jobs", pending.id);
  assert.equal(
    updated.snapshot.generatedReferences[0].assetId,
    original.snapshot.generatedReferences[0].assetId,
  );
  assert.equal(updated.snapshot.generatedReferences[1].jobId, replacement.id);
  assert.equal(
    updated.snapshot.references[1].assetId,
    f.store.get("jobs", replacement.id).assetId,
  );
  assert.deepEqual(f.store.get("jobs", sample.id), original);
});
test("legacy unfinished videos retain their source mapping when regenerating a migrated image", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  const values = { food: "apple", camera: "orbit" };
  const frame = f.worker.ensureFrame(f.task, values, { manual: true });
  await f.worker.tick();
  const pending = f.worker.createVideoJob(f.task, values, {
    kind: "production",
  });
  f.worker.settleDependencies();
  const legacy = f.store.get("jobs", pending.id);
  delete legacy.snapshot.originalReferences;
  delete legacy.snapshot.generatedReferences;
  delete legacy.snapshot.frameDependencies;
  f.store.put("jobs", legacy);
  const replacement = f.worker.ensureFrame(f.task, values, {
    manual: true,
    regenerate: true,
  });
  await f.worker.tick();
  f.worker.settleDependencies();
  const updated = f.store.get("jobs", pending.id);
  assert.notEqual(updated.snapshot.frameJobId, frame.id);
  assert.equal(updated.snapshot.frameJobId, replacement.id);
  assert.equal(
    updated.snapshot.references[0].assetId,
    f.store.get("jobs", replacement.id).assetId,
  );
  assert.equal(updated.snapshot.references[0].role, "Starting frame");
});
test("multiple image recipes reuse independent combinations and replace each reference by its original role", async (t) => {
  const f = setup(t, ["apple", "pear"], ["orbit", "pan"]);
  const second = addSecondImage(f);
  const fixed = f.store.addAsset({
    taskId: f.task.id,
    name: "Fixed",
    mime: "image/png",
    bytes: png,
  });
  f.task.references.push({ assetId: fixed.id, role: "Composition" });
  f.task.takes = 1;
  assert.equal(frameCount(f.task), 5);
  assert.equal(countCombinations(f.task), 12);
  start(f);
  await finish(f);
  const jobs = f.store.list("jobs"),
    frames = jobs.filter((j) => j.kind === "frame"),
    videos = jobs.filter((j) => j.kind === "production");
  assert.equal(frames.length, 5);
  assert.equal(videos.length, 12);
  assert.ok(jobs.every((j) => j.status === "completed"));
  for (const video of videos) {
    assert.equal(video.snapshot.frameDependencies.length, 2);
    assert.equal(video.snapshot.generatedReferences.length, 2);
    for (const [sourceId, role] of [
      [f.source.id, "Starting frame"],
      [second.id, "Visual style"],
    ]) {
      const used = video.snapshot.generatedReferences.find(
        (r) => r.sourceAssetId === sourceId,
      );
      const frame = f.store.get("jobs", used.jobId);
      assert.equal(used.assetId, frame.assetId);
      assert.equal(used.role, role);
      assert.equal(
        video.snapshot.references.find((r) => r.role === role).assetId,
        frame.assetId,
      );
      for (const [name, value] of Object.entries(frame.snapshot.values))
        assert.equal(value, video.snapshot.values[name]);
    }
    assert.equal(
      video.snapshot.references.find((r) => r.role === "Composition").assetId,
      fixed.id,
    );
  }
  assert.deepEqual(frameStats(f.task, f.store), { total: 5, ready: 5 });
});
test("shared variables across two image prompts and video count once", (t) => {
  const f = setup(t, ["apple", "pear"], ["orbit", "pan"]);
  addSecondImage(f, ["warm", "cool", "neutral"]);
  f.task.imageVariations[1].prompt += " Include {food}.";
  f.task.prompt += " Show {food}.";
  assert.equal(countCombinations(f.task), 12);
  assert.equal(frameCount(f.task), 8); // 2 originals + 2 × 3 style edits
  assert.equal([...combinations(f.task)].length, 12);
});
test("multiple dependencies survive pause and restart without releasing a video after only one image", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  addSecondImage(f, ["warm"]);
  f.task.takes = 1;
  start(f);
  await f.worker.tick();
  await f.worker.tick(); // first image complete, second still pending
  f.task.status = "paused";
  f.store.put("tasks", f.task);
  const worker = new Worker(f.store, f.provider);
  worker.recover();
  await worker.tick();
  assert.equal(f.submissions.length, 1);
  const video = f.store.list("jobs").find((j) => j.kind === "production");
  assert.equal(video.status, "waiting");
  f.task.status = "running";
  f.store.put("tasks", f.task);
  f.worker = worker;
  await finish(f);
  assert.equal(f.submissions.length, 3);
  assert.equal(f.store.get("jobs", video.id).status, "completed");
  assert.equal(
    f.store.list("jobs").filter((j) => j.kind === "frame").length,
    2,
  );
});
test("a failed second image blocks only its combinations and can be retried without replacing the first", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  const second = addSecondImage(f, ["bad", "good"]);
  f.task.takes = 1;
  const submit = f.provider.submit;
  let fail = true;
  f.provider.submit = async (s, r) => {
    if (s.parentId === second.id && s.values.palette === "bad" && fail)
      throw new Error("Rejected palette");
    return submit(s, r);
  };
  start(f);
  await finish(f);
  let videos = f.store.list("jobs").filter((j) => j.kind === "production");
  assert.equal(videos.filter((j) => j.status === "completed").length, 1);
  assert.equal(videos.filter((j) => j.status === "blocked").length, 1);
  const completed = structuredClone(
    videos.find((j) => j.status === "completed"),
  );
  const rejected = f.store
    .list("jobs")
    .find((j) => j.kind === "frame" && j.status === "failed");
  rejected.status = "pending";
  f.store.put("jobs", rejected);
  fail = false;
  f.task.status = "running";
  f.store.put("tasks", f.task);
  await finish(f);
  assert.deepEqual(f.store.get("jobs", completed.id), completed);
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    2,
  );
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "frame" && j.snapshot.parentId === f.source.id)
      .length,
    1,
  );
});
test("five frame combinations × three camera moves × four takes create five images and sixty videos", async (t) => {
  const f = setup(t);
  start(f);
  await finish(f);
  const jobs = f.store.list("jobs"),
    frames = jobs.filter((j) => j.kind === "frame"),
    videos = jobs.filter((j) => j.kind === "production");
  assert.equal(countCombinations(f.task), 15);
  assert.equal(frameCount(f.task), 5);
  assert.equal(frames.length, 5);
  assert.equal(videos.length, 60);
  assert.ok(jobs.every((j) => j.status === "completed"));
  assert.equal(f.store.get("tasks", f.task.id).status, "complete");
  assert.equal(
    f.submissions[0].snapshot.settings.model,
    "gemini-3.1-flash-image",
  );
  assert.equal(
    f.submissions[1].snapshot.settings.model,
    "gemini-omni-1.1-flash",
  );
  for (const video of videos) {
    const frame = frames.find((j) => j.id === video.snapshot.frameJobId);
    assert.equal(video.snapshot.frameAssetId, frame.assetId);
    assert.equal(video.snapshot.references[0].assetId, frame.assetId);
    assert.equal(frame.snapshot.values.food, video.snapshot.values.food);
    const asset = f.store.get("assets", video.assetId);
    assert.equal(asset.metadata.frameVersion, 1);
  }
  assert.ok(frames.every((j) => j.snapshot.parentId === f.source.id));
  assert.ok(
    frames.every((j) =>
      f.store
        .get("assets", j.assetId)
        .file.includes(path.join("references", "generated") + path.sep),
    ),
  );
  assert.deepEqual(frameStats(f.task, f.store), { total: 5, ready: 5 });
});
test("image-only and shared variables count once; disabled config retains lists without affecting videos", (t) => {
  const f = setup(t, ["a", "b"], ["orbit", "pan", "push"]);
  f.task.startingFrame.prompt += " Use {camera} and {light}.";
  f.task.variables.push({
    name: "light",
    values: ["day", "night"],
    instructions: "",
  });
  assert.equal(countCombinations(f.task), 12);
  assert.equal(frameCount(f.task), 12);
  assert.equal([...combinations(f.task)].length, 12);
  assert.deepEqual(taskNames(f.task), ["food", "camera", "light"]);
  const off = sanitizeTask(
    { ...f.task, startingFrame: { ...f.task.startingFrame, enabled: false } },
    f.task,
  );
  assert.equal(countCombinations(off), 3);
  assert.equal(frameCount(off), 0);
  assert.equal(off.variables.length, 3);
});
test("preview frame and samples are reused in production while sample videos stay separate", async (t) => {
  const f = setup(t, ["apples"], ["orbit"]);
  f.task.takes = 2;
  f.store.put("tasks", f.task);
  const frame = f.worker.ensureFrame(
    f.task,
    { food: "apples" },
    { manual: true },
  );
  await f.worker.tick();
  const sample = f.worker.createVideoJob(
    f.task,
    { food: "apples", camera: "orbit" },
    { kind: "sample" },
  );
  await f.worker.tick();
  assert.equal(f.store.get("jobs", sample.id).status, "completed");
  start(f);
  await finish(f);
  assert.equal(
    f.store.list("jobs").filter((j) => j.kind === "frame").length,
    1,
  );
  assert.equal(
    f.store.list("jobs").filter((j) => j.kind === "production").length,
    2,
  );
  assert.equal(
    f.store.get("jobs", sample.id).snapshot.frameAssetId,
    f.store.get("jobs", frame.id).assetId,
  );
});
test("pausing while an image is active saves it but never submits dependent videos; restart reuses it", async (t) => {
  const f = setup(t, ["apples"], ["orbit"]);
  start(f);
  await f.worker.tick(); // persists frame + dependent video
  let done;
  f.provider.submit = async (snapshot) =>
    new Promise((resolve) => {
      done = () =>
        resolve({ id: "image-id", status: "completed", type: "image" });
    });
  const active = f.worker.tick();
  f.task.status = "pausing";
  f.store.put("tasks", f.task);
  done();
  await active;
  assert.equal(f.store.get("tasks", f.task.id).status, "paused");
  await f.worker.tick();
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    0,
  );
  const worker = new Worker(f.store, {
    ...f.provider,
    submit: async () => ({ id: uid(), status: "completed", type: "video" }),
  });
  worker.recover();
  f.task.status = "running";
  f.store.put("tasks", f.task);
  f.worker = worker;
  await finish(f);
  assert.equal(
    f.store.list("jobs").filter((j) => j.kind === "frame").length,
    1,
  );
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    4,
  );
});
test("failed image blocks only its videos; retry uses the same dependency and unblocks them", async (t) => {
  const f = setup(t, ["bad", "good"], ["orbit"]);
  f.task.takes = 1;
  start(f);
  const submit = f.provider.submit;
  let fail = true;
  f.provider.submit = async (s, r) => {
    if (s.settings.model.includes("image") && s.values.food === "bad" && fail)
      throw new Error("Image rejected");
    return submit(s, r);
  };
  await finish(f);
  const jobs = f.store.list("jobs");
  assert.equal(
    jobs.filter((j) => j.kind === "production" && j.status === "blocked")
      .length,
    1,
  );
  assert.equal(
    jobs.filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    1,
  );
  assert.equal(f.store.get("tasks", f.task.id).status, "attention");
  const frame = jobs.find((j) => j.kind === "frame" && j.status === "failed");
  frame.status = "pending";
  f.store.put("jobs", frame);
  fail = false;
  f.task.status = "running";
  f.store.put("tasks", f.task);
  await finish(f);
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    2,
  );
});
test("regenerated frames preserve original outputs; only image recipe changes invalidate reuse", async (t) => {
  const f = setup(t, ["apples"], ["orbit"]);
  let frame = f.worker.ensureFrame(
    f.task,
    { food: "apples" },
    { manual: true },
  );
  await f.worker.tick();
  frame = f.store.get("jobs", frame.id);
  const sample = f.worker.createVideoJob(
    f.task,
    { food: "apples", camera: "orbit" },
    { kind: "sample" },
  );
  await f.worker.tick();
  const unchanged = structuredClone(f.store.get("jobs", sample.id).snapshot);
  f.task.prompt = "New camera direction {camera}";
  f.task.settings.resolution = "1080p";
  assert.equal(f.worker.ensureFrame(f.task, { food: "apples" }).id, frame.id);
  const second = f.worker.ensureFrame(
    f.task,
    { food: "apples" },
    { manual: true, regenerate: true },
  );
  await f.worker.tick();
  assert.equal(second.snapshot.frameVersion, 2);
  assert.equal(f.worker.ensureFrame(f.task, { food: "apples" }).id, second.id);
  assert.deepEqual(f.store.get("jobs", sample.id).snapshot, unchanged);
  f.task.startingFrame.settings.imageSize = "2K";
  assert.notEqual(
    frameRecipe(f.task, { food: "apples" }, f.store).key,
    frame.key,
  );
  assert.equal(frameStats(f.task, f.store).ready, 0);
  fs.appendFileSync(f.source.file, "changed");
  assert.notEqual(
    frameRecipe(f.task, { food: "apples" }, f.store).snapshot.sourceDigest,
    frame.snapshot.sourceDigest,
  );
});
test("continuous expansion crosses new and old values and honors video limits without surplus frames", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  f.task.mode = "continuous";
  f.task.takes = 1;
  f.task.limit = 5;
  f.task.variables.forEach((v) => (v.expand = true));
  start(f);
  await finish(f);
  const jobs = f.store.list("jobs");
  const videos = jobs.filter((j) => j.kind === "production");
  assert.equal(videos.length, 5);
  assert.ok(videos.every((j) => j.status === "completed"));
  assert.ok(
    videos.some(
      (j) =>
        j.snapshot.values.food === "apple" &&
        j.snapshot.values.camera === "new-camera-0",
    ),
  );
  assert.ok(
    videos.some(
      (j) =>
        j.snapshot.values.food === "new-food-0" &&
        j.snapshot.values.camera === "orbit",
    ),
  );
  assert.equal(jobs.filter((j) => j.kind === "frame").length, 2);
  assert.equal(new Set(videos.map((j) => j.key)).size, 5);
});
test("uncertain image recovery does not submit again or release dependent videos", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  start(f);
  await f.worker.tick();
  const frame = f.store.list("jobs").find((j) => j.kind === "frame");
  frame.status = "submitting";
  f.store.put("jobs", frame);
  f.worker.recover();
  await f.worker.tick();
  assert.equal(f.store.get("jobs", frame.id).status, "uncertain");
  assert.equal(f.submissions.length, 0);
  assert.equal(
    f.store.list("jobs").find((j) => j.kind === "production").status,
    "blocked",
  );
});

test("a failed regeneration keeps the previous saved frame usable", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  const original = f.worker.ensureFrame(
    f.task,
    { food: "apple" },
    { manual: true },
  );
  await f.worker.tick();
  const sample = f.worker.createVideoJob(
    f.task,
    { food: "apple", camera: "orbit" },
    { kind: "sample" },
  );
  await f.worker.tick();
  const saved = structuredClone(f.store.get("jobs", sample.id));
  const replacement = f.worker.ensureFrame(
    f.task,
    { food: "apple" },
    { manual: true, regenerate: true },
  );
  f.provider.submit = async () => {
    throw new Error("Image rejected");
  };
  await f.worker.tick();
  assert.equal(f.store.get("jobs", replacement.id).status, "failed");
  assert.equal(f.worker.ensureFrame(f.task, { food: "apple" }).id, original.id);
  assert.deepEqual(f.store.get("jobs", sample.id), saved);
});
test("known provider image requests recover without resubmitting", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  start(f);
  await f.worker.tick();
  const frame = f.store.list("jobs").find((j) => j.kind === "frame");
  frame.status = "submitted";
  frame.providerId = "known-image";
  f.store.put("jobs", frame);
  f.worker.recover();
  await f.worker.tick();
  assert.equal(f.submissions.length, 0);
  assert.equal(f.store.get("jobs", frame.id).status, "completed");
  await f.worker.tick();
  assert.equal(f.submissions.length, 0);
  assert.equal(f.store.get("tasks", f.task.id).status, "paused");
});
test("missing source storage pauses production with an actionable message", async (t) => {
  const f = setup(t, ["apple"], ["orbit"]);
  fs.unlinkSync(f.source.file);
  start(f);
  await f.worker.tick();
  const task = f.store.get("tasks", f.task.id);
  assert.equal(task.status, "attention");
  assert.match(task.error, /original reference image is missing/);
  assert.equal(f.submissions.length, 0);
});
test("failed frames prevent continuous expansion after unrelated work finishes", async (t) => {
  const f = setup(t, ["bad", "good"], ["orbit"]);
  f.task.mode = "continuous";
  f.task.takes = 1;
  f.task.variables[0].expand = true;
  let expansions = 0;
  f.provider.variations = async () => {
    expansions++;
    return ["new food"];
  };
  const submit = f.provider.submit;
  f.provider.submit = async (s, r) => {
    if (s.settings.model.includes("image") && s.values.food === "bad")
      throw new Error("Bad frame");
    return submit(s, r);
  };
  start(f);
  await finish(f);
  assert.equal(expansions, 0);
  assert.equal(f.store.get("tasks", f.task.id).status, "attention");
  assert.equal(
    f.store
      .list("jobs")
      .filter((j) => j.kind === "production" && j.status === "completed")
      .length,
    1,
  );
});
