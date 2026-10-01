import fs from "node:fs";
import path from "node:path";
import {
  frameEnabled,
  taskNames,
  activeImageRecipes,
} from "../shared/task-variables.js";
import { frameRecipe, matchingFrame } from "./frames.js";
import {
  uid,
  now,
  combinations,
  combinationKey,
  resolvePrompt,
  validateTask,
  IMAGE_MODELS,
  unique,
} from "./domain.js";
import { atomicWrite } from "./store.js";

export const unsettled = (j) =>
  ["submitting", "submitted", "downloading"].includes(j.status);
export function snapshotTask(task, values) {
  return {
    prompt: resolvePrompt(task.prompt, values),
    template: task.prompt,
    values,
    settings: structuredClone(task.settings),
    references: structuredClone(task.references),
    revision: task.revision,
  };
}
export function nextCombination(task, jobs) {
  const used = new Set(
    jobs
      .filter((j) => j.kind === "production" && j.status !== "cancelled")
      .map((j) => `${j.key}:${j.take}`),
  );
  for (const values of combinations(task)) {
    const key = combinationKey(values);
    for (let take = 1; take <= task.takes; take++)
      if (!used.has(`${key}:${take}`)) return { values, key, take };
  }
  return null;
}
export class Worker {
  constructor(store, provider) {
    Object.assign(this, {
      store,
      provider,
      busy: false,
      timer: null,
      lastTaskId: null,
    });
  }
  recover() {
    for (const task of this.store.list("tasks"))
      if (["running", "pausing", "stopping"].includes(task.status)) {
        task.status = "paused";
        task.error =
          "Frame restarted. Review your progress and resume when ready.";
        this.store.put("tasks", task);
      }
    for (const job of this.store.list("jobs"))
      if (unsettled(job)) {
        job.status = job.providerId ? "submitted" : "uncertain";
        if (!job.providerId)
          job.error =
            "The service stopped before Google confirmed this request. Check Google AI Studio before generating another take.";
        this.store.put("jobs", job);
      }
  }
  start() {
    this.recover();
    this.timer = setInterval(
      () => this.tick().catch((e) => console.error("Worker:", e.message)),
      1000,
    );
  }
  stop() {
    clearInterval(this.timer);
  }
  ensureFrame(
    task,
    values,
    {
      manual = false,
      regenerate = false,
      config = activeImageRecipes(task)[0],
    } = {},
  ) {
    const recipe = frameRecipe(task, values, this.store, config);
    const previous = matchingFrame(this.store, task.id, recipe.key);
    if (
      previous &&
      (!regenerate ||
        [
          "pending",
          "submitting",
          "submitted",
          "downloading",
          "uncertain",
        ].includes(previous.status))
    ) {
      if (manual && previous.status === "pending") {
        previous.manual = true;
        this.store.put("jobs", previous);
      }
      return previous;
    }
    const version =
      this.store
        .list("jobs")
        .filter(
          (j) =>
            j.taskId === task.id && j.kind === "frame" && j.key === recipe.key,
        ).length + 1;
    return this.createJob({
      taskId: task.id,
      kind: "frame",
      key: recipe.key,
      runId: manual ? null : task.runId,
      manual,
      snapshot: { ...recipe.snapshot, frameVersion: version },
    });
  }
  imageDependencies(snapshot) {
    return (
      snapshot.frameDependencies ||
      (snapshot.frameJobId
        ? [
            {
              jobId: snapshot.frameJobId,
              sourceAssetId: this.store.get("jobs", snapshot.frameJobId)
                ?.snapshot.parentId,
            },
          ]
        : [])
    );
  }
  originalReferences(snapshot) {
    if (snapshot.originalReferences) return snapshot.originalReferences;
    const generated =
      snapshot.generatedReferences ||
      (snapshot.frameAssetId
        ? [
            {
              assetId: snapshot.frameAssetId,
              sourceAssetId: this.imageDependencies(snapshot)[0]?.sourceAssetId,
            },
          ]
        : []);
    return snapshot.references.map((r) => {
      const original = generated.find((g) => g.assetId === r.assetId);
      return original?.sourceAssetId
        ? { ...r, assetId: original.sourceAssetId }
        : r;
    });
  }
  createVideoJob(task, values, options) {
    const dependencies = activeImageRecipes(task).map((config) => ({
      jobId: this.ensureFrame(task, values, {
        manual: options.kind === "sample",
        config,
      }).id,
      sourceAssetId: config.sourceAssetId,
    }));
    const snapshot = snapshotTask(task, values);
    if (dependencies.length) {
      snapshot.frameDependencies = dependencies;
      snapshot.frameJobId = dependencies[0].jobId;
      snapshot.originalReferences = structuredClone(snapshot.references);
    }
    return this.createJob({
      ...options,
      taskId: task.id,
      snapshot,
      status: dependencies.length ? "waiting" : "pending",
    });
  }
  settleDependencies() {
    for (const job of this.store
      .list("jobs")
      .filter((j) => ["waiting", "blocked"].includes(j.status))) {
      const dependencies = this.imageDependencies(job.snapshot);
      const resolved = dependencies.map((d) => {
        const frame = this.store.get("jobs", d.jobId);
        return {
          ...d,
          frame,
          asset: frame?.assetId
            ? this.store.get("assets", frame.assetId)
            : null,
        };
      });
      if (
        resolved.some(
          (d) =>
            !d.frame ||
            ["failed", "uncertain", "cancelled"].includes(d.frame.status),
        )
      ) {
        job.status = "blocked";
        job.error =
          "A reference image needs attention. Resolve its generation to continue these videos.";
      } else if (
        resolved.some(
          (d) =>
            d.frame.status === "completed" &&
            (!d.asset || !fs.existsSync(d.asset.file)),
        )
      ) {
        job.status = "blocked";
        job.error =
          "A generated reference image is missing. Restore its local file to continue.";
      } else if (resolved.every((d) => d.frame.status === "completed")) {
        job.snapshot.originalReferences = this.originalReferences(job.snapshot);
        job.snapshot.references = job.snapshot.originalReferences.map((r) => {
          const d = resolved.find(
            (d) => d.sourceAssetId === r.assetId || d.asset.id === r.assetId,
          );
          return d ? { ...r, assetId: d.asset.id } : r;
        });
        job.snapshot.generatedReferences = resolved.map((d) => ({
          sourceAssetId: d.sourceAssetId,
          assetId: d.asset.id,
          jobId: d.frame.id,
          key: d.frame.key,
          version: d.frame.snapshot.frameVersion,
          role: job.snapshot.references.find((r) => r.assetId === d.asset.id)
            ?.role,
        }));
        const first = resolved[0];
        job.snapshot.frameAssetId = first?.asset.id;
        job.snapshot.frameKey = first?.frame.key;
        job.snapshot.frameVersion = first?.frame.snapshot.frameVersion;
        job.status = "pending";
        job.error = null;
      } else {
        job.status = "waiting";
        job.error = null;
      }
      this.store.put("jobs", job);
    }
  }
  createJob({
    taskId = null,
    kind,
    runId = null,
    snapshot,
    take = 1,
    key = null,
    status = "pending",
    manual = false,
  }) {
    const job = {
      id: uid(),
      taskId,
      kind,
      runId,
      snapshot,
      take,
      key,
      status,
      manual,
      attempts: 0,
      pollFailures: 0,
      createdAt: now(),
      providerId: null,
      error: null,
      nextAttemptAt: 0,
    };
    this.store.put("jobs", job);
    if (taskId) this.store.manifest(taskId);
    return job;
  }
  settleTasks() {
    const jobs = this.store.list("jobs");
    for (const task of this.store.list("tasks"))
      if (
        ["pausing", "stopping"].includes(task.status) &&
        !jobs.some((j) => j.taskId === task.id && unsettled(j))
      ) {
        task.status = task.status === "pausing" ? "paused" : "stopped";
        this.store.put("tasks", task);
        this.store.manifest(task.id);
      }
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      this.settleTasks();
      this.settleDependencies();
      let jobs = this.store.list("jobs");
      const active = jobs.find(
        (j) =>
          ["submitted", "downloading"].includes(j.status) &&
          j.nextAttemptAt <= Date.now(),
      );
      if (active) {
        await this.process(active);
        return;
      }
      // Do not submit additional work while a provider operation is outstanding.
      if (jobs.some(unsettled)) return;
      const pending = jobs.find(
        (j) =>
          j.status === "pending" &&
          j.nextAttemptAt <= Date.now() &&
          (j.manual ||
            !["production", "frame"].includes(j.kind) ||
            this.store.get("tasks", j.taskId)?.status === "running"),
      );
      if (pending) {
        await this.process(pending);
        return;
      }
      const running = this.store
        .list("tasks")
        .filter((t) => t.status === "running");
      const lastIndex = running.findIndex((t) => t.id === this.lastTaskId);
      const task = running.length
        ? running[(lastIndex + 1) % running.length]
        : null;
      if (!task) return;
      this.lastTaskId = task.id;
      jobs = jobs.filter((j) => j.taskId === task.id);
      if (jobs.some((j) => j.kind === "production" && j.status === "pending"))
        return;
      const errors = validateTask(task, this.store.list("assets"));
      if (errors.length) {
        task.status = "attention";
        task.error = errors.join(" ");
        this.store.put("tasks", task);
        return;
      }
      const runJobs = jobs.filter(
        (j) =>
          j.runId === task.runId &&
          j.kind === "production" &&
          j.status !== "cancelled",
      );
      if (
        task.limit &&
        task.mode === "continuous" &&
        runJobs.length >= task.limit
      ) {
        this.finish(task, jobs);
        return;
      }
      const next = nextCombination(task, jobs);
      if (next) {
        try {
          const job = this.createVideoJob(task, next.values, {
            kind: "production",
            runId: task.runId,
            take: next.take,
            key: next.key,
          });
          if (job.status === "pending") await this.process(job);
        } catch (error) {
          task.status = "attention";
          task.error = error.message;
          this.store.put("tasks", task);
          this.store.manifest(task.id);
        }
        return;
      }
      if (
        jobs.some(
          (j) =>
            j.kind === "production" &&
            ["waiting", "blocked", "failed", "uncertain"].includes(j.status),
        )
      ) {
        if (jobs.some((j) => j.kind === "production" && j.status === "waiting"))
          return;
        this.finish(task, jobs);
        return;
      }
      if (task.mode === "batch") {
        this.finish(task, jobs);
        return;
      }
      try {
        const additions = [];
        for (const variable of task.variables.filter(
          (v) => v.expand && taskNames(task).includes(v.name),
        ))
          additions.push({
            name: variable.name,
            values: await this.provider.variations(
              task,
              variable.name,
              1,
              frameEnabled(task)
                ? activeImageRecipes(task).map((config) => ({
                    asset: this.store.get("assets", config.sourceAssetId),
                    role: "Asset to refine",
                  }))
                : [],
            ),
          });
        const latest = this.store.get("tasks", task.id);
        if (latest?.status !== "running" || latest.revision !== task.revision)
          return;
        for (const addition of additions) {
          const variable = latest.variables.find(
            (v) => v.name === addition.name,
          );
          variable.values = unique([...variable.values, ...addition.values]);
          latest.history[variable.name] = unique([
            ...(latest.history[variable.name] || []),
            ...addition.values,
          ]);
        }
        latest.expansion++;
        latest.revision++;
        latest.updatedAt = now();
        this.store.put("tasks", latest);
        this.store.manifest(latest.id);
      } catch (e) {
        const latest = this.store.get("tasks", task.id);
        if (latest?.status === "running") {
          latest.status = "attention";
          latest.error = e.message;
          this.store.put("tasks", latest);
        }
      }
    } finally {
      this.busy = false;
    }
  }
  finish(task, jobs) {
    task.status = jobs.some(
      (j) =>
        ["failed", "uncertain", "blocked"].includes(j.status) &&
        j.kind === "production",
    )
      ? "attention"
      : "complete";
    task.error =
      task.status === "attention"
        ? "Production finished with some videos needing attention. Review them in Results."
        : null;
    this.store.put("tasks", task);
    const run = this.store.get("runs", task.runId);
    if (run) {
      run.finishedAt = now();
      this.store.put("runs", run);
    }
    this.store.manifest(task.id);
  }
  async process(job) {
    try {
      let response;
      if (job.status === "pending") {
        job.status = "submitting";
        job.attempts++;
        job.error = null;
        this.store.put("jobs", job);
        const references = job.snapshot.references.map((r) => ({
          ...r,
          asset: this.store.get("assets", r.assetId),
        }));
        if (references.some((r) => !r.asset || !fs.existsSync(r.asset.file)))
          throw new Error(
            "A reference file is missing. Import it again before retrying.",
          );
        response = await this.provider.submit(job.snapshot, references);
        job.providerId = response.id || null;
        job.status = "submitted";
        this.store.put("jobs", job);
      } else if (job.responseFile && fs.existsSync(job.responseFile))
        response = JSON.parse(fs.readFileSync(job.responseFile, "utf8"));
      else response = await this.provider.retrieve(job.providerId);
      if (["failed", "cancelled", "incomplete"].includes(response.status))
        throw new Error(
          response.error?.message ||
            "Google could not finish this generation. Try adjusting the prompt.",
        );
      if (response.status !== "completed") {
        if (!job.providerId)
          throw new Error("Google did not return a generation ID.");
        job.status = "submitted";
        job.pollFailures = 0;
        job.nextAttemptAt = Date.now() + 5000;
        this.store.put("jobs", job);
        return;
      }
      const spool = path.join(this.store.dir, "responses");
      fs.mkdirSync(spool, { recursive: true });
      job.responseFile = path.join(spool, `${job.id}.json`);
      atomicWrite(job.responseFile, JSON.stringify(response));
      job.status = "downloading";
      this.store.put("jobs", job);
      const media = await this.provider.download(
        response,
        IMAGE_MODELS.includes(job.snapshot.settings.model) ? "image" : "video",
      );
      const asset =
        this.store.get("assets", job.id) ||
        this.store.addAsset({
          id: job.id,
          taskId: job.taskId,
          name:
            job.kind === "studio"
              ? job.snapshot.prompt.slice(0, 60)
              : job.kind === "frame"
                ? `Reference image - ${Object.values(job.snapshot.values || {}).join(" - ") || "variation"} - v${job.snapshot.frameVersion}`
                : `${Object.values(job.snapshot.values || {}).join(" - ") || "Video"} - take ${job.take}`,
          kind: job.kind,
          runId: job.runId,
          ...media,
          interactionId: job.providerId,
          parentId: job.snapshot.parentId || null,
          metadata: {
            ...job.snapshot,
            take: job.take,
            jobId: job.id,
            generatedAt: now(),
          },
        });
      job.assetId = asset.id;
      job.status = "completed";
      job.finishedAt = now();
      job.error = null;
      this.store.put("jobs", job);
      // A new frame becomes the choice for unfinished production only after
      // its media is safely saved. Completed outputs and samples stay pinned.
      if (job.kind === "frame") {
        for (const video of this.store
          .list("jobs")
          .filter(
            (j) =>
              j.taskId === job.taskId &&
              j.kind === "production" &&
              ["waiting", "blocked", "pending"].includes(j.status),
          )) {
          const dependencies = this.imageDependencies(video.snapshot);
          if (
            !dependencies.some(
              (d) => this.store.get("jobs", d.jobId)?.key === job.key,
            )
          )
            continue;
          video.snapshot.originalReferences = this.originalReferences(
            video.snapshot,
          );
          video.snapshot.frameDependencies = dependencies.map((d) =>
            this.store.get("jobs", d.jobId)?.key === job.key
              ? { ...d, jobId: job.id }
              : d,
          );
          video.snapshot.frameJobId = video.snapshot.frameDependencies[0].jobId;
          delete video.snapshot.frameAssetId;
          delete video.snapshot.frameVersion;
          delete video.snapshot.generatedReferences;
          video.status = "waiting";
          video.error = null;
          this.store.put("jobs", video);
        }
      }
      if (job.taskId) this.store.manifest(job.taskId);
      if (fs.existsSync(job.responseFile)) fs.unlinkSync(job.responseFile);
    } catch (error) {
      job.error = error.message;
      if (error.uncertain) {
        job.status = "uncertain";
      } else if (
        error.retryable &&
        (job.providerId ? ++job.pollFailures : job.attempts) < 3
      ) {
        job.status = job.providerId ? "submitted" : "pending";
        job.nextAttemptAt =
          Date.now() +
          Math.min(60000, 3000 * 2 ** (job.pollFailures || job.attempts));
      } else job.status = "failed";
      this.store.put("jobs", job);
      if (job.taskId) {
        const task = this.store.get("tasks", job.taskId);
        if (
          task &&
          (job.status === "uncertain" ||
            [401, 403, 404].includes(error.status) ||
            ["ENOSPC", "EACCES", "EPERM", "ENOENT"].includes(error.code))
        ) {
          task.status = "attention";
          task.error = job.error;
          this.store.put("tasks", task);
        }
        try {
          this.store.manifest(job.taskId);
        } catch {
          if (task) {
            task.status = "attention";
            task.error =
              "The output folder is unavailable. Restore access and retry the download.";
            this.store.put("tasks", task);
          }
        }
      }
    }
    this.settleTasks();
  }
}
