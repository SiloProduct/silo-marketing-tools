import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Store } from "../server/store.js";
import { Worker } from "../server/worker.js";
import { createApp } from "../server/app.js";

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-api-")),
    store = new Store(path.join(dir, ".frame")),
    provider = {
      key: "private-test-key",
      submit: async () => ({ id: "operation", status: "completed" }),
      retrieve: async () => ({ id: "operation", status: "completed" }),
      download: async () => ({
        bytes: Buffer.from("test-media"),
        mime: "video/mp4",
      }),
    },
    worker = new Worker(store, provider),
    app = createApp(store, worker, provider, {
      envPath: path.join(dir, ".env"),
    });
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const call = (method, url) =>
    request(app)[method](`/api${url}`).set("x-frame-request", "1");
  return { store, provider, worker, app, call };
}

test("connection setup accepts dotted keys without returning the credential", async (t) => {
  const { call, provider } = fixture(t);
  const key = "AQ." + "test-only_".repeat(35);
  const response = await call("post", "/connection/key")
    .send({ key })
    .expect(200);
  assert.deepEqual(response.body, { configured: true });
  assert.equal(provider.key, key);
  assert.ok(!JSON.stringify((await call("get", "/state")).body).includes(key));
  provider.request = async (route) => {
    assert.equal(route, "models");
    assert.equal(provider.key, key);
    return { models: [] };
  };
  await call("post", "/connection/check").send({}).expect(200);
  await call("post", "/connection/key")
    .send({ key: key + "\nINJECTED=value" })
    .expect(400);
  assert.equal(provider.key, key);
});
test("multiple image APIs target the chosen source, preserve roles, and duplicate without generated history", async (t) => {
  const { call, store, provider, worker } = fixture(t);
  let task = (await call("post", "/tasks").send({})).body;
  const roles = [
    "Subject appearance",
    "Visual style",
    "Composition",
    "Starting frame",
    "Ending frame",
  ];
  const sources = roles.map((role) =>
    store.addAsset({
      taskId: task.id,
      name: role,
      mime: "image/png",
      bytes: Buffer.from("image"),
    }),
  );
  task = (
    await call("put", `/tasks/${task.id}`)
      .send({
        ...task,
        prompt: "Animate with {camera}",
        references: sources.map((a, i) => ({ assetId: a.id, role: roles[i] })),
        imageVariations: sources.map((a, i) => ({
          enabled: true,
          sourceAssetId: a.id,
          prompt: `Edit image ${i} with {theme}`,
        })),
        variables: [
          { name: "theme", values: ["summer", "winter"] },
          { name: "camera", values: ["orbit", "pan"] },
        ],
        takes: 1,
      })
      .expect(200)
  ).body;
  assert.equal(task.stats.total, 4);
  assert.equal(task.stats.frames.total, 10);
  provider.improve = async (input, feedback, refs) => {
    assert.equal(input.prompt, task.imageVariations[1].prompt);
    assert.equal(input.assistanceContext.imagePrompts.length, 5);
    assert.equal(input.assistanceContext.imagePrompts[1].role, "Visual style");
    assert.equal(refs[0].asset.id, sources[1].id);
    return input.prompt;
  };
  await call("post", `/tasks/${task.id}/improve`)
    .send({ target: "image", sourceAssetId: sources[1].id })
    .expect(200);
  provider.suggestVariable = async (input, selection, refs) => {
    assert.equal(input.prompt, task.imageVariations[1].prompt);
    assert.equal(refs[0].asset.id, sources[1].id);
    return { name: "style", instructions: "Distinct looks" };
  };
  await call("post", `/tasks/${task.id}/suggest-variable`)
    .send({
      target: "image",
      sourceAssetId: sources[1].id,
      start: 0,
      end: 4,
      text: "Edit",
      revision: task.revision,
    })
    .expect(200);
  await call("post", `/tasks/${task.id}/improve`)
    .send({ target: "image", sourceAssetId: "not-attached" })
    .expect(400);
  provider.submit = async () => ({ id: "image", status: "completed" });
  provider.download = async () => ({
    bytes: Buffer.from("generated"),
    mime: "image/png",
  });
  const preview = (
    await call("post", `/tasks/${task.id}/frame-preview`)
      .send({ sourceAssetId: sources[1].id, values: { theme: "summer" } })
      .expect(200)
  ).body;
  assert.equal(preview.snapshot.parentId, sources[1].id);
  await worker.tick();
  const duplicate = (
    await call("post", `/tasks/${task.id}/action`)
      .send({ action: "duplicate" })
      .expect(200)
  ).body;
  assert.equal(duplicate.imageVariations.length, 5);
  for (let i = 0; i < 5; i++) {
    assert.notEqual(duplicate.imageVariations[i].sourceAssetId, sources[i].id);
    assert.equal(
      duplicate.references[i].assetId,
      duplicate.imageVariations[i].sourceAssetId,
    );
    assert.equal(duplicate.references[i].role, roles[i]);
  }
  assert.equal(duplicate.stats.frames.ready, 0);
  assert.equal(
    store.list("jobs").filter((j) => j.taskId === duplicate.id).length,
    0,
  );
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "start" })
    .expect(200);
});
test("API autosave uses revision checks and never exposes credentials", async (t) => {
  const { call } = fixture(t);
  const created = await call("post", "/tasks")
    .send({ example: true })
    .expect(201);
  const task = created.body;
  const saved = await call("put", `/tasks/${task.id}`)
    .send({ ...task, name: "Saved title" })
    .expect(200);
  assert.equal(saved.body.revision, 2);
  await call("put", `/tasks/${task.id}`)
    .send({ ...task, name: "Stale update" })
    .expect(409);
  const state = await call("get", "/state").expect(200);
  assert.equal(state.body.tasks[0].name, "Saved title");
  assert.ok(!JSON.stringify(state.body).includes("private-test-key"));
});
test("API checks local origins and requires the app header for writes", async (t) => {
  const { app, call } = fixture(t);
  await request(app).post("/api/tasks").send({}).expect(403);
  await call("post", "/tasks")
    .set("Origin", "https://untrusted.example")
    .send({})
    .expect(403);
  await call("get", "/state").set("Host", "untrusted.example").expect(403);
});
test("registered media in hidden storage loads, supports video seeking, and reports missing files", async (t) => {
  const { call, store } = fixture(t);
  const imageBytes = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
    "base64",
  );
  const image = store.addAsset({
    name: "Preview",
    mime: "image/png",
    bytes: imageBytes,
  });
  const loaded = await call("get", `/assets/${image.id}/file`).expect(200);
  assert.match(loaded.headers["content-type"], /^image\/png/);
  assert.deepEqual(loaded.body, imageBytes);

  const videoBytes = Buffer.from(
    "00000018667479706d703432000000006d70343269736f6d",
    "hex",
  );
  const video = store.addAsset({
    name: "Playback",
    mime: "video/mp4",
    bytes: videoBytes,
  });
  const ranged = await call("get", `/assets/${video.id}/file`)
    .set("Range", "bytes=4-11")
    .buffer(true)
    .parse((res, done) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => done(null, Buffer.concat(chunks)));
    })
    .expect(206);
  assert.match(ranged.headers["content-type"], /^video\/mp4/);
  assert.equal(
    ranged.headers["content-range"],
    `bytes 4-11/${videoBytes.length}`,
  );
  assert.deepEqual(ranged.body, videoBytes.subarray(4, 12));

  fs.unlinkSync(image.file);
  const missing = await call("get", `/assets/${image.id}/file`).expect(404);
  assert.match(missing.headers["content-type"], /^application\/json/);
  assert.match(missing.body.error, /missing/i);
  await call("get", "/assets/unknown/file").expect(404);
});
test("samples are durable before a run; uploads are copied and duplicates get a new folder", async (t) => {
  const { call, store, worker } = fixture(t);
  const task = (await call("post", "/tasks").send({ example: true })).body;
  const file = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
    "base64",
  );
  const a = (
    await call("post", "/assets/upload")
      .field("taskId", task.id)
      .attach("file", file, "reference.png")
      .expect(200)
  ).body;
  assert.ok(fs.existsSync(a.file));
  const jobs = (
    await call("post", `/tasks/${task.id}/samples`)
      .send({
        values: {
          animal: "ginger cat",
          color: "sage green",
          house_pet_behaviour: "stretching after a nap",
        },
        count: 1,
      })
      .expect(200)
  ).body;
  await worker.tick();
  assert.equal(store.get("jobs", jobs[0].id).status, "completed");
  assert.equal(store.get("tasks", task.id).runId, null);
  const copy = (
    await call("post", `/tasks/${task.id}/action`)
      .send({ action: "duplicate" })
      .expect(200)
  ).body;
  assert.notEqual(copy.folder, task.folder);
  assert.equal(copy.stats.completed, 0);
  assert.equal(copy.references.length, 1);
  assert.notEqual(copy.references[0].assetId, a.id);
});
test("editing running tasks is rejected, pause permits edits, and complete takes can be repeated explicitly", async (t) => {
  const { call, worker, store } = fixture(t);
  const task = (await call("post", "/tasks").send({ example: true })).body;
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "start" })
    .expect(200);
  await call("put", `/tasks/${task.id}`).send(task).expect(409);
  await worker.tick();
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "pause" })
    .expect(200);
  const current = store.get("tasks", task.id);
  await call("put", `/tasks/${task.id}`)
    .send({ ...current, prompt: current.prompt + " Warm light." })
    .expect(200);
  const original = store.list("jobs")[0];
  const repeated = (
    await call("post", `/jobs/${original.id}/repeat`).send({}).expect(200)
  ).body;
  assert.equal(repeated.manual, true);
  await worker.tick();
  assert.equal(store.get("jobs", repeated.id).status, "completed");
  assert.equal(store.get("tasks", task.id).status, "paused");
  assert.deepEqual(repeated.snapshot, original.snapshot);
});
test("deleting a task can keep its files; permanent deletion is explicit", async (t) => {
  const { call } = fixture(t);
  const keep = (await call("post", "/tasks").send({})).body;
  await call("delete", `/tasks/${keep.id}`)
    .send({ deleteMedia: false })
    .expect(200);
  assert.ok(fs.existsSync(keep.folder));
  const remove = (await call("post", "/tasks").send({})).body;
  await call("delete", `/tasks/${remove.id}`)
    .send({ deleteMedia: true })
    .expect(200);
  assert.equal(fs.existsSync(remove.folder), false);
});
test("missing credentials block generation but allow local drafting", async (t) => {
  const { call, provider } = fixture(t);
  provider.key = null;
  const task = (
    await call("post", "/tasks").send({ example: true }).expect(201)
  ).body;
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "start" })
    .expect(409);
  await call("post", "/studio/generate").send({ prompt: "A vase" }).expect(409);
});
test("invalid inputs are rejected before a generation is submitted", async (t) => {
  const { call } = fixture(t);
  await call("post", "/assets/upload")
    .attach("file", Buffer.from("<script>bad</script>"), "pretend.png")
    .expect(400);
  await call("post", "/studio/generate")
    .send({ prompt: "hello", model: "unknown" })
    .expect(400);
  await call("put", "/settings")
    .send({ outputDir: "relative/path" })
    .expect(400);
});

