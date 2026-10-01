import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GeminiProvider } from "../server/provider.js";
import { TEXT_MODEL } from "../server/domain.js";

const task = {
  prompt: "Containers of fruits and vegetables beside {device}.",
  variables: [{ name: "device", instructions: "Kitchen appliances" }],
};
const selection = { start: 14, end: 35, text: "fruits and vegetables" };
test("variable suggestions receive full prompt, exact selection, existing variables and reference bytes", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-variable-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "ref.png");
  fs.writeFileSync(file, "image-bytes");
  const provider = new GeminiProvider("test");
  let body;
  provider.request = async (_route, input) => {
    body = input;
    return {
      outputs: [
        {
          type: "text",
          text: JSON.stringify({
            name: "food_items",
            instructions: " Photogenic foods suitable for food containers. ",
          }),
        },
      ],
    };
  };
  assert.deepEqual(
    await provider.suggestVariable(task, selection, [
      {
        asset: { file, name: "Kitchen", mime: "image/png" },
        role: "Starting frame",
      },
    ]),
    {
      name: "food_items",
      instructions: "Photogenic foods suitable for food containers.",
    },
  );
  assert.equal(body.model, TEXT_MODEL);
  assert.equal(
    body.input[1].data,
    Buffer.from("image-bytes").toString("base64"),
  );
  const context = JSON.parse(body.input.at(-1).text.split("Context: ")[1]);
  assert.equal(context.prompt, task.prompt);
  assert.equal(context.selectedText, selection.text);
  assert.deepEqual(context.existingVariables, task.variables);
  assert.equal(context.references[0].purpose, "Starting frame");
});
test("variable suggestions reject malformed responses and avoid existing names", async () => {
  const provider = new GeminiProvider("test");
  for (const result of [
    "not json",
    "null",
    "{}",
    JSON.stringify({ name: "bad name", instructions: "Foods" }),
    JSON.stringify({ name: "food", instructions: " " }),
    JSON.stringify({ name: "food", instructions: "x".repeat(2001) }),
  ]) {
    provider.text = async () => result;
    await assert.rejects(
      provider.suggestVariable(task, selection),
      /usable variable/,
    );
  }
  provider.text = async () =>
    JSON.stringify({ name: "device", instructions: "Devices" });
  assert.equal(
    (await provider.suggestVariable(task, selection)).name,
    "device_2",
  );
});
