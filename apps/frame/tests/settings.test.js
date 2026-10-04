import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveApiKey } from "../server/local-settings.js";
import { parse } from "dotenv";

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
  assert.throws(() => saveApiKey(file, "bad\nINJECTED=value"), /line breaks/);
});

test("dotted auth keys longer than the old limit round-trip through env storage", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-auth-key-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".env");
  const key = "AQ." + "test-only_".repeat(35);
  fs.writeFileSync(file, "PORT=4310\nGEMINI_API_KEY=old\n");
  assert.equal(saveApiKey(file, `  ${key}  `), key);
  assert.deepEqual(parse(fs.readFileSync(file)), {
    PORT: "4310",
    GEMINI_API_KEY: key,
  });
});

test("malformed key input preserves the existing private configuration", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "frame-bad-key-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, ".env");
  const original = "PORT=4310\nGEMINI_API_KEY=existing-test-only-key\n";
  fs.writeFileSync(file, original);
  for (const value of [
    null,
    {},
    "",
    "short",
    "x".repeat(2049),
    "AQ." + "x".repeat(20) + "\nOTHER=value",
    "AQ." + "x".repeat(20) + "\rOTHER=value",
    "AQ." + "x".repeat(20) + "\0",
    "AQ." + "x".repeat(20) + " space",
    "AQ." + "x".repeat(20) + "#comment",
    '"' + "AQ." + "x".repeat(20) + '"',
  ]) {
    assert.throws(() => saveApiKey(file, value), /complete Google AI Studio/);
    assert.equal(fs.readFileSync(file, "utf8"), original);
    assert.deepEqual(fs.readdirSync(dir), [".env"]);
  }
});
