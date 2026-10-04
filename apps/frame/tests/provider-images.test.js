import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GeminiProvider } from "../server/provider.js";
import { IMAGE_MODELS } from "../server/domain.js";
import { Store } from "../server/store.js";
import { Worker } from "../server/worker.js";

const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=";
const snapshot = (model) => ({
  prompt: "a fish!",
  settings: { model, aspectRatio: "16:9", imageSize: "1K" },
  references: [],
  values: {},
});

for (const model of IMAGE_MODELS) {
  test(`${model} generation and refinement omit the unsupported background flag`, async () => {
    const provider = new GeminiProvider("test-only");
    const requests = [];
    provider.request = async (route, body) => {
      requests.push({ route, body });
      return { id: "image-interaction", status: "completed" };
    };
    await provider.submit(snapshot(model));
    await provider.submit({
      ...snapshot(model),
      previousInteractionId: "previous-image",
    });
    for (const { route, body } of requests) {
      assert.equal(route, "interactions");
      assert.equal(Object.hasOwn(body, "background"), false);
      assert.equal(body.store, true);
      assert.deepEqual(
        body.generation_config,
        model === "gemini-3.1-flash-image"
          ? { thinking_level: "high" }
          : undefined,
      );
      assert.deepEqual(body.response_format, {
        type: "image",
        aspect_ratio: "16:9",
        image_size: "1K",
      });
    }
    assert.equal(requests[1].body.previous_interaction_id, "previous-image");
  });
}

test("video generation keeps its mode without an image thinking setting", async () => {
  const provider = new GeminiProvider("test-only");
  provider.request = async (_route, body) => {
    assert.equal(body.background, true);
    assert.deepEqual(body.generation_config, {
      video_config: { task: "text_to_video" },
    });
    return {};
  };
  await provider.submit({
    prompt: "a fish!",
    settings: {
      model: "gemini-omni-1.1-flash",
      aspectRatio: "16:9",
      resolution: "720p",
      task: "text_to_video",
    },
  });
});

test("local worker saves a synchronous image response without polling or resubmission", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-image-test-"));
  const store = new Store(dir);
  t.after(() => {
    store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const provider = new GeminiProvider("test-only");
  let complete,
    requests = 0;
  provider.request = async (route, body) => {
    requests++;
    assert.equal(route, "interactions");
    assert.equal(body.background, undefined);
    return new Promise((resolve) => {
      complete = () =>
        resolve({
          id: "image-interaction",
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [{ type: "image", mime_type: "image/png", data: png }],
            },
          ],
        });
    });
  };
  const worker = new Worker(store, provider);
  const job = worker.createJob({
    kind: "studio",
    snapshot: snapshot(IMAGE_MODELS[0]),
  });
  const processing = worker.tick();
  assert.equal(store.get("jobs", job.id).status, "submitting");
  await worker.tick(); // A second timer tick cannot submit duplicate work.
  assert.equal(requests, 1);
  complete();
  await processing;
  const saved = store.get("jobs", job.id);
  assert.equal(saved.status, "completed");
  assert.equal(saved.providerId, "image-interaction");
  const asset = store.get("assets", saved.assetId);
  assert.equal(asset.mime, "image/png");
  assert.deepEqual(fs.readFileSync(asset.file), Buffer.from(png, "base64"));
  assert.equal(asset.metadata.prompt, "a fish!");
  assert.equal(requests, 1);
});

for (const model of [...IMAGE_MODELS, "gemini-omni-1.1-flash"]) {
  test(`${model} sends chosen reference bytes and preserves extra inputs in a refinement turn`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-refs-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "ref.png");
    fs.writeFileSync(file, Buffer.from(png, "base64"));
    const refs = [
      {
        role: "Asset to refine",
        asset: { id: "parent", name: "Original", mime: "image/png", file },
      },
      {
        role: "Visual style",
        asset: { id: "style", name: "Style", mime: "image/png", file },
      },
    ];
    const provider = new GeminiProvider("test");
    let body;
    provider.request = async (_route, request) => {
      body = request;
      return {};
    };
    await provider.submit(snapshot(model), refs.slice(1));
    assert.equal(body.input[1].data, png);
    assert.match(body.input[0].text, /Visual style/);
    await provider.submit(
      {
        ...snapshot(model),
        parentId: "parent",
        previousInteractionId: "previous",
      },
      refs,
    );
    assert.equal(body.previous_interaction_id, "previous");
    assert.equal(body.input.filter((p) => p.type === "image").length, 1);
    assert.match(body.input[0].text, /Reference 1: Style/);
    assert.equal(body.input.at(-1).text, "a fish!");
  });
}

for (const model of IMAGE_MODELS) {
  test(`${model} automatic format omits the API aspect ratio for initial and conversational image requests`, async () => {
    const provider = new GeminiProvider("test");
    const requests = [];
    provider.request = async (_route, body) => {
      requests.push(body);
      return {};
    };
    const automatic = {
      ...snapshot(model),
      settings: {
        ...snapshot(model).settings,
        aspectRatio: "auto",
        imageSize: "2K",
      },
    };
    await provider.submit(automatic);
    await provider.submit({ ...automatic, previousInteractionId: "original" });
    for (const body of requests) {
      assert.equal(Object.hasOwn(body.response_format, "aspect_ratio"), false);
      assert.equal(body.response_format.image_size, "2K");
    }
    assert.equal(requests[1].previous_interaction_id, "original");
    await provider.submit({
      ...automatic,
      settings: { ...automatic.settings, aspectRatio: "4:3" },
    });
    assert.equal(requests[2].response_format.aspect_ratio, "4:3");
  });
}