test("studio deletion requires confirmation, deletes media and metadata, and keeps task copies and other versions", async (t) => {
  const { call, store, worker } = fixture(t);
  const asset = store.addAsset({
    name: "Delete me",
    mime: "image/png",
    bytes: Buffer.from("fixture"),
  });
  const task = (await call("post", "/tasks").send({})).body;
  const copy = (
    await call("post", `/assets/${asset.id}/attach`)
      .send({ taskId: task.id })
      .expect(200)
  ).body;
  const child = store.addAsset({
    name: "Another version",
    mime: "image/png",
    bytes: Buffer.from("child"),
    parentId: asset.id,
  });
  const job = worker.createJob({
    kind: "studio",
    snapshot: { prompt: "Fixture", settings: {}, references: [] },
  });
  store.put("jobs", { ...job, status: "completed", assetId: asset.id });
  await call("delete", `/assets/${asset.id}`).send({}).expect(400);
  assert.ok(fs.existsSync(asset.file));
  await call("delete", `/assets/${asset.id}`)
    .send({ confirmDelete: true })
    .expect(200);
  assert.equal(fs.existsSync(asset.file), false);
  assert.equal(fs.existsSync(`${asset.file}.json`), false);
  assert.equal(store.get("assets", asset.id), null);
  assert.equal(store.get("jobs", job.id).assetDeleted, true);
  assert.equal(store.get("jobs", job.id).assetId, null);
  assert.ok(fs.existsSync(copy.file));
  assert.ok(fs.existsSync(child.file));
  assert.equal(store.get("tasks", task.id).references[0].assetId, copy.id);
  await call("delete", `/assets/${copy.id}`)
    .send({ confirmDelete: true })
    .expect(409);
  await call("get", `/assets/${asset.id}/file`).expect(404);
});

