import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import {
  newTask,
  sanitizeTask,
  combinations,
  countCombinations,
  validateTask,
  unique,
  uid,
  now,
} from "../server/domain.js";
import { Worker, nextCombination, snapshotTask } from "../server/worker.js";
import {
  GeminiProvider,
  ProviderError,
  outputParts,
} from "../server/provider.js";

function fixture(t, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-test-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const provider = {
    key: "test-only",
    submit: async () => ({
      id: uid(),
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "video", data: "AAAA", mime_type: "video/mp4" }],
        },
      ],
    }),
    retrieve: async () => ({ id: "recovered", status: "completed" }),
    download: async () => ({
      bytes: Buffer.from("test media"),
      mime: "video/mp4",
    }),
    variations: async (task, name) => [`new ${name} ${task.expansion}`],
    ...overrides,
  };
  const worker = new Worker(store, provider);
  const task = store.createTask({
    ...newTask("Test production"),
    prompt: "A {animal} on a {color} rug, {behaviour}.",
    variables: [
      { name: "animal", values: ["cat", "dog"], expand: false },
      { name: "color", values: ["red", "blue", "green"], expand: false },
      {
        name: "behaviour",
        values: ["sleeping", "playing", "stretching", "rolling"],
        expand: false,
      },
    ],
    takes: 4,
  });
  return { store, worker, provider, task, dir };
}
function start(store, task) {
  const run = { id: uid(), taskId: task.id, number: 1, startedAt: now() };
  store.put("runs", run);
  task.runId = run.id;
  task.status = "running";
  store.put("tasks", task);
}

