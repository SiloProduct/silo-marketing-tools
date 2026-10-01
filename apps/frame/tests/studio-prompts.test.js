import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GeminiProvider } from "../server/provider.js";
import { IMAGE_MODELS, VIDEO_MODEL, TEXT_MODEL } from "../server/domain.js";

for (const model of [...IMAGE_MODELS, VIDEO_MODEL]) {
  test(`studio optimizer uses text assistance with intent and translation rules for ${model}`, async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-prompt-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, "reference.png");
    fs.writeFileSync(file, "fixture-image");
    const provider = new GeminiProvider("test");
    let body;
    provider.request = async (route, request) => {
      assert.equal(route, "interactions");
      body = request;
      return {
        status: "completed",
        outputs: [{ type: "text", text: "  A blue fish.  " }],
      };
    };
    const answer = await provider.optimizeStudio({
      prompt: "דג כחול",
      model,
      parent: {
        name: "Original",
        file,
        mime: "image/png",
        metadata: { prompt: "An existing fish" },
      },
      references: [
        {
          role: "Visual style",
          asset: { name: "Style", file, mime: "image/png" },
        },
      ],
    });
    assert.equal(answer, "A blue fish.");
    assert.equal(body.model, TEXT_MODEL);
    assert.equal(body.store, false);
    assert.equal(body.input.filter((p) => p.type === "image").length, 2);
    assert.match(body.input[2].text, /Reference 1: Style/);
    body.input = body.input
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    assert.match(body.input, /Visual style/);
    assert.match(
      body.input,
      /Translate non-English instructions into fluent English/,
    );
    assert.match(body.input, /Do not invent/);
    assert.match(body.input, /literal quoted text/);
    assert.match(body.input, /Refine an existing asset/);
    assert.match(body.input, /An existing fish/);
    assert.match(body.input, /דג כחול/);
    if (model === VIDEO_MODEL)
      assert.match(body.input, /event order and timing/);
    else assert.match(body.input, /composition/);
  });
}

test("optimizer rejects empty or oversized responses without changing any stored prompt", async () => {
  const provider = new GeminiProvider("test");
  for (const output of ["  ", "x".repeat(30001)]) {
    provider.text = async () => output;
    await assert.rejects(
      provider.optimizeStudio({ prompt: "Fish", model: IMAGE_MODELS[0] }),
      /usable prompt/,
    );
  }
});

test("task optimizer sends actual reference media, roles and feedback with shared guidance", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-task-prompt-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "reference.png");
  const bytes = Buffer.from("reference-image-bytes");
  fs.writeFileSync(file, bytes);
  const provider = new GeminiProvider("test");
  let body;
  provider.request = async (_route, request) => {
    body = request;
    return {
      outputs: [
        {
          type: "text",
          text: "  {subject} beside {subject}, with fruit and vegetables.  ",
        },
      ],
    };
  };
  const task = {
    prompt: "{subject} ליד {subject}, פירות וירקות",
    settings: { model: VIDEO_MODEL },
  };
  const original = structuredClone(task);
  const result = await provider.improve(task, "Keep the movement slow", [
    {
      asset: { name: "Kitchen", mime: "image/png", file },
      role: "Starting frame",
    },
  ]);
  assert.equal(
    result,
    "{subject} beside {subject}, with fruit and vegetables.",
  );
  assert.deepEqual(task, original);
  assert.equal(body.model, TEXT_MODEL);
  assert.equal(body.store, false);
  assert.equal(body.input[1].data, bytes.toString("base64"));
  assert.equal(body.input[1].type, "image");
  assert.match(
    body.input[0].text,
    /Reference 1: Kitchen.*Starting frame.*first frame/,
  );
  const instruction = body.input.at(-1).text;
  for (const rule of [
    /Translate non-English/,
    /Do not invent/,
    /Retain every explicitly requested/,
    /EXACT placeholder names/,
    /original semantic role/,
    /starting-frame reference/,
    /orbit moves around/,
    /event order and timing/,
  ])
    assert.match(instruction, rule);
  const context = JSON.parse(instruction.split("Brief and context: ")[1]);
  assert.equal(context.originalPrompt, task.prompt);
  assert.equal(context.requestedChanges, "Keep the movement slow");
  assert.deepEqual(context.references, [
    { number: 1, name: "Kitchen", purpose: "Starting frame" },
  ]);
});

test("task optimizer rejects renamed, resolved, added or repeated variables and unusable responses", async () => {
  const provider = new GeminiProvider("test");
  const task = {
    prompt: "{animal} beside {animal}",
    settings: { model: VIDEO_MODEL },
  };
  for (const output of [
    "{pet} beside {pet}",
    "A cat beside a cat",
    "{animal} beside {animal} on {color}",
    "{animal}",
    "{animal} beside {animal} and {animal}",
  ]) {
    provider.text = async () => output;
    await assert.rejects(provider.improve(task, ""), /changed a variable/);
  }
  for (const output of ["  ", "x".repeat(30001)]) {
    provider.text = async () => output;
    await assert.rejects(provider.improve(task, ""), /usable prompt/);
  }
});