test("studio deletion blocks assets needed for unfinished refinement and tolerates already missing files", async (t) => {
  const { call, store, worker } = fixture(t);
  const asset = store.addAsset({
    name: "Source",
    mime: "image/png",
    bytes: Buffer.from("fixture"),
  });
  const job = worker.createJob({
    kind: "studio",
    snapshot: {
      parentId: asset.id,
      prompt: "Refine",
      references: [{ assetId: asset.id }],
    },
  });
  for (const status of ["pending", "submitted", "failed", "uncertain"]) {
    store.put("jobs", { ...job, status });
    await call("delete", `/assets/${asset.id}`)
      .send({ confirmDelete: true })
      .expect(409);
    assert.ok(fs.existsSync(asset.file));
  }
  store.put("jobs", { ...job, status: "completed" });
  fs.unlinkSync(asset.file);
  await call("delete", `/assets/${asset.id}`)
    .send({ confirmDelete: true })
    .expect(200);
  assert.equal(fs.existsSync(`${asset.file}.json`), false);
});

test("variable suggestions validate selections and preserve the saved task", async (t) => {
  const { call, store, provider } = fixture(t);
  const task = (await call("post", "/tasks").send({})).body;
  const saved = (
    await call("put", `/tasks/${task.id}`)
      .send({ ...task, prompt: "Food: fruits and vegetables beside {device}." })
      .expect(200)
  ).body;
  let calls = 0;
  provider.suggestVariable = async (input, selection) => {
    calls++;
    assert.equal(input.prompt, saved.prompt);
    assert.equal(selection.text, "fruits and vegetables");
    return {
      name: "food_items",
      instructions: "Photogenic foods for containers.",
    };
  };
  const body = {
    start: 6,
    end: 27,
    text: "fruits and vegetables",
    revision: saved.revision,
  };
  const url = `/tasks/${task.id}/suggest-variable`;
  const result = await call("post", url).send(body).expect(200);
  assert.equal(result.body.name, "food_items");
  for (const patch of [
    { start: -1 },
    { end: 10000 },
    { text: "different" },
    { start: 0.5 },
    { start: 36, end: 42, text: "device" },
  ])
    await call("post", url)
      .send({ ...body, ...patch })
      .expect(400);
  await call("post", url)
    .send({ ...body, revision: 0 })
    .expect(409);
  assert.equal(calls, 1);
  assert.equal(store.get("tasks", saved.id).prompt, saved.prompt);
  assert.equal(store.list("jobs").length, 0);
  provider.suggestVariable = async () => {
    store.put("tasks", { ...saved, revision: saved.revision + 1 });
    return { name: "food", instructions: "Foods" };
  };
  await call("post", url).send(body).expect(409);
});