test("2 × 3 × 4 values and four takes produces exactly 96 persisted videos", async (t) => {
  const { store, worker, task } = fixture(t);
  assert.equal(countCombinations(task), 24);
  assert.equal([...combinations(task)].length, 24);
  start(store, task);
  for (let i = 0; i < 97; i++) await worker.tick();
  const jobs = store.list("jobs");
  assert.equal(jobs.length, 96);
  assert.equal(jobs.filter((j) => j.status === "completed").length, 96);
  assert.equal(new Set(jobs.map((j) => `${j.key}:${j.take}`)).size, 96);
  assert.equal(store.get("tasks", task.id).status, "complete");
  assert.equal(store.list("assets").length, 96);
  assert.ok(fs.existsSync(path.join(task.folder, "production", "run-001")));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(task.folder, "task-manifest.json"), "utf8"),
  );
  assert.equal(manifest.generations.length, 96);
});
test("samples save before production and do not consume combination slots", async (t) => {
  const { store, worker, task } = fixture(t);
  worker.createJob({
    taskId: task.id,
    kind: "sample",
    snapshot: snapshotTask(task, {
      animal: "cat",
      color: "red",
      behaviour: "sleeping",
    }),
  });
  await worker.tick();
  assert.equal(store.get("tasks", task.id).runId, null);
  assert.equal(store.list("assets")[0].kind, "sample");
  assert.ok(
    store.list("assets")[0].file.includes(`${path.sep}samples${path.sep}`),
  );
  assert.equal(nextCombination(task, store.list("jobs")).take, 1);
});
test("continuous expansion crosses new values with accumulated older values without repeats", async (t) => {
  const { store, worker, task } = fixture(t);
  task.prompt = "{animal} on {color}";
  task.variables = [
    { name: "animal", values: ["cat"], expand: true },
    { name: "color", values: ["red"], expand: true },
  ];
  task.takes = 1;
  task.mode = "continuous";
  task.limit = 4;
  start(store, task);
  for (let i = 0; i < 7; i++) await worker.tick();
  const jobs = store.list("jobs");
  assert.equal(jobs.length, 4);
  assert.equal(new Set(jobs.map((j) => j.key)).size, 4);
  assert.deepEqual(
    jobs.map((j) => j.snapshot.values),
    [
      { animal: "cat", color: "red" },
      { animal: "cat", color: "new color 0" },
      { animal: "new animal 0", color: "red" },
      { animal: "new animal 0", color: "new color 0" },
    ],
  );
  assert.equal(store.get("tasks", task.id).status, "complete");
});
test("pause drains an outstanding request without submitting another", async (t) => {
  let submits = 0;
  const { store, worker, task } = fixture(t, {
    submit: async () => {
      submits++;
      return { id: "google-id", status: "in_progress" };
    },
  });
  start(store, task);
  await worker.tick();
  let saved = store.get("tasks", task.id);
  saved.status = "pausing";
  store.put("tasks", saved);
  const j = store.list("jobs")[0];
  j.nextAttemptAt = 0;
  store.put("jobs", j);
  await worker.tick();
  await worker.tick();
  assert.equal(submits, 1);
  assert.equal(store.get("tasks", task.id).status, "paused");
  assert.equal(store.list("jobs")[0].status, "completed");
});
test("editing a paused prompt preserves prior output metadata and changes only unfinished combinations", async (t) => {
  const { store, worker, task } = fixture(t);
  task.takes = 1;
  start(store, task);
  await worker.tick();
  const oldPrompt = store.list("assets")[0].metadata.prompt;
  const updated = sanitizeTask(
    { prompt: "Close-up: " + task.prompt },
    store.get("tasks", task.id),
  );
  updated.status = "running";
  store.put("tasks", updated);
  await worker.tick();
  assert.equal(store.list("assets")[0].metadata.prompt, oldPrompt);
  assert.match(store.list("assets")[1].metadata.prompt, /^Close-up:/);
  assert.notEqual(store.list("jobs")[0].key, store.list("jobs")[1].key);
});
test("restart recovers known operation IDs and marks unconfirmed submissions uncertain", async (t) => {
  const { store, worker, task } = fixture(t);
  start(store, task);
  const a = worker.createJob({
    taskId: task.id,
    kind: "sample",
    snapshot: snapshotTask(task, {}),
  });
  a.status = "submitting";
  store.put("jobs", a);
  const b = worker.createJob({
    taskId: task.id,
    kind: "sample",
    snapshot: snapshotTask(task, {}),
  });
  b.status = "submitted";
  b.providerId = "known";
  store.put("jobs", b);
  worker.recover();
  assert.equal(store.get("tasks", task.id).status, "paused");
  assert.equal(store.get("jobs", a.id).status, "uncertain");
  assert.equal(store.get("jobs", b.id).status, "submitted");
});
test("temporary rejected requests retry at most three times", async (t) => {
  let calls = 0;
  const { store, worker, task } = fixture(t, {
    submit: async () => {
      calls++;
      throw new ProviderError("Rate limit", { retryable: true, status: 429 });
    },
  });
  const j = worker.createJob({
    taskId: task.id,
    kind: "sample",
    snapshot: snapshotTask(task, {}),
  });
  for (let i = 0; i < 4; i++) {
    const current = store.get("jobs", j.id);
    current.nextAttemptAt = 0;
    store.put("jobs", current);
    await worker.tick();
  }
  assert.equal(calls, 3);
  assert.equal(store.get("jobs", j.id).status, "failed");
});
test("ambiguous submission is never automatically repeated", async (t) => {
  let calls = 0;
  const { store, worker, task } = fixture(t, {
    submit: async () => {
      calls++;
      throw new ProviderError("Unknown", { uncertain: true });
    },
  });
  start(store, task);
  await worker.tick();
  await worker.tick();
  assert.equal(calls, 1);
  assert.equal(store.list("jobs")[0].status, "uncertain");
  assert.equal(store.get("tasks", task.id).status, "attention");
});
test("a permanently failed combination does not block unrelated work", async (t) => {
  let calls = 0;
  const { store, worker, task } = fixture(t, {
    submit: async () => {
      calls++;
      if (calls === 1) throw new Error("Rejected");
      return { id: uid(), status: "completed" };
    },
  });
  task.prompt = "{animal}";
  task.variables = [{ name: "animal", values: ["cat", "dog"] }];
  task.takes = 1;
  start(store, task);
  await worker.tick();
  await worker.tick();
  await worker.tick();
  assert.equal(store.list("jobs")[0].status, "failed");
  assert.equal(store.list("jobs")[1].status, "completed");
  assert.equal(store.get("tasks", task.id).status, "attention");
});
test("failed continuous expansion commits no partial values and requests attention", async (t) => {
  const { store, worker, task } = fixture(t, {
    variations: async () => {
      throw new Error("No distinct ideas");
    },
  });
  task.prompt = "{animal}";
  task.variables = [{ name: "animal", values: ["cat"], expand: true }];
  task.takes = 1;
  task.mode = "continuous";
  start(store, task);
  await worker.tick();
  await worker.tick();
  assert.equal(store.get("tasks", task.id).status, "attention");
  assert.deepEqual(store.get("tasks", task.id).variables[0].values, ["cat"]);
});
test("validation rejects incompatible reference modes and lengths", (t) => {
  const { task } = fixture(t);
  task.references = [{ assetId: "v", role: "Subject appearance" }];
  const errors = validateTask(task, [
    { id: "v", name: "Long video", mime: "video/mp4", duration: 8 },
  ]);
  assert.ok(errors.some((e) => e.includes("3 seconds")));
  task.references[0].role = "Video to edit";
  assert.deepEqual(
    validateTask(task, [
      { id: "v", name: "Source", mime: "video/mp4", duration: 8 },
    ]),
    [],
  );
  task.settings.task = "text_to_video";
  assert.ok(
    validateTask(task, [
      { id: "v", name: "Source", mime: "video/mp4", duration: 8 },
    ]).some((e) => e.includes("Text-only")),
  );
});
test("normalize duplicate values and preserve history of removed values", (t) => {
  const { task } = fixture(t);
  assert.deepEqual(unique(["Cat", " cat ", "dog"]), ["cat", "dog"]);
  const next = sanitizeTask(
    {
      variables: task.variables.map((v) =>
        v.name === "animal" ? { ...v, values: ["rabbit"] } : v,
      ),
    },
    { ...task, history: { animal: ["cat", "dog"] } },
  );
  assert.deepEqual(next.history.animal, ["cat", "dog", "rabbit"]);
});
test("prompt optimization rejects renamed, removed or duplicated placeholders", async () => {
  const p = new GeminiProvider("test");
  p.text = async () => "{cat} on {color}";
  await assert.rejects(
    () => p.improve({ prompt: "{animal} on {color}" }, ""),
    /changed a variable/,
  );
  p.text = async () => "{animal} {animal} on {color}";
  await assert.rejects(
    () => p.improve({ prompt: "{animal} on {color}" }, ""),
    /changed a variable/,
  );
  p.text = async () => "Beautiful {animal} on {color}";
  assert.equal(
    await p.improve({ prompt: "{animal} on {color}" }, ""),
    "Beautiful {animal} on {color}",
  );
});
test("response parsing only extracts model output, never user reference media", () => {
  assert.deepEqual(
    outputParts({
      steps: [
        { type: "user_input", content: [{ type: "image", data: "input" }] },
        { type: "model_output", content: [{ type: "video", data: "output" }] },
      ],
    }),
    [{ type: "video", data: "output" }],
  );
});
test("provider builds documented video controls without unsupported fields", async () => {
  const p = new GeminiProvider("test");
  let body;
  p.request = async (route, b) => {
    body = b;
    return { id: "x" };
  };
  await p.submit({
    prompt: "A cat",
    settings: {
      model: "gemini-omni-1.1-flash",
      aspectRatio: "16:9",
      resolution: "720p",
      task: "auto",
    },
  });
  assert.deepEqual(body.response_format, {
    type: "video",
    aspect_ratio: "16:9",
    resolution: "720p",
  });
  assert.equal(body.background, true);
  assert.equal(body.generation_config, undefined);
  assert.equal(body.model, "gemini-omni-1.1-flash");
});

test("three continuous tasks all receive a turn without starvation", async (t) => {
  const { store, worker, task } = fixture(t);
  task.prompt = "{animal}";
  task.variables = [{ name: "animal", values: ["cat"], expand: true }];
  task.takes = 1;
  task.mode = "continuous";
  start(store, task);
  const second = store.createTask({
    ...structuredClone(task),
    id: uid(),
    name: "Second",
  });
  start(store, second);
  const third = store.createTask({
    ...structuredClone(task),
    id: uid(),
    name: "Third",
  });
  start(store, third);
  await worker.tick();
  await worker.tick();
  await worker.tick();
  assert.deepEqual(
    store.list("jobs").map((j) => j.taskId),
    [task.id, second.id, third.id],
  );
});

test("account access errors stop the task instead of failing every combination", async (t) => {
  let calls = 0;
  const { store, worker, task } = fixture(t, {
    submit: async () => {
      calls++;
      throw new ProviderError("Check model access", { status: 403 });
    },
  });
  start(store, task);
  await worker.tick();
  await worker.tick();
  assert.equal(calls, 1);
  assert.equal(store.get("tasks", task.id).status, "attention");
});
