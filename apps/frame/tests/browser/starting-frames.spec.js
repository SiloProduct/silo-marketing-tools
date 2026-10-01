import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOd0AAAAASUVORK5CYII=",
  "base64",
);

test("multiple reference roles have independent prompt editors and one shared variation screen", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Import task references").setInputFiles([
    { name: "Subject.png", mimeType: "image/png", buffer: png },
    { name: "Style.png", mimeType: "image/png", buffer: png },
  ]);
  const rows = page.locator(".reference-row");
  await expect(rows).toHaveCount(2);
  await rows
    .nth(0)
    .getByLabel("Use this as")
    .selectOption("Subject appearance");
  await rows.nth(1).getByLabel("Use this as").selectOption("Visual style");
  for (const row of [rows.nth(0), rows.nth(1)])
    await row.getByLabel("Vary this image").check();
  await expect(
    page.getByRole("textbox", { name: "Image edit prompt", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  await page
    .getByRole("textbox", { name: "Video prompt", exact: true })
    .fill("Animate the subject with {camera}.");
  await page.getByRole("tab", { name: /Image 1 · Subject appearance/ }).click();
  const editor = page.getByRole("textbox", {
    name: "Image edit prompt",
    exact: true,
  });
  await editor.fill(
    "Replace the contents with {food}. Preserve everything else.",
  );
  await page.getByRole("tab", { name: /Image 2 · Visual style/ }).click();
  await editor.fill("Change the palette to warm tones. Preserve composition.");
  await editor.evaluate((el) => {
    el.focus();
    el.setSelectionRange(22, 32);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page
    .getByRole("button", { name: "Make variable", exact: true })
    .click();
  let secondSource;
  await page.route("**/suggest-variable", (route) => {
    const body = route.request().postDataJSON();
    expect(body.target).toBe("image");
    expect(body.text).toBe("warm tones");
    expect(body.sourceAssetId).toBeTruthy();
    secondSource = body.sourceAssetId;
    return route.fulfill({
      json: {
        name: "palette",
        instructions: "Distinct cohesive color palettes",
      },
    });
  });
  await page.getByRole("button", { name: "Suggest with Gemini" }).click();
  await expect(page.getByLabel("Variable name")).toHaveValue("palette");
  await page
    .getByRole("button", { name: "Create variable", exact: true })
    .click();
  await expect(editor).toHaveValue(
    "Change the palette to {palette}. Preserve composition.",
  );
  await page.route("**/improve", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      target: "image",
      sourceAssetId: secondSource,
    });
    return route.fulfill({
      json: {
        prompt: "Use {palette} for the palette. Preserve the composition.",
      },
    });
  });
  await page
    .getByRole("button", { name: "Improve prompt", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use this prompt", exact: true })
    .click();
  await expect(editor).toHaveValue(
    "Use {palette} for the palette. Preserve the composition.",
  );
  await page.getByRole("tab", { name: /Image 1/ }).click();
  await expect(editor).toHaveValue(
    "Replace the contents with {food}. Preserve everything else.",
  );
  await page.getByRole("tab", { name: /Image 1/ }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Image 2/ })).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze())
      .violations,
  ).toEqual([]);
  await page.screenshot({
    path: "test-results/multi-image-prompt.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to variations" }).click();
  for (const [name, values] of [
    ["food", "apples\nberries"],
    ["palette", "cool tones\nneutral tones"],
    ["camera", "orbit\npan"],
  ]) {
    await page
      .locator(".variable-tabs button")
      .filter({ hasText: name })
      .click();
    await page.getByLabel("Add your own ideas").fill(values);
    await page
      .getByRole("button", { name: "Add to list", exact: true })
      .click();
  }
  await expect(page.locator(".combination-note")).toContainText("48");
  await page.screenshot({
    path: "test-results/multi-image-variations.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Continue to samples" }).click();
  await expect(
    page.getByRole("button", { name: "Preview image", exact: true }),
  ).toHaveCount(2);
  await page.route("**/frame-preview", (route) => {
    expect(route.request().postDataJSON().sourceAssetId).toBe(secondSource);
    return route.fulfill({ json: {} });
  });
  await page
    .getByRole("button", { name: "Preview image", exact: true })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Continue to production" }).click();
  await expect(
    page.getByText("5 reference images → 48 videos", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("5 reference images → 48 videos", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 References" }).click();
  await expect(rows.nth(0).getByLabel("Vary this image")).toBeChecked();
  await expect(rows.nth(1).getByLabel("Vary this image")).toBeChecked();
});

test("starting-frame setup, Gemini suggestions, shared variables, previews and production counts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page
    .getByLabel("Import task references")
    .setInputFiles({ name: "Kitchen.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Use this as").selectOption("Starting frame");
  await page.getByLabel("Vary this image").check();
  await expect(
    page.getByLabel("Image edit prompt", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  await page.getByRole("tab", { name: /Image 1/ }).click();
  const framePrompt = page.getByLabel("Image edit prompt", {
    exact: true,
  });
  await framePrompt.fill(
    "Replace contents with fresh fruit. Keep everything else unchanged.",
  );
  await framePrompt.evaluate((el) => {
    el.focus();
    el.setSelectionRange(22, 33);
    el.dispatchEvent(new Event("select", { bubbles: true }));
  });
  await page
    .getByRole("button", { name: "Make variable", exact: true })
    .click();
  await page.route("**/suggest-variable", (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      target: "image",
      text: "fresh fruit",
    });
    return route.fulfill({
      json: {
        name: "food",
        instructions: "Photogenic foods that fit in clear containers.",
      },
    });
  });
  await page.getByRole("button", { name: "Suggest with Gemini" }).click();
  await expect(page.getByLabel("Variable name")).toHaveValue("food");
  await page
    .getByRole("button", { name: "Create variable", exact: true })
    .click();
  await expect(framePrompt).toHaveValue(
    "Replace contents with {food}. Keep everything else unchanged.",
  );
  await page.getByRole("tab", { name: /Video prompt/ }).click();
  await page
    .getByRole("textbox", { name: "Video prompt", exact: true })
    .fill("A smooth {camera} around the setup with {food}.");
  await page.getByRole("button", { name: "Continue to variations" }).click();
  await expect(page.locator(".stage-label")).toHaveText("Both");
  await page
    .getByLabel("Add your own ideas")
    .fill("berries\npeppers\ncarrots\nsnacks");
  await page.getByRole("button", { name: "Add to list", exact: true }).click();
  await page
    .locator(".variable-tabs button")
    .filter({ hasText: "camera" })
    .click();
  await page.getByLabel("Add your own ideas").fill("orbit\npan\npush in");
  await page.getByRole("button", { name: "Add to list", exact: true }).click();
  await page.getByRole("button", { name: "Continue to samples" }).click();
  await expect(page.getByLabel("food", { exact: true })).toHaveValue(
    "fresh fruit",
  );
  await expect(page.getByLabel("camera", { exact: true })).toHaveValue("orbit");
  const before = await (await page.request.get("/api/state")).json();
  const task =
    before.tasks.find(
      (t) => t.id === page.url().split("/task/")[1]?.split("/")[0],
    ) || before.tasks[0];
  const source = before.assets.find(
    (a) => a.id === task.startingFrame.sourceAssetId,
  );
  let ready = false;
  const frame = {
    ...source,
    id: "preview-frame",
    kind: "frame",
    name: "Starting frame · fresh fruit",
    metadata: {
      values: { food: "fresh fruit" },
      prompt:
        "Replace contents with fresh fruit. Keep everything else unchanged.",
      frameVersion: 1,
    },
  };
  const job = {
    id: "preview-job",
    taskId: task.id,
    kind: "frame",
    status: "completed",
    assetId: frame.id,
    snapshot: {
      prompt: frame.metadata.prompt,
      values: frame.metadata.values,
      parentId: source.id,
      settings: task.startingFrame.settings,
      frameVersion: 1,
    },
  };
  await page.route("**/api/state", async (route) => {
    const state = await (await route.fetch()).json();
    if (ready) {
      state.assets.unshift(frame);
      state.jobs.unshift(job);
      state.tasks.find((t) => t.id === task.id).stats.frames.ready = 1;
    }
    await route.fulfill({ json: state });
  });
  await page.route("**/frame-preview", (route) => {
    expect(route.request().postDataJSON().values.food).toBe("fresh fruit");
    ready = true;
    return route.fulfill({ json: job });
  });
  await page
    .getByRole("button", { name: "Preview image", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "View reference image 1" }),
  ).toBeVisible();
  await page.route("**/samples", (route) => {
    expect(route.request().postDataJSON().values).toEqual({
      food: "fresh fruit",
      camera: "orbit",
    });
    return route.fulfill({ json: [] });
  });
  await page
    .getByRole("button", { name: "Generate sample", exact: true })
    .click();
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(axe.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/starting-frame-samples.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Continue to production" }).click();
  await expect(
    page.getByRole("heading", { name: "60 videos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("5 reference images → 60 videos", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "60 videos", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "1 References" }).click();
  await expect(page.getByLabel("Vary this image")).toBeChecked();
  await expect(framePrompt).toHaveCount(0);
  await page.getByRole("button", { name: "Continue to prompt" }).click();
  await page.getByRole("tab", { name: /Image 1/ }).click();
  await expect(framePrompt).toHaveValue(/\{food\}/);
  const promptAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(promptAccessibility.violations).toEqual([]);
  await page.screenshot({
    path: "test-results/starting-frame-editor.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