test("task optimization forwards references and returns a suggestion without changing the draft or creating jobs", async (t) => {
  const { call, store, provider } = fixture(t);
  const task = (await call("post", "/tasks").send({})).body;
  const asset = store.addAsset({
    taskId: task.id,
    name: "Kitchen",
    mime: "image/png",
    bytes: Buffer.from("image"),
  });
  const saved = (
    await call("put", `/tasks/${task.id}`)
      .send({
        ...task,
        prompt: "פירות וירקות",
        references: [{ assetId: asset.id, role: "Starting frame" }],
      })
      .expect(200)
  ).body;
  provider.improve = async (input, feedback, refs) => {
    assert.equal(input.prompt, saved.prompt);
    assert.equal(input.settings.model, saved.settings.model);
    assert.equal(feedback, "Keep it simple");
    assert.equal(refs[0].asset.file, asset.file);
    assert.equal(refs[0].role, "Starting frame");
    return "Fruit and vegetables.";
  };
  const result = await call("post", `/tasks/${task.id}/improve`)
    .send({ feedback: "Keep it simple" })
    .expect(200);
  assert.equal(result.body.prompt, "Fruit and vegetables.");
  assert.equal(store.get("tasks", task.id).prompt, saved.prompt);
  assert.equal(store.get("tasks", task.id).revision, saved.revision);
  assert.equal(store.list("jobs").length, 0);
});

