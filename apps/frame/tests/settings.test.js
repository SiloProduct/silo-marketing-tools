import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveApiKey } from "../server/local-settings.js";

test("local key setup preserves unrelated env settings and replaces the old key", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-key-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".env");
  fs.writeFileSync(
    file,
    "PORT=4310\nGEMINI_API_KEY=old\nFRAME_DATA_DIR=.frame\n",
  );
  saveApiKey(file, "test-key-with-at-least-twenty-characters");
  const content = fs.readFileSync(file, "utf8");
  assert.match(content, /PORT=4310/);
  assert.match(content, /FRAME_DATA_DIR=.frame/);
  assert.match(
    content,
    /GEMINI_API_KEY=test-key-with-at-least-twenty-characters/,
  );
  assert.ok(!content.includes("=old"));
  if (process.platform !== "win32")
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.throws(() => saveApiKey(file, "bad\nINJECTED=value"), /valid/);
});
