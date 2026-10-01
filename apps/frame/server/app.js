import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  newTask,
  sanitizeTask,
  validateTask,
  validateFrame,
  uid,
  now,
  VIDEO_MODEL,
  TEXT_MODEL,
  IMAGE_MODELS,
  ROLES,
  countCombinations,
} from "./domain.js";
import {
  taskNames,
  frameNames,
  frameEnabled,
  imageRecipes,
  activeImageRecipes,
  promptNames,
  dependsOnImage,
} from "../shared/task-variables.js";
import { frameStats } from "./frames.js";
import { unsettled } from "./worker.js";
import { saveApiKey, chooseFolder } from "./local-settings.js";
import { studioReferenceIssues } from "../shared/studio-references.js";
import { taskPlan } from "./task-plan.js";

const fail = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
export function createApp(
  store,
  worker,
  provider,
  { envPath = path.resolve(".env") } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.headers.host?.split(":")[0];
    if (!["localhost", "127.0.0.1", "["].includes(host))
      return res
        .status(403)
        .json({ error: "Open Frame using its local address." });
    const origin = req.headers.origin;
    if (origin && origin !== `http://${req.headers.host}`)
      return res
        .status(403)
        .json({ error: "This request did not come from Frame." });
    if (
      req.path.startsWith("/api") &&
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-frame-request"] !== "1"
    )
      return res.status(403).json({ error: "Open Frame to make changes." });
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  const taskOrFail = (id) => {
    const t = store.get("tasks", id);
    if (!t) throw fail("Task not found.", 404);
    return t;
  };
  const requireKey = () => {
    if (!provider.key)
      throw fail(
        "Add your Gemini API key to .env, then restart Frame. Your drafts are ready to use.",
        409,
      );
  };
  const editable = (t) => {
    if (
      ["running", "pausing", "stopping"].includes(t.status) ||
      store.list("jobs").some((j) => j.taskId === t.id && unsettled(j))
    )
      throw fail("Pause and let active videos finish before editing.", 409);
  };
  const checkRevision = (task, revision) => {
    if (revision !== undefined && revision !== task.revision)
      throw fail(
        "This task changed. Read it again and review the updated plan before continuing.",
        409,
      );
  };
  const publicAsset = (a) => ({ ...a, url: `/api/assets/${a.id}/file` });
  const studioReferences = (model, input = [], parent = null) => {
    const errors = studioReferenceIssues(
      model,
      input,
      store.list("assets"),
      parent,
    );
    if (errors.length) throw fail(errors.map((e) => e.message).join(" "));
    return input.map(({ assetId, role }) => {
      const asset = store.get("assets", assetId);
      if (!fs.existsSync(asset.file))
        throw fail(
          `${asset.name}: the local file is missing. Import it again.`,
        );
      return { assetId, role, asset };
    });
  };
  const stats = (t) => {
    const jobs = store
      .list("jobs")
      .filter((j) => j.taskId === t.id && j.kind === "production");
    return {
      ...t,
      stats: {
        completed: jobs.filter((j) => j.status === "completed").length,
        failed: jobs.filter((j) =>
          ["failed", "uncertain", "blocked"].includes(j.status),
        ).length,
        active: jobs.filter(unsettled).length,
        total: countCombinations(t) * t.takes,
        frames: frameStats(t, store),
        preparingFrame: store
          .list("jobs")
          .some((j) => j.taskId === t.id && j.kind === "frame" && unsettled(j)),
        blocked: jobs.filter((j) => j.status === "blocked").length,
      },
    };
  };
  const capabilities = {
    videoModel: VIDEO_MODEL,
    textModel: TEXT_MODEL,
    imageModels: IMAGE_MODELS,
    roles: ROLES,
    aspectRatios: ["16:9", "9:16"],
    resolutions: ["360p", "720p", "1080p", "4k"],
    imageAspectRatios: [
      "auto",
      "1:1",
      "16:9",
      "9:16",
      "4:3",
      "3:4",
      "3:2",
      "2:3",
      "4:5",
      "5:4",
      "21:9",
    ],
    imageSizes: ["1K", "2K", "4K"],
    generationModes: [
      "auto",
      "text_to_video",
      "image_to_video",
      "reference_to_video",
      "edit",
      "extend",
    ],
    limits: {
      takes: 20,
      sampleTakes: 8,
      variables: 12,
      valuesPerVariable: 2000,
      references: 14,
      uploadBytes: 100 * 1024 * 1024,
    },
  };
  const publicJob = ({ responseFile, ...job }) => job;
  const collection = (bucket, req) => {
    const limit = Number(req.query.limit ?? 100),
      offset = Number(req.query.offset ?? 0);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 1000 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      throw fail("Use a limit from 1 to 1000 and a nonnegative offset.");
    return store
      .list(bucket)
      .reverse()
      .filter((item) =>
        ["taskId", "status", "kind", "runId"].every(
          (key) => !req.query[key] || item[key] === req.query[key],
        ),
      )
      .slice(offset, offset + limit);
  };
  app.get("/api/health", (req, res) =>
    res.json({
      service: "frame",
      apiVersion: 1,
      processId: process.pid,
      appRoot: process.cwd(),
      stateDir: store.dir,
      connection: { configured: !!provider.key },
    }),
  );
  app.get("/api/capabilities", (req, res) => res.json(capabilities));
  app.get("/api/settings", (req, res) =>
    res.json({
      ...store.get("config", "settings"),
      connection: { configured: !!provider.key },
    }),
  );
  app.get("/api/tasks", (req, res) =>
    res.json(collection("tasks", req).map(stats)),
  );
  app.get("/api/tasks/:id", (req, res) =>
    res.json(stats(taskOrFail(req.params.id))),
  );
  app.get("/api/tasks/:id/plan", (req, res) =>
    res.json(taskPlan(taskOrFail(req.params.id), store)),
  );
  app.get("/api/jobs", (req, res) =>
    res.json(collection("jobs", req).map(publicJob)),
  );
  app.get("/api/jobs/:id", (req, res) => {
    const job = store.get("jobs", req.params.id);
    if (!job) throw fail("Generation not found.", 404);
    const asset = job.assetId ? store.get("assets", job.assetId) : null;
    res.json({ ...publicJob(job), asset: asset ? publicAsset(asset) : null });
  });
  app.get("/api/assets", (req, res) =>
    res.json(collection("assets", req).map(publicAsset)),
  );
  app.get("/api/assets/:id", (req, res) => {
    const asset = store.get("assets", req.params.id);
    if (!asset) throw fail("Asset not found.", 404);
    res.json(publicAsset(asset));
  });
  app.get("/api/runs", (req, res) => res.json(collection("runs", req)));
  app.get("/api/state", (req, res) =>
    res.json({
      tasks: store.list("tasks").map(stats).reverse(),
      assets: store.list("assets").map(publicAsset).reverse(),
      jobs: store
        .list("jobs")
        .map(({ responseFile, ...j }) => j)
        .reverse(),
      runs: store.list("runs"),
      settings: store.get("config", "settings"),
      connection: { configured: !!provider.key },
      capabilities,
    }),
  );
  app.post("/api/tasks", (req, res) => {
    let t = newTask(String(req.body.name || "Untitled task"));
    if (req.body.example) {
      t.name = "A little domestic wildlife";
      t.prompt =
        "A {animal} on a {color} rug, {house_pet_behaviour}. A single continuous shot, soft window light, natural movement. No dialogue.";
      t.variables = [
        {
          name: "animal",
          values: ["ginger cat", "golden retriever"],
          instructions: "Distinct familiar household pets.",
          expand: false,
        },
        {
          name: "color",
          values: ["sage green", "warm cream", "terracotta"],
          instructions: "Refined, warm interior colors.",
          expand: false,
        },
        {
          name: "house_pet_behaviour",
          values: ["stretching after a nap", "playing with a soft toy"],
          instructions:
            "Simple, natural pet behaviours that work for any animal.",
          expand: false,
        },
      ];
      for (const v of t.variables) t.history[v.name] = v.values;
    }
    if (!req.body.example) {
      if (
        req.body.references?.length ||
        req.body.imageVariations?.length ||
        req.body.startingFrame
      )
        throw fail(
          "Create the draft first, then import or attach references and configure their image variations.",
        );
      t = sanitizeTask(req.body, t);
      t.revision = 1;
    }
    res.status(201).json(stats(store.createTask(t)));
  });
  app.put("/api/tasks/:id", (req, res) => {
    const old = taskOrFail(req.params.id);
    editable(old);
    if (req.body.revision !== old.revision)
      throw fail(
        "This task changed in another window. Reload it before saving.",
        409,
      );
    const t = sanitizeTask(req.body, old);
    for (const ref of t.references) {
      const a = store.get("assets", ref.assetId);
      if (!a || a.taskId !== t.id)
        throw fail("Add this reference to the task before using it.");
    }
    // Samples queued from an earlier snapshot are deliberately retained.
    store.transaction(() => {
      for (const job of store
        .list("jobs")
        .filter(
          (j) =>
            j.taskId === t.id &&
            j.kind === "production" &&
            ["pending", "waiting", "blocked"].includes(j.status),
        )) {
        job.status = "cancelled";
        store.put("jobs", job);
      }
      for (const frame of store
        .list("jobs")
        .filter(
          (j) =>
            j.taskId === t.id &&
            j.kind === "frame" &&
            j.status === "pending" &&
            !j.manual,
        )) {
        if (
          !store
            .list("jobs")
            .some(
              (j) =>
                dependsOnImage(j, frame.id) &&
                !["cancelled", "completed"].includes(j.status),
            )
        ) {
          frame.status = "cancelled";
          store.put("jobs", frame);
        }
      }
      store.put("tasks", t);
    });
    store.manifest(t.id);
    res.json(stats(t));
  });
  app.post("/api/tasks/:id/action", async (req, res) => {
    const t = taskOrFail(req.params.id),
      action = req.body.action;
    checkRevision(t, req.body.revision);
    if (action === "duplicate") {
      const copy = structuredClone(t);
      Object.assign(copy, {
        id: uid(),
        name: `${t.name} copy`,
        status: "draft",
        runId: null,
        error: null,
        createdAt: now(),
        updatedAt: now(),
        expansion: 0,
        revision: 1,
        references: [],
        history: Object.fromEntries(t.variables.map((v) => [v.name, v.values])),
      });
      store.createTask(copy);
      for (const ref of t.references) {
        const a = store.get("assets", ref.assetId);
        if (a) {
          const cloned = store.addAsset({
            ...a,
            id: uid(),
            taskId: copy.id,
            kind: "reference",
            runId: null,
            bytes: fs.readFileSync(a.file),
          });
          copy.references.push({ ...ref, assetId: cloned.id });
          if (copy.imageVariations)
            copy.imageVariations = copy.imageVariations.map((c) =>
              c.sourceAssetId === a.id ? { ...c, sourceAssetId: cloned.id } : c,
            );
          if (copy.startingFrame?.sourceAssetId === a.id)
            copy.startingFrame.sourceAssetId = cloned.id;
        }
      }
      store.put("tasks", copy);
      store.manifest(copy.id);
      return res.json(stats(copy));
    }
    if (action === "pause" || action === "stop") {
      t.status = store
        .list("jobs")
        .some((j) => j.taskId === t.id && unsettled(j))
        ? action === "pause"
          ? "pausing"
          : "stopping"
        : action === "pause"
          ? "paused"
          : "stopped";
      if (action === "stop") {
        for (const job of store
          .list("jobs")
          .filter(
            (j) =>
              j.taskId === t.id &&
              ((j.kind === "production" &&
                ["pending", "waiting", "blocked"].includes(j.status)) ||
                (j.kind === "frame" && !j.manual && j.status === "pending")),
          )) {
          job.status = "cancelled";
          store.put("jobs", job);
        }
        const run = store.get("runs", t.runId);
        if (run) {
          run.finishedAt = now();
          store.put("runs", run);
        }
      }
    } else if (action === "start" || action === "resume") {
      requireKey();
      editable(t);
      const errors = validateTask(t, store.list("assets"));
      if (errors.length) throw fail(errors.join(" "));
      if (
        store
          .list("jobs")
          .some((j) => j.taskId === t.id && j.status === "uncertain")
      )
        throw fail(
          "Resolve the interrupted request in Results before resuming.",
        );
      const probe = path.join(t.folder, ".write-check");
      fs.writeFileSync(probe, "");
      fs.unlinkSync(probe);
      if (
        !t.runId ||
        ["stopped", "complete"].includes(t.status) ||
        store.get("runs", t.runId)?.finishedAt
      ) {
        const run = {
          id: uid(),
          taskId: t.id,
          number:
            store.list("runs").filter((r) => r.taskId === t.id).length + 1,
          startedAt: now(),
        };
        store.put("runs", run);
        t.runId = run.id;
      }
      t.status = "running";
      t.error = null;
    } else throw fail("Unknown task action.");
    t.updatedAt = now();
    store.put("tasks", t);
    store.manifest(t.id);
    res.json(stats(t));
  });
  app.delete("/api/tasks/:id", (req, res) => {
    const t = taskOrFail(req.params.id);
    checkRevision(t, req.body.revision);
    editable(t);
    const assetIds = new Set(
      store
        .list("assets")
        .filter((a) => a.taskId === t.id)
        .map((a) => a.id),
    );
    if (
      store
        .list("jobs")
        .some(
          (j) =>
            j.taskId !== t.id &&
            !["completed", "cancelled"].includes(j.status) &&
            j.snapshot.references?.some((r) => assetIds.has(r.assetId)),
        )
    )
      throw fail(
        "A studio generation still uses assets from this task. Finish that generation before deleting the task.",
        409,
      );
    if (req.body.deleteMedia === true)
      fs.rmSync(t.folder, { recursive: true, force: false });
    store.transaction(() => {
      for (const bucket of ["assets", "jobs", "runs"])
        for (const item of store.list(bucket).filter((i) => i.taskId === t.id))
          store.remove(bucket, item.id);
      store.remove("tasks", t.id);
    });
    res.json({ ok: true });
  });
  const assistance = (task, target = "video", sourceAssetId) => {
    if (!["video", "starting-frame", "image"].includes(target))
      throw fail("Choose the video or an image prompt.");
    const image = target !== "video";
    const config = sourceAssetId
      ? activeImageRecipes(task).find((c) => c.sourceAssetId === sourceAssetId)
      : activeImageRecipes(task)[0];
    if (
      image &&
      (!config ||
        !task.references.some((r) => r.assetId === config.sourceAssetId))
    )
      throw fail("Select an image marked Vary this image in References.");
    const references = (
      image
        ? [
            {
              assetId: config.sourceAssetId,
              role: "Asset to refine",
            },
          ]
        : task.references
    ).map((r) => {
      const asset = store.get("assets", r.assetId);
      if (!asset || !fs.existsSync(asset.file))
        throw fail(
          "A reference is missing. Restore it or remove it from the task.",
        );
      return { ...r, asset };
    });
    return {
      references,
      task: {
        ...task,
        prompt: image ? config.prompt : task.prompt,
        settings: image ? config.settings : task.settings,
        assistanceContext: {
          target,
          videoPrompt: task.prompt,
          startingFramePrompt: activeImageRecipes(task)[0]?.prompt || null,
          imagePrompts: activeImageRecipes(task).map((c) => ({
            sourceAssetId: c.sourceAssetId,
            prompt: c.prompt,
            role: task.references.find((r) => r.assetId === c.sourceAssetId)
              ?.role,
          })),
        },
      },
    };
  };
  app.post("/api/tasks/:id/improve", async (req, res) => {
    requireKey();
    const t = taskOrFail(req.params.id);
    checkRevision(t, req.body.revision);
    editable(t);
    const context = assistance(t, req.body.target, req.body.sourceAssetId);
    if (!context.task.prompt.trim()) throw fail("Write a prompt first.");
    res.json({
      prompt: await provider.improve(
        context.task,
        String(req.body.feedback || ""),
        context.references,
      ),
    });
  });
  app.post("/api/tasks/:id/suggest-variable", async (req, res) => {
    requireKey();
    const t = taskOrFail(req.params.id);
    editable(t);
    const { start, end, text, revision } = req.body;
    const context = assistance(t, req.body.target, req.body.sourceAssetId);
    const prompt = context.task.prompt;
    if (revision !== t.revision)
      throw fail(
        "Your prompt changed. Close this dialog and select the words again.",
        409,
      );
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      end <= start ||
      end > prompt.length ||
      typeof text !== "string" ||
      !text.trim() ||
      text !== prompt.slice(start, end)
    )
      throw fail("Select the words in your prompt that you want to vary.");
    if (
      [...prompt.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].some(
        (m) => start < m.index + m[0].length && end > m.index,
      )
    )
      throw fail("Select ordinary prompt text, outside any existing variable.");
    const references = context.references;
    const suggestion = await provider.suggestVariable(
      context.task,
      { start, end, text },
      references,
    );
    if (taskOrFail(t.id).revision !== revision)
      throw fail(
        "Your task changed while Gemini was suggesting a variable. Try again with the latest prompt.",
        409,
      );
    res.json(suggestion);
  });
  app.post("/api/tasks/:id/variations", async (req, res) => {
    requireKey();
    const t = taskOrFail(req.params.id);
    checkRevision(t, req.body.revision);
    editable(t);
    const count = Math.max(1, Math.min(50, Number(req.body.count) || 5));
    res.json({
      values: await provider.variations(
        t,
        String(req.body.name),
        count,
        activeImageRecipes(t).flatMap(
          (c) => assistance(t, "image", c.sourceAssetId).references,
        ),
      ),
      revision: t.revision,
    });
  });
  app.post("/api/tasks/:id/frame-preview", (req, res) => {
    requireKey();
    const t = taskOrFail(req.params.id);
    checkRevision(t, req.body.revision);
    editable(t);
    const config = req.body.sourceAssetId
      ? activeImageRecipes(t).find(
          (c) => c.sourceAssetId === req.body.sourceAssetId,
        )
      : activeImageRecipes(t)[0];
    if (!config)
      throw fail("Choose an image marked Vary this image in References first.");
    const errors = validateFrame(
      { ...t, imageVariations: [config] },
      store.list("assets"),
    );
    if (errors.length) throw fail(errors.join(" "));
    const values = req.body.values || {};
    for (const name of promptNames(config.prompt))
      if (
        !t.variables.find((v) => v.name === name)?.values.includes(values[name])
      )
        throw fail(`Choose a value for ${name}.`);
    const job = worker.ensureFrame(t, values, {
      manual: true,
      regenerate: req.body.regenerate === true,
      config,
    });
    res.json(job);
  });
  app.post("/api/tasks/:id/samples", (req, res) => {
    requireKey();
    const t = taskOrFail(req.params.id);
    checkRevision(t, req.body.revision);
    editable(t);
    const values = req.body.values || {};
    const errors = validateTask(t, store.list("assets"), { sample: true });
    if (errors.length) throw fail(errors.join(" "));
    for (const name of taskNames(t))
      if (
        !t.variables.find((v) => v.name === name)?.values.includes(values[name])
      )
        throw fail(`Choose a value for ${name}.`);
    const count = Math.max(1, Math.min(8, Number(req.body.count) || 1));
    const jobs = [];
    for (let i = 0; i < count; i++)
      jobs.push(
        worker.createVideoJob(t, values, { kind: "sample", take: i + 1 }),
      );
    res.json(jobs);
  });
  app.post("/api/jobs/:id/retry", (req, res) => {
    requireKey();
    const job = store.get("jobs", req.params.id);
    if (!job) throw fail("Generation not found.", 404);
    if (!["failed", "uncertain"].includes(job.status))
      throw fail("This generation is not ready to retry.");
    if (job.status === "uncertain" && !req.body.confirmDuplicateRisk)
      throw fail(
        "Check Google AI Studio first. Retrying an unconfirmed request may create a second charge.",
      );
    job.status = job.providerId ? "submitted" : "pending";
    job.error = null;
    job.attempts = 0;
    job.pollFailures = 0;
    job.nextAttemptAt = 0;
    store.put("jobs", job);
    if (
      job.kind === "production" ||
      (job.kind === "frame" &&
        store
          .list("jobs")
          .some(
            (j) =>
              dependsOnImage(j, job.id) &&
              j.kind === "production" &&
              ["blocked", "waiting"].includes(j.status),
          ))
    ) {
      const t = taskOrFail(job.taskId);
      t.status = "running";
      t.error = null;
      store.put("tasks", t);
    }
    res.json(job);
  });
  app.post("/api/jobs/:id/reconcile", (req, res) => {
    requireKey();
    const job = store.get("jobs", req.params.id);
    if (!job || job.status !== "uncertain")
      throw fail("Only an interrupted request needs reconciliation.");
    if (
      typeof req.body.providerId !== "string" ||
      !/^[-\w.]+$/.test(req.body.providerId)
    )
      throw fail("Enter the interaction ID from Google AI Studio.");
    job.providerId = req.body.providerId;
    job.status = "submitted";
    job.error = null;
    job.nextAttemptAt = 0;
    store.put("jobs", job);
    res.json(job);
  });
  app.post("/api/jobs/:id/repeat", (req, res) => {
    requireKey();
    const original = store.get("jobs", req.params.id);
    if (!original || original.status !== "completed")
      throw fail("Choose a completed generation to make another take.");
    if (original.taskId) editable(taskOrFail(original.taskId));
    const copy = worker.createJob({
      taskId: original.taskId,
      kind: original.kind,
      runId: original.runId,
      snapshot: structuredClone(original.snapshot),
      take: original.take,
      key: original.key,
    });
    copy.manual = true;
    copy.repeatedFrom = original.id;
    store.put("jobs", copy);
    res.json(copy);
  });
  app.post("/api/assets/upload", upload.single("file"), (req, res) => {
    if (!req.file) throw fail("Choose an image or video.");
    const mime = detectMime(req.file.buffer);
    if (!mime) throw fail("Use a valid PNG, JPEG, WebP, MP4 or WebM file.");
    const taskId = req.body.taskId || null;
    if (taskId) {
      const task = taskOrFail(taskId);
      editable(task);
      checkRevision(
        task,
        req.body.revision === undefined ? undefined : Number(req.body.revision),
      );
    }
    const role = req.body.role || "Subject appearance";
    if (!ROLES.includes(role)) throw fail("Choose a valid reference purpose.");
    const duration = req.body.duration ? Number(req.body.duration) : null;
    if (
      duration !== null &&
      (!Number.isFinite(duration) || duration <= 0 || duration > 36000)
    )
      throw fail("Use a valid video duration in seconds.");
    const a = store.addAsset({
      taskId,
      name: path.parse(req.file.originalname).name,
      mime,
      bytes: req.file.buffer,
      duration,
    });
    if (taskId) {
      const t = taskOrFail(taskId);
      t.references.push({ assetId: a.id, role });
      t.revision++;
      store.put("tasks", t);
      store.manifest(t.id);
    }
    res.json(publicAsset(a));
  });
  app.post("/api/assets/:id/attach", (req, res) => {
    const a = store.get("assets", req.params.id);
    if (!a) throw fail("Asset not found.", 404);
    const t = taskOrFail(req.body.taskId);
    editable(t);
    checkRevision(t, req.body.revision);
    const role = req.body.role || "Subject appearance";
    if (!ROLES.includes(role)) throw fail("Choose a valid reference purpose.");
    const copy = store.addAsset({
      ...a,
      id: uid(),
      taskId: t.id,
      kind: "reference",
      runId: null,
      bytes: fs.readFileSync(a.file),
    });
    t.references.push({ assetId: copy.id, role });
    t.revision++;
    store.put("tasks", t);
    store.manifest(t.id);
    res.json(publicAsset(copy));
  });
  app.delete("/api/assets/:id", (req, res) => {
    const asset = store.get("assets", req.params.id);
    if (!asset) throw fail("Asset not found.", 404);
    if (asset.taskId)
      throw fail(
        "This asset belongs to a task. Manage it from that task.",
        409,
      );
    if (req.body.confirmDelete !== true)
      throw fail("Confirm deletion of this asset and its local file.");
    const referenced = (snapshot) =>
      snapshot?.parentId === asset.id ||
      snapshot?.references?.some((r) => r.assetId === asset.id);
    if (
      store.list("tasks").some((t) => referenced(t)) ||
      store
        .list("jobs")
        .some(
          (j) =>
            !["completed", "cancelled"].includes(j.status) &&
            referenced(j.snapshot),
        )
    )
      throw fail(
        "This asset is still used by a task or unfinished generation. Finish or remove that work before deleting it.",
        409,
      );
    // Delete only files recorded for this asset, never the containing folder.
    for (const file of [`${asset.file}.json`, asset.file]) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    store.transaction(() => {
      store.remove("assets", asset.id);
      for (const job of store
        .list("jobs")
        .filter((j) => j.assetId === asset.id)) {
        job.assetId = null;
        job.assetDeleted = true;
        store.put("jobs", job);
      }
    });
    res.json({ ok: true });
  });
  app.get("/api/assets/:id/file", (req, res, next) => {
    const a = store.get("assets", req.params.id);
    if (!a) throw fail("Asset not found.", 404);
    res.type(a.mime);
    // Managed storage may live inside .frame (or .local on Linux). Only
    // serve this registered asset; never expose the storage directory itself.
    res.sendFile(a.file, { dotfiles: "allow" }, (err) => {
      if (!err) return;
      if (!res.headersSent) res.removeHeader("Content-Type");
      next(err);
    });
  });
  app.post("/api/assets/:id/duration", (req, res) => {
    const a = store.get("assets", req.params.id);
    if (!a) throw fail("Asset not found.", 404);
    const duration = Number(req.body.duration);
    if (
      !a.mime.startsWith("video/") ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 36000
    )
      throw fail("Could not read the video length.");
    if (!a.duration) {
      a.duration = duration;
      store.put("assets", a);
      fs.writeFileSync(`${a.file}.json`, JSON.stringify(a, null, 2));
      if (a.taskId) store.manifest(a.taskId);
    }
    res.json({ ok: true });
  });
  app.post("/api/studio/optimize", async (req, res) => {
    requireKey();
    const { prompt, model, parentId } = req.body;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000)
      throw fail("Write a prompt of up to 30,000 characters to optimize.");
    if (![VIDEO_MODEL, ...IMAGE_MODELS].includes(model))
      throw fail("Choose a supported model.");
    const parent = parentId ? store.get("assets", parentId) : null;
    if (parentId && !parent)
      throw fail("Select an existing asset to refine.", 404);
    if (parent?.mime.startsWith("video/") && IMAGE_MODELS.includes(model))
      throw fail("Choose the video model to refine a video.");
    res.json({
      prompt: await provider.optimizeStudio({
        prompt: prompt.trim(),
        model,
        parent,
        references: studioReferences(model, req.body.references, parent),
      }),
    });
  });
  app.post("/api/studio/generate", (req, res) => {
    requireKey();
    const {
      prompt,
      model = IMAGE_MODELS[0],
      aspectRatio = req.body.parentId && IMAGE_MODELS.includes(model)
        ? "auto"
        : "16:9",
      imageSize = "1K",
      resolution = "720p",
      parentId,
    } = req.body;
    if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 30000)
      throw fail("Describe the asset you want to create.");
    if (![VIDEO_MODEL, ...IMAGE_MODELS].includes(model))
      throw fail("Choose a supported model.");
    const image = IMAGE_MODELS.includes(model);
    if (
      !(
        image
          ? [
              "auto",
              "1:1",
              "16:9",
              "9:16",
              "4:3",
              "3:4",
              "3:2",
              "2:3",
              "4:5",
              "5:4",
              "21:9",
            ]
          : ["16:9", "9:16"]
      ).includes(aspectRatio)
    )
      throw fail("Choose a supported aspect ratio.");
    if (
      !["1K", "2K", "4K"].includes(imageSize) ||
      !["360p", "720p", "1080p", "4k"].includes(resolution)
    )
      throw fail("Choose a supported resolution.");
    const parent = parentId ? store.get("assets", parentId) : null;
    if (parentId && !parent) throw fail("Select an existing asset to refine.");
    if (parent && image && parent.mime.startsWith("video/"))
      throw fail("Choose the video model to refine a video.");
    const chosenReferences = studioReferences(
      model,
      req.body.references,
      parent,
    );
    const snapshot = {
      prompt,
      settings: { model, aspectRatio, imageSize, resolution, task: "auto" },
      values: {},
      references: [
        ...(parent
          ? [
              {
                assetId: parent.id,
                role: "Asset to refine",
                name: parent.name,
                mime: parent.mime,
              },
            ]
          : []),
        ...chosenReferences.map(({ assetId, role, asset }) => ({
          assetId,
          role,
          name: asset.name,
          mime: asset.mime,
        })),
      ],
      parentId: parent?.id || null,
      previousInteractionId:
        parent?.interactionId && parent.metadata?.settings?.model === model
          ? parent.interactionId
          : null,
    };
    if (
      parent?.mime.startsWith("video/") &&
      !snapshot.previousInteractionId &&
      (!parent.duration || parent.duration > 10)
    )
      throw fail("Use a video of 10 seconds or less for an uploaded edit.");
    res.json(worker.createJob({ kind: "studio", snapshot }));
  });
  app.put("/api/settings", (req, res) => {
    const outputDir = req.body.outputDir;
    if (typeof outputDir !== "string" || !path.isAbsolute(outputDir))
      throw fail("Enter a full folder path.");
    fs.mkdirSync(outputDir, { recursive: true });
    const probe = path.join(outputDir, `.frame-${uid()}`);
    fs.writeFileSync(probe, "");
    fs.unlinkSync(probe);
    const settings = {
      ...store.get("config", "settings"),
      outputDir: path.resolve(outputDir),
    };
    store.put("config", settings);
    res.json(settings);
  });
  app.post("/api/open-folder", async (req, res) => {
    const dir = req.body.taskId
      ? taskOrFail(req.body.taskId).folder
      : store.get("config", "settings").outputDir;
    fs.mkdirSync(dir, { recursive: true });
    await new Promise((resolve, reject) => {
      const child = spawn(
        process.platform === "darwin"
          ? "open"
          : process.platform === "win32"
            ? "explorer.exe"
            : "xdg-open",
        [dir],
        { stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("spawn", resolve);
    });
    res.json({ ok: true });
  });
  app.post("/api/connection/key", (req, res) => {
    provider.key = saveApiKey(envPath, req.body.key);
    res.json({ configured: true });
  });
  app.post("/api/choose-folder", async (req, res) =>
    res.json({ folder: await chooseFolder() }),
  );
  app.post("/api/connection/check", async (req, res) => {
    requireKey();
    const data = await provider.request("models");
    const models = (data.models || []).map((m) =>
      m.name?.replace("models/", ""),
    );
    res.json({
      ok: true,
      videoAvailable: models.includes(VIDEO_MODEL),
      models,
    });
  });
  app.use("/api", (err, req, res, next) => {
    if (res.headersSent) return next(err);
    console.error("Request:", err.code || err.status || "", err.message);
    const message =
      err.code === "ENOSPC"
        ? "The output drive is full. Free some space and retry."
        : err.code === "EACCES" || err.code === "EPERM"
          ? "Frame cannot write to this folder. Choose a writable folder in Settings."
          : err.code === "ENOENT"
            ? "A local file or folder is missing. Restore it or select it again."
            : err.code === "LIMIT_FILE_SIZE"
              ? "This file is too large. Use a file smaller than 100 MB."
              : err.message || "Something went wrong. Please try again.";
    res
      .status(err.status >= 400 && err.status < 600 ? err.status : 400)
      .json({ error: message });
  });
  return app;
}
export function detectMime(b) {
  if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return "image/png";
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return "image/jpeg";
  if (
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (b.toString("ascii", 4, 8) === "ftyp") return "video/mp4";
  if (b.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163])))
    return "video/webm";
  return null;
}