test("studio optimization validates input, forwards the selected model and refinement context, and creates no jobs", async (t) => {
  const { call, provider, store } = fixture(t);
  const inputs = [];
  provider.optimizeStudio = async (input) => {
    inputs.push(input);
    return "A blue fish.";
  };
  for (const model of [
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-omni-1.1-flash",
  ]) {
    const result = await call("post", "/studio/optimize")
      .send({ prompt: "דג כחול", model })
      .expect(200);
    assert.equal(result.body.prompt, "A blue fish.");
    assert.equal(inputs.at(-1).model, model);
    assert.equal(inputs.at(-1).prompt, "דג כחול");
  }
  const parent = store.addAsset({
    name: "Original",
    mime: "image/png",
    bytes: Buffer.from("image"),
    metadata: { prompt: "A red fish" },
  });
  await call("post", "/studio/optimize")
    .send({
      prompt: "Make it blue",
      model: "gemini-3.1-flash-image",
      parentId: parent.id,
    })
    .expect(200);
  assert.equal(inputs.at(-1).parent.metadata.prompt, "A red fish");
  for (const body of [
    { prompt: "", model: "gemini-3-pro-image" },
    { prompt: "A fish", model: "unknown" },
    { prompt: "x".repeat(30001), model: "gemini-3-pro-image" },
  ])
    await call("post", "/studio/optimize").send(body).expect(400);
  await call("post", "/studio/optimize")
    .send({ prompt: "Blue", model: "gemini-3-pro-image", parentId: "missing" })
    .expect(404);
  assert.equal(store.list("jobs").length, 0);
  provider.key = null;
  await call("post", "/studio/optimize")
    .send({ prompt: "A fish", model: "gemini-3-pro-image" })
    .expect(409);
});

test("studio references reach image and video jobs, optimization and output history", async (t) => {
  const { call, store, worker, provider } = fixture(t);
  const a = store.addAsset({
    name: "Subject",
    mime: "image/png",
    bytes: Buffer.from("image"),
  });
  const b = store.addAsset({
    name: "Style",
    mime: "image/png",
    bytes: Buffer.from("style"),
  });
  const references = [
    { assetId: a.id, role: "Subject appearance" },
    { assetId: b.id, role: "Visual style" },
  ];
  let sent;
  provider.submit = async (snapshot, refs) => {
    sent = refs;
    return { id: "ok", status: "completed" };
  };
  for (const model of [
    "gemini-3.1-flash-image",
    "gemini-3-pro-image",
    "gemini-omni-1.1-flash",
  ]) {
    const job = (
      await call("post", "/studio/generate")
        .send({ prompt: "Use the subject and style", model, references })
        .expect(200)
    ).body;
    assert.equal(job.snapshot.parentId, null);
    assert.equal(job.snapshot.references.length, 2);
    await worker.tick();
    assert.deepEqual(
      sent.map((r) => r.asset.id),
      [a.id, b.id],
    );
    const done = store.get("jobs", job.id);
    assert.equal(done.status, "completed");
    const asset = store.get("assets", done.assetId);
    assert.equal(asset.metadata.references[1].role, "Visual style");
    assert.equal(asset.metadata.references[1].name, "Style");
  }
  provider.optimizeStudio = async (input) => {
    assert.deepEqual(
      input.references.map((r) => r.asset.id),
      [a.id, b.id],
    );
    return "A clarified prompt";
  };
  await call("post", "/studio/optimize")
    .send({ prompt: "Use these", model: "gemini-3.1-flash-image", references })
    .expect(200);
});

