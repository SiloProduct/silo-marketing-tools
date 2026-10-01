import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { Store } from "../server/store.js";
import { Worker } from "../server/worker.js";
import { createApp } from "../server/app.js";
import { parseArgs, validateInput } from "../cli/run.js";
import { schemas } from "../cli/spec.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "scripts/frame.js");
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
  "base64",
);

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-cli-"));
  const store = new Store(dir);
  const calls = [];
  const provider = {
    key: "never-print-this-private-test-key",
    async request() {
      return { models: [{ name: "models/gemini-omni-1.1-flash" }] };
    },
    async submit(snapshot, refs) {
      calls.push({ snapshot, refs });
      return {
        id: `operation-${calls.length}`,
        status: "completed",
        image: snapshot.settings.model.includes("image"),
      };
    },
    async retrieve() {
      return { status: "completed" };
    },
    async download(response) {
      return { bytes: png, mime: response.image ? "image/png" : "video/mp4" };
    },
    async improve(task) {
      return task.prompt + " Preserve the requested intent.";
    },
    async suggestVariable() {
      return { name: "food", instructions: "Photogenic foods for containers" };
    },
    async variations(task, name, count) {
      return ["berries", "peppers"].slice(0, count);
    },
    async optimizeStudio({ prompt }) {
      return `English proposal: ${prompt}`;
    },
  };
  const worker = new Worker(store, provider);
  const app = createApp(store, worker, provider);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const timer = setInterval(() => worker.tick(), 20);
  t.after(async () => {
    clearInterval(timer);
    while (worker.busy) await new Promise((resolve) => setTimeout(resolve, 5));
    await new Promise((resolve) => server.close(resolve));
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const jsonFile = (name, value) => {
    const file = path.join(dir, name);
    fs.writeFileSync(file, JSON.stringify(value));
    return file;
  };
  const cli = async (args, input) => {
    const child = spawn(process.execPath, [entry, ...args, "--url", url], {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdin.end(input === undefined ? undefined : JSON.stringify(input));
    const code = await new Promise((resolve) => child.on("close", resolve));
    assert.ok(!stdout.includes(provider.key) && !stderr.includes(provider.key));
    const result = JSON.parse(code === 0 ? stdout : stderr);
    return { code, ...result };
  };
  const ok = async (args, input) => {
    const result = await cli(args, input);
    assert.equal(result.code, 0, JSON.stringify(result));
    return result.data;
  };
  return { dir, store, worker, provider, calls, url, cli, ok, jsonFile };
}

test("CLI discovers commands offline and rejects unknown flags, fields and nonlocal URLs", async (t) => {
  const f = await fixture(t);
  assert.ok((await f.ok(["--help"])).commands["samples generate"]);
  assert.ok((await f.ok(["schema", "task"])).properties.imageVariations);
  assert.equal((await f.cli(["tasks", "create", "--typo"])).code, 2);
  assert.throws(
    () => parseArgs(["tasks", "get", "id", "--apply"]),
    /not supported/,
  );
  assert.throws(
    () => validateInput({ prompt: "x", take: 2 }, schemas.task),
    /Unknown field/,
  );
  assert.throws(
    () => validateInput({ name: "food", values: [3] }, schemas.variable),
    /wrong type/,
  );
  // Duplicate url option is rejected by the parser, while client URL validation
  // is exercised through execute without the fixture's local option.
  const { execute } = await import("../cli/run.js");
  await assert.rejects(
    execute(parseArgs(["status", "--url", "https://example.com"])),
    /local HTTP/,
  );
  const status = await f.ok(["status"]);
  assert.equal(status.service, "frame");
  assert.equal(status.connection.configured, true);
  assert.equal((await f.ok(["connection", "check"])).videoAvailable, true);
});

test("CLI creates English drafts from UTF-8 stdin, patches revisions, resolves lists and plans without starting", async (t) => {
  const f = await fixture(t);
  let task = await f.ok(["tasks", "create", "--file", "-"], {
    name: "רעיון חדש",
    prompt: "A {animal} on a {color} rug.",
    variables: [
      { name: "animal", values: ["cat", "dog"] },
      { name: "color", values: ["red", "blue", "green"] },
    ],
  });
  assert.equal(task.takes, 1);
  assert.equal(task.status, "draft");
  assert.equal(task.stats.total, 6);
  assert.match(task.uiUrl, /#task\/.*\/references$/);
  const plan = await f.ok(["tasks", "plan", task.id]);
  assert.equal(plan.valid, true);
  assert.equal(plan.counts.initialVideos, 6);
  assert.equal(f.calls.length, 0);
  const patch = f.jsonFile("patch with spaces.json", {
    takes: 2,
    settings: { resolution: "1080p" },
  });
  task = await f.ok([
    "tasks",
    "update",
    task.id,
    "--file",
    patch,
    "--revision",
    String(task.revision),
  ]);
  assert.equal(task.settings.model, "gemini-omni-1.1-flash");
  assert.equal(
    (
      await f.cli([
        "tasks",
        "update",
        task.id,
        "--file",
        patch,
        "--revision",
        "1",
      ])
    ).code,
    3,
  );
  const values = f.jsonFile("values.json", { animal: "cat", color: "blue" });
  assert.equal(
    (await f.ok(["tasks", "resolve", task.id, "--values", values])).videoPrompt,
    "A cat on a blue rug.",
  );
  const bad = f.jsonFile("bad-values.json", { animal: "bird", color: "blue" });
  assert.equal(
    (await f.cli(["tasks", "resolve", task.id, "--values", bad])).code,
    2,
  );
  const exported = await f.ok(["tasks", "export", task.id]);
  assert.equal(exported.config.takes, 2);
  assert.ok(!exported.config.stats && !exported.config.id);
  assert.equal(f.store.list("jobs").length, 0);
});

test("CLI imports references, edits image/video variables, previews and samples, and runs the same task the UI reads", async (t) => {
  const f = await fixture(t);
  const task = await f.ok([
    "tasks",
    "create",
    "--name",
    "Container demo",
    "--prompt",
    "Animate with orbit.",
  ]);
  const localFile = path.join(f.dir, "original image.png");
  fs.writeFileSync(localFile, png);
  const source = await f.ok([
    "assets",
    "import",
    localFile,
    "--task",
    task.id,
    "--role",
    "Starting frame",
  ]);
  assert.ok(fs.existsSync(source.file));
  const image = f.jsonFile("image.json", {
    prompt: "Replace contents with fresh fruit. Preserve the containers.",
  });
  await f.ok(["tasks", "image", task.id, source.id, "--file", image]);
  const suggestion = await f.ok([
    "variables",
    "suggest",
    task.id,
    "--target",
    "image",
    "--source",
    source.id,
    "--text",
    "fresh fruit",
  ]);
  assert.equal(suggestion.name, "food");
  await f.ok([
    "variables",
    "make",
    task.id,
    "food",
    "--target",
    "image",
    "--source",
    source.id,
    "--text",
    "fresh fruit",
    "--instructions",
    suggestion.instructions,
  ]);
  await f.ok(["variables", "make", task.id, "camera", "--text", "orbit"]);
  await f.ok(["variables", "set", task.id, "camera", "--file", "-"], {
    values: ["orbit", "pan"],
  });
  await f.ok([
    "variables",
    "generate",
    task.id,
    "food",
    "--count",
    "1",
    "--apply",
  ]);
  const proposal = await f.ok([
    "tasks",
    "improve",
    task.id,
    "--target",
    "image",
    "--source",
    source.id,
  ]);
  assert.equal(proposal.applied, false);
  assert.match(proposal.prompt, /\{food\}/);
  let plan = await f.ok(["tasks", "plan", task.id]);
  assert.equal(plan.counts.referenceImages, 2);
  assert.equal(plan.counts.initialVideos, 4);
  const values = f.jsonFile("values.json", {
    food: "fresh fruit",
    camera: "orbit",
  });
  const preview = await f.ok([
    "frames",
    "preview",
    task.id,
    "--source",
    source.id,
    "--values",
    values,
    "--wait",
    "--timeout",
    "10",
    "--interval",
    "1",
  ]);
  assert.equal(preview[0].status, "completed");
  assert.ok(fs.existsSync(preview[0].asset.file));
  assert.match(preview[0].asset.mediaUrl, /\/api\/assets\/.*\/file$/);
  const samples = await f.ok([
    "samples",
    "generate",
    task.id,
    "--values",
    values,
    "--wait",
    "--timeout",
    "10",
    "--interval",
    "1",
  ]);
  assert.equal(
    samples[0].asset.metadata.generatedReferences[0].assetId,
    preview[0].asset.id,
  );
  plan = await f.ok(["tasks", "plan", task.id]);
  assert.equal(plan.counts.completedCombinationTakes, 0);
  assert.equal(plan.counts.reusableImages, 1);
  await f.ok(["tasks", "start", task.id, "--revision", String(plan.revision)]);
  for (
    let i = 0;
    i < 100 && f.store.get("tasks", task.id).status !== "complete";
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(f.store.get("tasks", task.id).status, "complete");
  const results = await f.ok([
    "tasks",
    "results",
    task.id,
    "--kind",
    "production",
  ]);
  assert.equal(results.assets.length, 4);
  assert.ok(
    results.assets.every(
      (a) => path.isAbsolute(a.file) && a.mediaUrl.startsWith(f.url),
    ),
  );
  const state = await (await fetch(`${f.url}/api/state`)).json();
  assert.equal(state.tasks.find((t) => t.id === task.id).stats.completed, 4);
  const duplicate = await f.ok(["tasks", "duplicate", task.id]);
  assert.equal(duplicate.status, "draft");
  assert.equal(duplicate.stats.frames.ready, 0);
  assert.notEqual(duplicate.imageVariations[0].sourceAssetId, source.id);
});

test("CLI studio generation/refinement, attachment and guarded deletion use managed files", async (t) => {
  const f = await fixture(t);
  const config = f.jsonFile("studio.json", {
    prompt: "A still life",
    model: "gemini-3.1-flash-image",
  });
  const suggestion = await f.ok(["studio", "optimize", "--file", config]);
  assert.equal(suggestion.applied, false);
  const [job] = await f.ok([
    "studio",
    "generate",
    "--file",
    config,
    "--wait",
    "--timeout",
    "10",
    "--interval",
    "1",
  ]);
  const asset = await f.ok(["assets", "get", job.assetId]);
  assert.equal(asset.id, job.assetId);
  const task = await f.ok(["tasks", "create"]);
  const attached = await f.ok([
    "assets",
    "attach",
    asset.id,
    "--task",
    task.id,
    "--role",
    "Visual style",
  ]);
  assert.notEqual(attached.id, asset.id);
  assert.equal(
    f.store.get("tasks", task.id).references[0].role,
    "Visual style",
  );
  assert.equal((await f.cli(["assets", "delete", asset.id])).code, 2);
  await f.ok(["assets", "delete", asset.id, "--confirm"]);
  assert.equal(fs.existsSync(asset.file), false);
  assert.equal(fs.existsSync(attached.file), true);
  assert.equal((await f.cli(["tasks", "delete", task.id])).code, 2);
  await f.ok(["tasks", "delete", task.id, "--confirm"]);
  assert.equal(fs.existsSync(attached.file), true);
});

test("CLI assistance cannot overwrite a task edited in the UI while Gemini responds", async (t) => {
  const f = await fixture(t);
  const task = await f.ok(["tasks", "create", "--prompt", "Original prompt"]);
  f.provider.improve = async (input) => {
    const changed = f.store.get("tasks", input.id);
    changed.prompt = "New UI direction";
    changed.revision++;
    f.store.put("tasks", changed);
    return "Older optimized direction";
  };
  const conflict = await f.cli(["tasks", "improve", task.id, "--apply"]);
  assert.equal(conflict.code, 3);
  assert.equal(f.store.get("tasks", task.id).prompt, "New UI direction");
  assert.equal(f.store.list("jobs").length, 0);
});

test("CLI wait exposes failures and timeouts, and protects uncertain retries", async (t) => {
  const f = await fixture(t);
  const makeJob = (status) => {
    const job = f.worker.createJob({
      kind: "studio",
      snapshot: {
        prompt: "Test",
        values: {},
        settings: { model: "gemini-3.1-flash-image" },
        references: [],
      },
    });
    job.status = status;
    job.nextAttemptAt = Date.now() + 60000;
    f.store.put("jobs", job);
    return job;
  };
  const failed = makeJob("failed");
  assert.equal(
    (await f.cli(["jobs", "wait", failed.id, "--timeout", "1"])).code,
    5,
  );
  const active = makeJob("submitted");
  const timed = await f.cli([
    "jobs",
    "wait",
    active.id,
    "--timeout",
    "1",
    "--interval",
    "1",
  ]);
  assert.equal(timed.code, 4);
  assert.equal(timed.error.details.state[0].id, active.id);
  assert.equal(f.store.get("jobs", active.id).status, "submitted");
  const uncertain = makeJob("uncertain");
  assert.notEqual((await f.cli(["jobs", "retry", uncertain.id])).code, 0);
  await f.ok([
    "jobs",
    "reconcile",
    uncertain.id,
    "--provider-id",
    "known-operation",
  ]);
  assert.equal(f.store.get("jobs", uncertain.id).providerId, "known-operation");
});
