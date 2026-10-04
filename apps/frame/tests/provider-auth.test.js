import test from "node:test";
import assert from "node:assert/strict";
import { GeminiProvider, ProviderError } from "../server/provider.js";

for (const submit of [false, true]) {
  test(`authentication conflict on ${submit ? "submission" : "polling"} explains recovery and sends only one credential`, async (t) => {
    const key = "AQ." + "test-only_".repeat(5);
    const provider = new GeminiProvider(key);
    let calls = 0;
    t.mock.method(globalThis, "fetch", async (url, options) => {
      calls++;
      assert.equal(new URL(url).search, "");
      assert.equal(options.headers["x-goog-api-key"], key);
      assert.equal(Object.hasOwn(options.headers, "Authorization"), false);
      assert.equal(options.method, submit ? "POST" : "GET");
      return new Response(
        JSON.stringify({
          error: {
            message:
              "Multiple authentication credentials received. Please pass only one.",
          },
        }),
        { status: 400 },
      );
    });
    await assert.rejects(
      submit
        ? provider.request("interactions", { model: "test-only" })
        : provider.retrieve("saved-id"),
      (error) => {
        assert.ok(error instanceof ProviderError);
        assert.equal(error.status, 400);
        assert.equal(error.retryable, false);
        assert.match(error.message, /Some AQ\.|some AQ\./);
        assert.match(error.message, /check its status before retrying/);
        assert.ok(!error.message.includes(key));
        return true;
      },
    );
    assert.equal(calls, 1);
  });
}

test("unrelated Google validation errors retain their actual explanation", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          error: { message: "Invalid aspect ratio" },
        }),
        { status: 400 },
      ),
  );
  await assert.rejects(new GeminiProvider("test-only").retrieve("saved-id"), {
    message: "Invalid aspect ratio",
    retryable: false,
  });
});