test("studio validates references before creating a job and protects task assets in use", async (t) => {
  const { call, store } = fixture(t);
  const task = (await call("post", "/tasks").send({})).body;
  const image = store.addAsset({
    taskId: task.id,
    name: "Frame",
    mime: "image/png",
    bytes: Buffer.from("image"),
  });
  const clip = store.addAsset({
    name: "Long clip",
    mime: "video/mp4",
    duration: 10,
    bytes: Buffer.from("video"),
  });
  const base = { prompt: "Create something", model: "gemini-omni-1.1-flash" };
  for (const references of [
    null,
    [{ assetId: "missing", role: "Visual style" }],
    [{ assetId: image.id, role: "invalid" }],
    [{ assetId: image.id, role: "Ending frame" }],
    [{ assetId: clip.id, role: "Subject appearance" }],
    [
      { assetId: image.id, role: "Composition" },
      { assetId: image.id, role: "Visual style" },
    ],
  ])
    await call("post", "/studio/generate")
      .send({ ...base, references })
      .expect(400);
  await call("post", "/studio/generate")
    .send({
      ...base,
      model: "gemini-3-pro-image",
      references: [{ assetId: clip.id, role: "Visual style" }],
    })
    .expect(400);
  const flash = await call("post", "/studio/generate")
    .send({
      ...base,
      model: "gemini-3.1-flash-image",
      references: [{ assetId: clip.id, role: "Visual style" }],
    })
    .expect(200);
  assert.equal(flash.body.snapshot.references[0].mime, "video/mp4");
  await call("post", "/studio/generate")
    .send({
      ...base,
      references: [{ assetId: image.id, role: "Starting frame" }],
    })
    .expect(200);
  await call("delete", `/tasks/${task.id}`)
    .send({ deleteMedia: true })
    .expect(409);
  assert.ok(fs.existsSync(image.file));
  fs.unlinkSync(clip.file);
  await call("post", "/studio/generate")
    .send({
      ...base,
      model: "gemini-3.1-flash-image",
      references: [{ assetId: clip.id, role: "Visual style" }],
    })
    .expect(400);
});

test("image refinement defaults to automatic proportions, accepts manual overrides, and video rejects auto", async (t) => {
  const { call, store } = fixture(t);
  const parent = store.addAsset({
    name: "Original proportions",
    mime: "image/png",
    bytes: Buffer.from("fixture"),
  });
  for (const model of ["gemini-3.1-flash-image", "gemini-3-pro-image"]) {
    const base = { prompt: "Sharpen details", parentId: parent.id, model };
    const automatic = (
      await call("post", "/studio/generate").send(base).expect(200)
    ).body;
    assert.equal(automatic.snapshot.settings.aspectRatio, "auto");
    assert.equal(automatic.snapshot.references[0].assetId, parent.id);
    const manual = (
      await call("post", "/studio/generate")
        .send({ ...base, aspectRatio: "4:3" })
        .expect(200)
    ).body;
    assert.equal(manual.snapshot.settings.aspectRatio, "4:3");
    await call("post", "/studio/generate")
      .send({ ...base, aspectRatio: "auto" })
      .expect(200);
  }
  await call("post", "/studio/generate")
    .send({
      prompt: "A scene",
      model: "gemini-omni-1.1-flash",
      aspectRatio: "auto",
    })
    .expect(400);
});

