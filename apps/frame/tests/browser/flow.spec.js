import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("first-time flow: example, autosave, variations, sample preview, production, studio, results", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your next great take." }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Explore an example" }).click();
  await expect(page.getByLabel("Video prompt")).toHaveValue(/\{animal\}/);
  await page.getByLabel("Task name").fill("Wildlife study");
  await page
    .getByLabel("Video prompt")
    .fill(
      "A {animal} on a {color} rug, {house_pet_behaviour}. Soft cinematic daylight.",
    );
  await page.getByRole("button", { name: "Continue to variations" }).click();
  await expect(
    page.getByRole("heading", { name: "One prompt. Many directions." }),
  ).toBeVisible();
  await page.getByLabel("Add your own ideas").fill("rabbit\nhamster");
  await page.getByRole("button", { name: "Add to list", exact: true }).click();
  await page.getByRole("button", { name: "Continue to samples" }).click();
  await expect(page.getByLabel("animal", { exact: true })).toHaveValue(
    "ginger cat",
  );
  await expect(
    page.getByText(
      "A ginger cat on a sage green rug, stretching after a nap. Soft cinematic daylight.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Generate sample", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Add your Gemini API key",
  );
  await page.getByRole("button", { name: "Dismiss notification" }).click();
  await page.getByRole("button", { name: "Continue to production" }).click();
  await expect(
    page.getByRole("heading", { name: "96 videos", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/production.png",
    fullPage: true,
  });
  await page.reload();
  await expect(page.getByLabel("Task name")).toHaveValue("Wildlife study");
  await page.getByRole("button", { name: "1 References" }).click();
  await page.getByRole("button", { name: /Create a reference/ }).click();
  await expect(
    page.getByRole("heading", { name: "Reference studio", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/studio.png", fullPage: true });
  await page.getByRole("button", { name: "Back to your task" }).click();
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your takes, all together." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("accessible empty library and setup screens; laptop and narrow layouts fit", async ({
  page,
}) => {
  await page.goto("/#studio");
  await expect(
    page.getByRole("heading", { name: "Reference studio", exact: true }),
  ).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-small.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Studio settings" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Gemini suggests editable variable directions that persist into Variations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  const prompt = page.getByLabel("Video prompt");
  await prompt.fill(
    "Containers of fruits and vegetables on a kitchen counter.",
  );
  await prompt.evaluate((el) => {
    el.focus();
    el.setSelectionRange(14, 35);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page
    .getByRole("button", { name: "Make variable", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Make this part dynamic" });
  await page.route("**/suggest-variable", async (route) => {
    expect(route.request().postDataJSON().text).toBe("fruits and vegetables");
    await route.fulfill({
      json: {
        name: "food_items",
        instructions: "Photogenic food items that fit in food containers.",
      },
    });
  });
  await dialog.getByRole("button", { name: "Suggest with Gemini" }).click();
  await expect(dialog.getByLabel("Variable name")).toHaveValue("food_items");
  await expect(dialog.getByLabel("Directions for new values")).toHaveValue(
    /Photogenic food/,
  );
  await dialog
    .getByLabel("Directions for new values")
    .fill("Colorful, fresh foods suitable for food containers.");
  await expect(prompt).toHaveValue(
    "Containers of fruits and vegetables on a kitchen counter.",
  );
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page.screenshot({ path: "test-results/variable-suggestion.png" });
  await dialog
    .getByRole("button", { name: "Create variable", exact: true })
    .click();
  await expect(prompt).toHaveValue(
    "Containers of {food_items} on a kitchen counter.",
  );
  await page.getByRole("button", { name: "Continue to variations" }).click();
  await expect(page.getByLabel("Instructions for food items")).toHaveValue(
    "Colorful, fresh foods suitable for food containers.",
  );
  await expect(page.getByLabel("food items value 1")).toHaveValue(
    "fruits and vegetables",
  );
  await page.reload();
  await expect(page.getByLabel("Instructions for food items")).toHaveValue(
    "Colorful, fresh foods suitable for food containers.",
  );
});

test("variable suggestion failure keeps manual setup usable and cancellation ignores late results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  const prompt = page.getByLabel("Video prompt");
  await prompt.fill("A cat.");
  const select = async () => {
    await prompt.evaluate((el) => {
      el.focus();
      el.setSelectionRange(2, 5);
      el.dispatchEvent(new Event("select", { bubbles: true }));
    });
    await page
      .getByRole("button", { name: "Make variable", exact: true })
      .click();
  };
  await select();
  await page.route("**/suggest-variable", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Gemini is unavailable. Try again." },
    }),
  );
  await page.getByRole("button", { name: "Suggest with Gemini" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Gemini is unavailable",
  );
  await expect(page.getByLabel("Variable name")).toHaveValue("cat");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.unroute("**/suggest-variable");
  let complete;
  const pending = new Promise((resolve) => {
    complete = resolve;
  });
  await page.route("**/suggest-variable", async (route) => {
    await pending;
    await route.fulfill({
      json: { name: "late_name", instructions: "Late instructions" },
    });
  });
  await select();
  const request = page.waitForRequest("**/suggest-variable");
  await page.getByRole("button", { name: "Suggest with Gemini" }).click();
  await request;
  await expect(
    page.getByRole("button", { name: "Create variable", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await select();
  const response = page.waitForResponse("**/suggest-variable");
  complete();
  await response;
  await expect(page.getByLabel("Variable name")).toHaveValue("cat");
  await page.getByLabel("Variable name").fill("animal");
  await page
    .getByRole("button", { name: "Create variable", exact: true })
    .click();
  await expect(prompt).toHaveValue("A {animal}.");
});

test("variables can be created through selection and reordered with keyboard-accessible buttons", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  const prompt = page.getByLabel("Video prompt");
  await prompt.fill("A cat rests on a rug.");
  await prompt.press("ControlOrMeta+A");
  await prompt.press("ArrowLeft");
  await prompt.press("ArrowRight");
  await prompt.press("ArrowRight");
  await prompt.press("Shift+ArrowRight");
  await prompt.press("Shift+ArrowRight");
  await prompt.press("Shift+ArrowRight");
  await page
    .getByRole("button", { name: "Make variable", exact: true })
    .click();
  await page.getByLabel("Variable name").fill("animal");
  await page
    .getByRole("button", { name: "Create variable", exact: true })
    .click();
  await expect(prompt).toHaveValue("A {animal} rests on a rug.");
  await page.getByRole("button", { name: "Continue to variations" }).click();
  await page.getByLabel("Add your own ideas").fill("dog");
  await page.getByRole("button", { name: "Add to list", exact: true }).click();
  await page
    .getByRole("button", { name: "Move value 2 up", exact: true })
    .click();
  await expect(page.getByLabel("animal value 1", { exact: true })).toHaveValue(
    "dog",
  );
  await page.getByRole("button", { name: "Continue to samples" }).click();
  await expect(
    page.getByRole("heading", { name: "Try a few takes first." }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("animal", { exact: true })).toHaveValue("dog");
});

test("task editor remains accessible across all five sections", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  for (const label of [
    "1 References",
    "2 Prompt",
    "3 Variations",
    "4 Samples",
    "5 Production",
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "step");
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        screen: label,
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
});

test("studio prompt optimization offers review, editing, undo and model-aware requests", async ({
  page,
}) => {
  const requests = [];
  await page.route("**/api/studio/optimize", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { prompt: "A blue fish swimming slowly." } });
  });
  await page.goto("/#studio");
  const prompt = page.getByLabel("What do you have in mind?");
  await prompt.fill("דג כחול שוחה לאט");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByRole("button", { name: "Optimize prompt", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Review optimized prompt" });
  await expect(dialog).toBeVisible();
  expect(requests[0]).toMatchObject({
    model: "gemini-omni-1.1-flash",
    prompt: "דג כחול שוחה לאט",
    parentId: null,
  });
  await expect(prompt).toHaveValue("דג כחול שוחה לאט");
  await page.screenshot({
    path: "test-results/studio-optimize.png",
    fullPage: true,
  });
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await dialog
    .getByLabel("Optimized prompt")
    .fill("A blue fish swimming slowly, as requested.");
  await dialog.getByRole("button", { name: "Use optimized prompt" }).click();
  await expect(prompt).toHaveValue(
    "A blue fish swimming slowly, as requested.",
  );
  await page.getByRole("button", { name: "Restore original prompt" }).click();
  await expect(prompt).toHaveValue("דג כחול שוחה לאט");
  await page
    .getByRole("button", { name: "Optimize prompt", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Keep original" }).click();
  await expect(prompt).toHaveValue("דג כחול שוחה לאט");
  await page.reload();
  await expect(prompt).toHaveValue("דג כחול שוחה לאט");
});

test("studio deletion confirms local file removal and clears the selected preview", async ({
  page,
}) => {
  await page.goto("/#studio");
  await page.getByLabel("Import studio assets").setInputFiles({
    name: "Disposable preview.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  const remove = page.getByRole("button", {
    name: "Delete Disposable preview",
    exact: true,
  });
  await expect(remove).toBeVisible();
  await remove.click();
  const dialog = page.getByRole("dialog", { name: "Delete this asset?" });
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Keep asset" }).click();
  await expect(remove).toBeVisible();
  await remove.click();
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({
    path: "test-results/studio-delete.png",
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Delete asset and file" }).click();
  await expect(remove).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "It starts with a picture in your mind.",
    }),
  ).toBeVisible();
});

test("late or failed optimization never overwrites a newer studio prompt", async ({
  page,
}) => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  await page.route("**/api/studio/optimize", async (route) => {
    signalStarted();
    await gate;
    await route.fulfill({ json: { prompt: "A fish." } });
  });
  await page.goto("/#studio");
  const prompt = page.getByLabel("What do you have in mind?");
  await prompt.fill("Fish");
  await page
    .getByRole("button", { name: "Optimize prompt", exact: true })
    .click();
  await started;
  await prompt.fill("A different idea");
  release();
  await expect(
    page.getByRole("button", { name: "Use optimized prompt" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Keep original" }).click();
  await expect(prompt).toHaveValue("A different idea");
  await page.unroute("**/api/studio/optimize");
  await page.route("**/api/studio/optimize", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Gemini is temporarily unavailable. Try again." },
    }),
  );
  await page
    .getByRole("button", { name: "Optimize prompt", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "temporarily unavailable",
  );
  await expect(prompt).toHaveValue("A different idea");
  await expect(
    page.getByRole("button", { name: "Optimize prompt", exact: true }),
  ).toBeEnabled();
});

test("studio selects multiple references for images and videos, imports directly, and persists purposes", async ({
  page,
}) => {
  const generations = [],
    optimizations = [];
  await page.route("**/api/studio/generate", async (route) => {
    generations.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.route("**/api/studio/optimize", async (route) => {
    optimizations.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        prompt:
          "Use reference 1 for the subject and reference 2 for the style.",
      },
    });
  });
  await page.goto("/#studio");
  await page
    .getByRole("button", { name: "Choose references", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Choose generation references",
  });
  const buffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
    "base64",
  );
  await page.getByLabel("Import generation references").setInputFiles([
    { name: "Subject reference.png", mimeType: "image/png", buffer },
    { name: "Style reference.png", mimeType: "image/png", buffer },
  ]);
  await expect(picker.getByRole("status")).toHaveText("2 selected");
  await expect(
    picker.getByRole("button", {
      name: "Use Subject reference as a reference",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(accessibility.violations.map((v) => v.id)).toEqual([]);
  await picker.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByLabel("Purpose of reference 2").selectOption("Visual style");
  await page
    .getByLabel("What do you have in mind?")
    .fill("A fish in this style");
  await page
    .getByRole("button", { name: "Generate image", exact: true })
    .click();
  await expect.poll(() => generations.length).toBe(1);
  expect(generations[0].references.map((r) => r.role)).toEqual([
    "Subject appearance",
    "Visual style",
  ]);
  await page
    .getByRole("button", { name: "Optimize prompt", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Review optimized prompt" }),
  ).toBeVisible();
  expect(optimizations[0].references).toEqual(generations[0].references);
  await page.getByRole("button", { name: "Keep original" }).click();
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await page
    .getByLabel("Purpose of reference 1")
    .selectOption("Starting frame");
  await page
    .getByRole("button", { name: "Generate video", exact: true })
    .click();
  await expect.poll(() => generations.length).toBe(2);
  expect(generations[1].model).toBe("gemini-omni-1.1-flash");
  expect(generations[1].references[0].role).toBe("Starting frame");
  await page.reload();
  await expect(page.getByLabel("Purpose of reference 1")).toHaveValue(
    "Starting frame",
  );
  await expect(
    page.getByRole("button", { name: "Generate video", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Image", exact: true }).click();
  await expect(
    page.getByText(/choose a compatible reference purpose/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate image", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Purpose of reference 1")
    .selectOption("Subject appearance");
  await expect(
    page.getByRole("button", { name: "Generate image", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: "test-results/studio-references.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove reference 1", exact: true })
    .click();
  await expect(page.getByLabel("Purpose of reference 2")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Delete Subject reference", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("image refinement defaults to matching the original and still allows fixed formats", async ({
  page,
}) => {
  const requests = [];
  await page.route("**/api/studio/generate", async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: {} });
  });
  await page.goto("/#studio");
  await page.getByLabel("Import studio assets").setInputFiles({
    name: "Original format.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Refine", exact: true }).click();
  await expect(page.getByLabel("Format", { exact: true })).toHaveValue("auto");
  await expect(
    page.getByRole("option", { name: "Auto · Match original", exact: true }),
  ).toBeAttached();
  await page
    .getByLabel("What would you like to change?")
    .fill("Sharpen the image");
  await page
    .getByRole("button", { name: "Create refined version", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].aspectRatio).toBe("auto");
  expect(requests[0].parentId).toBeTruthy();
  await page.getByLabel("Format", { exact: true }).selectOption("4:3");
  await page
    .getByRole("button", { name: "Create refined version", exact: true })
    .click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].aspectRatio).toBe("4:3");
  await page.getByLabel("Format", { exact: true }).selectOption("auto");
  await page.getByRole("button", { name: "Video", exact: true }).click();
  await expect(page.getByLabel("Format", { exact: true })).toHaveValue("16:9");
  await expect(page.getByRole("option", { name: /Auto/ })).toHaveCount(0);
});