test("starting-frame APIs save separate templates, assist with both prompts, preview, share frames, duplicate and edit paused work", async (t) => {
  const { call, store, worker, provider } = fixture(t);
  let task = (await call("post", "/tasks").send({})).body;
  const source = store.addAsset({
    taskId: task.id,
    name: "Original",
    mime: "image/png",
    bytes: Buffer.from("image"),
  });
  task = (
    await call("put", `/tasks/${task.id}`)
      .send({
        ...task,
        prompt: "Move with {camera}",
        references: [{ assetId: source.id, role: "Starting frame" }],
        startingFrame: {
          enabled: true,
          sourceAssetId: source.id,
          prompt: "Replace contents with {food}",
          settings: {
            model: "gemini-3.1-flash-image",
            aspectRatio: "auto",
            imageSize: "1K",
          },
        },
        variables: [
          { name: "food", values: ["apples", "berries"] },
          { name: "camera", values: ["orbit", "pan"] },
        ],
        takes: 1,
      })
      .expect(200)
  ).body;
  assert.equal(task.stats.total, 4);
  assert.equal(task.stats.frames.total, 2);
  provider.improve = async (input, feedback, refs) => {
    assert.equal(input.settings.model, "gemini-3.1-flash-image");
    assert.equal(input.assistanceContext.videoPrompt, task.prompt);
    assert.equal(refs[0].asset.id, source.id);
    assert.equal(refs[0].role, "Asset to refine");
    return "Replace the contents with {food}. Preserve everything else.";
  };
  await call("post", `/tasks/${task.id}/improve`)
    .send({ target: "starting-frame" })
    .expect(200);
  provider.suggestVariable = async (input, selection, refs) => {
    assert.equal(input.prompt, task.startingFrame.prompt);
    assert.equal(input.assistanceContext.videoPrompt, task.prompt);
    assert.equal(refs[0].asset.id, source.id);
    return { name: "objects", instructions: "Food containers" };
  };
  await call("post", `/tasks/${task.id}/suggest-variable`)
    .send({
      target: "starting-frame",
      start: 8,
      end: 16,
      text: "contents",
      revision: task.revision,
    })
    .expect(200);
  provider.submit = async (snapshot) => ({
    id: "done",
    status: "completed",
    image: snapshot.settings.model.includes("image"),
  });
  provider.download = async (r) => ({
    bytes: Buffer.from("generated"),
    mime: r.image ? "image/png" : "video/mp4",
  });
  const preview = (
    await call("post", `/tasks/${task.id}/frame-preview`)
      .send({ values: { food: "apples" } })
      .expect(200)
  ).body;
  await worker.tick();
  const samples = (
    await call("post", `/tasks/${task.id}/samples`)
      .send({ values: { food: "apples", camera: "orbit" }, count: 1 })
      .expect(200)
  ).body;
  await worker.tick();
  assert.equal(
    store.get("jobs", samples[0].id).snapshot.frameJobId,
    preview.id,
  );
  await call("post", `/tasks/${task.id}/samples`)
    .send({ values: { camera: "orbit" } })
    .expect(400);
  const duplicate = (
    await call("post", `/tasks/${task.id}/action`)
      .send({ action: "duplicate" })
      .expect(200)
  ).body;
  assert.notEqual(duplicate.startingFrame.sourceAssetId, source.id);
  assert.equal(
    duplicate.references[0].assetId,
    duplicate.startingFrame.sourceAssetId,
  );
  assert.equal(duplicate.stats.frames.ready, 0);
  assert.equal(
    store.list("jobs").filter((j) => j.taskId === duplicate.id).length,
    0,
  );
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "start" })
    .expect(200);
  await worker.tick(); // first video waiting for preview frame
  await worker.tick(); // first production video completed
  await worker.tick(); // next video waiting for same frame
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "pause" })
    .expect(200);
  const completed = store
    .list("jobs")
    .find(
      (j) =>
        j.taskId === task.id &&
        j.kind === "production" &&
        j.status === "completed",
    );
  const before = structuredClone(completed);
  task = store.get("tasks", task.id);
  const replacement = (
    await call("post", `/tasks/${task.id}/frame-preview`)
      .send({ values: { food: "apples" }, regenerate: true })
      .expect(200)
  ).body;
  await worker.tick();
  assert.equal(replacement.snapshot.frameVersion, 2);
  assert.deepEqual(store.get("jobs", completed.id), before);
  const pending = store
    .list("jobs")
    .find(
      (j) =>
        j.taskId === task.id &&
        j.kind === "production" &&
        j.status === "waiting",
    );
  assert.equal(pending.snapshot.frameJobId, replacement.id);
  task = (
    await call("put", `/tasks/${task.id}`)
      .send({
        ...task,
        imageVariations: [
          {
            ...task.imageVariations[0],
            prompt: "Change to {food}; keep lighting",
          },
        ],
      })
      .expect(200)
  ).body;
  assert.equal(store.get("jobs", pending.id).status, "cancelled");
  assert.ok(task.startingFrame.versions.length);
  await call("post", `/tasks/${task.id}/action`)
    .send({ action: "resume" })
    .expect(200);
  for (let i = 0; i < 30; i++) await worker.tick();
  assert.deepEqual(store.get("jobs", completed.id), before);
  assert.equal(
    store
      .list("jobs")
      .filter(
        (j) =>
          j.taskId === task.id &&
          j.kind === "production" &&
          j.status === "completed",
      ).length,
    4,
  );
});
