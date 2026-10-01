import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { commands, globals, helpData, schemas, taskFields } from "./spec.js";
import {
  CliError,
  Client,
  baseUrl,
  integer,
  jsonInput,
  usage,
} from "./client.js";
import {
  promptNames,
  activeImageRecipes,
  imageRecipes,
  updateImageRecipe,
  taskNames,
} from "../shared/task-variables.js";
import { resolvePrompt, unique } from "../server/domain.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const id = encodeURIComponent;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exec = promisify(execFile);
const hasOwn = (object, key) =>
  Object.prototype.hasOwnProperty.call(object, key);

export function parseArgs(argv) {
  const words = [],
    options = {},
    rawOptions = [];
  const types = new Map(
    [...globals, ...Object.values(commands).flatMap((c) => c.options)].map(
      (o) => [o.replace(/=$/, ""), o.endsWith("=")],
    ),
  );
  for (let i = 0; i < argv.length; i++) {
    let word = argv[i];
    if (word === "-h") word = "--help";
    if (!word.startsWith("--")) {
      words.push(word);
      continue;
    }
    const equal = word.indexOf("="),
      name = word.slice(2, equal === -1 ? undefined : equal);
    if (!types.has(name))
      usage(`Unknown option --${name}. Use --help to discover commands.`);
    if (hasOwn(options, name))
      usage(`Option --${name} was supplied more than once.`);
    let value = equal === -1 ? undefined : word.slice(equal + 1);
    if (types.get(name)) {
      if (value === undefined) {
        value = argv[++i];
        if (value === undefined || value.startsWith("--"))
          usage(`Supply a value for --${name}.`);
      }
      if (!value) usage(`Supply a nonempty value for --${name}.`);
    } else {
      if (value !== undefined)
        usage(`--${name} is a flag; do not supply a value.`);
      value = true;
    }
    options[name] = value;
    rawOptions.push(name);
  }
  const key = commands[words.slice(0, 2).join(" ")]
    ? words.slice(0, 2).join(" ")
    : words[0];
  const command = commands[key];
  if (options.help || !words.length || words[0] === "help" || options.version)
    return { key: "help", options };
  if (!command)
    usage(`Unknown command ${words.slice(0, 2).join(" ")}. Use --help.`);
  const allowed = new Set(
    [...globals, ...command.options].map((o) => o.replace(/=$/, "")),
  );
  for (const name of rawOptions)
    if (!allowed.has(name)) usage(`--${name} is not supported by ${key}.`);
  const args = words.slice(key.split(" ").length);
  const minimum = command.args.filter((a) => !a.endsWith("?")).length;
  const many = command.args.at(-1)?.endsWith("...");
  if (args.length < minimum || (!many && args.length > command.args.length))
    usage(`Usage: frame ${key} ${command.args.join(" ")}`);
  return { key, args, options };
}

// Small JSON-schema subset, sufficient to catch misspellings and malformed agent
// payloads before issuing a mutation. The service remains authoritative.
export function validateInput(value, schema, label = "input") {
  const type = Array.isArray(value)
    ? "array"
    : value === null
      ? "null"
      : typeof value;
  const expected = Array.isArray(schema.type)
    ? schema.type
    : schema.type
      ? [schema.type]
      : [];
  if (
    expected.length &&
    !expected.some((t) =>
      t === "integer" ? Number.isInteger(value) : t === type,
    )
  )
    usage(`${label} has the wrong type.`);
  if (schema.enum && !schema.enum.includes(value))
    usage(`${label} must be one of: ${schema.enum.join(", ")}.`);
  if (type === "string") {
    if (schema.maxLength && value.length > schema.maxLength)
      usage(`${label} is too long.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value))
      usage(
        `${label} must use letters, numbers and underscores, beginning with a letter.`,
      );
  }
  if (
    type === "number" &&
    ((schema.minimum !== undefined && value < schema.minimum) ||
      (schema.maximum !== undefined && value > schema.maximum))
  )
    usage(`${label} is outside the supported range.`);
  if (type === "array") {
    if (schema.maxItems && value.length > schema.maxItems)
      usage(`${label} has too many items.`);
    if (schema.items)
      value.forEach((v, i) => validateInput(v, schema.items, `${label}[${i}]`));
  }
  if (type === "object") {
    for (const name of schema.required || [])
      if (!hasOwn(value, name)) usage(`${label}.${name} is required.`);
    for (const [name, v] of Object.entries(value)) {
      if (schema.properties?.[name])
        validateInput(v, schema.properties[name], `${label}.${name}`);
      else if (schema.additionalProperties === false)
        usage(
          `Unknown field ${label}.${name}. Use frame schema to discover fields.`,
        );
      else if (
        schema.additionalProperties &&
        typeof schema.additionalProperties === "object"
      )
        validateInput(v, schema.additionalProperties, `${label}.${name}`);
    }
  }
  return value;
}
function query(options, extra = {}) {
  const map = { task: "taskId", run: "runId" };
  const params = new URLSearchParams(extra);
  for (const key of ["task", "run", "kind", "status", "limit", "offset"])
    if (options[key] !== undefined) params.set(map[key] || key, options[key]);
  return `?${params}`;
}
function reviewed(task, revision) {
  if (
    revision !== undefined &&
    integer(revision, undefined, 1, Number.MAX_SAFE_INTEGER, "revision") !==
      task.revision
  )
    throw new CliError(
      "CONFLICT",
      "The task changed since the supplied revision. Read it again and review the updated plan.",
      3,
      { expectedRevision: Number(revision), actualRevision: task.revision },
    );
  return task;
}
function promptContext(task, options) {
  const target = options.target || "video";
  if (!["video", "image"].includes(target))
    usage("--target must be video or image.");
  if (target === "video") {
    if (options.source) usage("Use --source only with --target image.");
    return { target, prompt: task.prompt };
  }
  if (!options.source)
    usage("Specify --source ASSET_ID when --target is image.");
  const config = activeImageRecipes(task).find(
    (c) => c.sourceAssetId === options.source,
  );
  if (!config)
    usage(
      "This source is not an enabled image variation. Configure it with tasks image first.",
    );
  return {
    target,
    sourceAssetId: options.source,
    prompt: config.prompt,
    config,
  };
}
function promptPatch(task, context, prompt) {
  return context.config
    ? updateImageRecipe(task, { ...context.config, prompt })
    : { prompt };
}
function selection(context, options) {
  let start, end;
  if (options.start !== undefined || options.end !== undefined) {
    start = integer(options.start, -1, 0, context.prompt.length, "start");
    end = integer(options.end, -1, 1, context.prompt.length, "end");
    if (start >= end)
      usage(
        "end must come after start. Offsets use JavaScript UTF-16 characters.",
      );
  } else {
    if (!options.text)
      usage("Select text with --text, or supply --start and --end offsets.");
    start = context.prompt.indexOf(options.text);
    if (start === -1) usage("Selected text was not found in the saved prompt.");
    if (context.prompt.indexOf(options.text, start + 1) !== -1)
      usage(
        "Selected text occurs more than once. Use --start and --end to choose the intended occurrence.",
      );
    end = start + options.text.length;
  }
  const text = context.prompt.slice(start, end);
  if (!text.trim() || (options.text !== undefined && options.text !== text))
    usage("Selection must match the exact saved prompt text.");
  if (
    [...context.prompt.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].some(
      (m) => start < m.index + m[0].length && end > m.index,
    )
  )
    usage("Select ordinary text outside an existing variable.");
  return { start, end, text };
}
async function waitFor(client, fetchState, options, finished, failed) {
  const timeout = integer(options.timeout, 600, 1, 86400, "timeout");
  const interval = integer(options.interval, 2, 1, 60, "interval");
  const deadline = Date.now() + timeout * 1000;
  for (;;) {
    const data = await fetchState();
    if (failed(data))
      throw new CliError(
        "GENERATION_ATTENTION",
        "Generation needs attention. Inspect the returned errors and dependencies before retrying.",
        5,
        { state: data },
      );
    if (finished(data)) return data;
    const remaining = deadline - Date.now();
    if (remaining <= 0)
      throw new CliError(
        "WAIT_TIMEOUT",
        "Waiting timed out; background processing continues. Use jobs get/wait or tasks get to check again.",
        4,
        { state: data },
      );
    await sleep(Math.min(interval * 1000, remaining));
  }
}
async function waitJobs(client, jobs, options) {
  return waitFor(
    client,
    () =>
      Promise.all(
        jobs.map((j) =>
          client.request(`/jobs/${id(j.id)}`).then((j) => client.job(j)),
        ),
      ),
    options,
    (jobs) => jobs.every((j) => j.status === "completed"),
    (jobs) =>
      jobs.some((j) =>
        ["failed", "uncertain", "blocked", "cancelled"].includes(j.status),
      ),
  );
}

export async function execute(
  { key, args = [], options },
  { stdin = process.stdin, appRoot = root } = {},
) {
  if (key === "help")
    return options.version ? { version: "1.0.0", apiVersion: 1 } : helpData();
  if (key === "schema") {
    if (args[0] && !schemas[args[0]])
      usage(`Unknown schema. Choose ${Object.keys(schemas).join(", ")}.`);
    return args[0] ? schemas[args[0]] : schemas;
  }
  const url = baseUrl(options, appRoot);
  const client = new Client(
    url,
    integer(options["request-timeout"], 240, 1, 3600, "request-timeout"),
  );
  if (["status", "service status"].includes(key)) return client.health();
  if (["service start", "service stop"].includes(key)) {
    if (url !== baseUrl({}, appRoot, true))
      usage(
        "Service start/stop manage this installation's configured URL. Do not override its URL for lifecycle commands.",
      );
    if (key === "service stop" && !options.confirm)
      usage("service stop requires --confirm. Pause production first.");
    let health;
    try {
      health = await client.health();
    } catch (error) {
      if (error.code !== "SERVICE_UNAVAILABLE") throw error;
    }
    if (health && path.resolve(health.appRoot) !== path.resolve(appRoot))
      throw new CliError(
        "SERVICE_MISMATCH",
        "The running Frame service belongs to another app folder. Use that installation's CLI for lifecycle commands.",
      );
    if (key === "service start" && health)
      return { ...health, alreadyRunning: true };
    if (key === "service stop") {
      if (!health) return { stopped: true, alreadyStopped: true };
      let recorded;
      try {
        recorded = Number(
          fs.readFileSync(path.join(health.stateDir, "service.pid"), "utf8"),
        );
      } catch {}
      if (recorded !== health.processId)
        throw new CliError(
          "SERVICE_MISMATCH",
          "Frame is not the recorded background process. Stop it from its original terminal; no process was interrupted.",
        );
    }
    try {
      const result = await exec(
        process.execPath,
        [
          path.join(appRoot, "scripts/service.js"),
          key.endsWith("start") ? "start" : "stop",
        ],
        {
          cwd: appRoot,
          timeout: 30000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            ...(health ? { FRAME_DATA_DIR: health.stateDir } : {}),
          },
        },
      );
      return key.endsWith("start")
        ? { ...(await client.health()), message: result.stdout.trim() }
        : { stopped: true, message: result.stdout.trim() };
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(
        "SERVICE_ACTION_FAILED",
        "Could not change the background service. Check installation, configured storage and service.log.",
      );
    }
  }
  // Refuse accidental requests to another local app, or an older Frame build.
  await client.health();
  const getTask = async (taskId) =>
    reviewed(await client.request(`/tasks/${id(taskId)}`), options.revision);
  const save = async (task, patch) => {
    const payload = {
      ...patch,
      ...(patch.imageVariations
        ? {
            imageVariations: patch.imageVariations.map(
              ({ versions, ...config }) => ({ enabled: true, ...config }),
            ),
          }
        : {}),
    };
    return client.task(
      await client.request(
        `/tasks/${id(task.id)}`,
        { ...validateInput(payload, schemas.task), revision: task.revision },
        "PUT",
      ),
    );
  };
  const input = (file) => jsonInput(file, stdin);
  const queued = async (jobs) =>
    options.wait
      ? waitJobs(client, Array.isArray(jobs) ? jobs : [jobs], options)
      : Array.isArray(jobs)
        ? jobs.map((j) => client.job(j))
        : client.job(jobs);

  if (key === "capabilities") return client.request("/capabilities");
  if (key === "connection check")
    return client.request("/connection/check", {});
  if (key === "tasks list")
    return (await client.request(`/tasks${query(options)}`)).map((t) =>
      client.task(t),
    );
  if (key === "tasks create") {
    const body = options.file
      ? validateInput(await input(options.file), schemas.task)
      : {};
    for (const name of ["name", "prompt"])
      if (options[name]) body[name] = options[name];
    body.takes = integer(options.takes, body.takes ?? 1, 1, 20, "takes");
    return client.task(await client.request("/tasks", body));
  }
  if (key === "tasks get") return client.task(await getTask(args[0]));
  if (key === "tasks update") {
    const patch = validateInput(await input(options.file), schemas.task);
    const task = reviewed(await getTask(args[0]), patch.revision);
    return save(task, patch);
  }
  if (key === "tasks export") {
    const task = await getTask(args[0]);
    const config = Object.fromEntries(
      taskFields
        .filter(
          (k) =>
            !["startingFrame", "revision"].includes(k) && task[k] !== undefined,
        )
        .map((k) => [k, task[k]]),
    );
    config.imageVariations = imageRecipes(task).map(({ versions, ...c }) => c);
    return { taskId: task.id, revision: task.revision, config };
  }
  if (key === "tasks plan")
    return {
      ...(await client.request(`/tasks/${id(args[0])}/plan`)),
      uiUrl: client.link(args[0], "production"),
    };
  if (key === "tasks resolve") {
    const task = await getTask(args[0]),
      values = validateInput(await input(options.values), schemas.values);
    if (
      taskNames(task).some(
        (name) =>
          !task.variables
            .find((v) => v.name === name)
            ?.values.includes(values[name]),
      )
    )
      usage("Choose one exact list value for every active variable.");
    if (Object.keys(values).some((name) => !taskNames(task).includes(name)))
      usage("Values include an inactive or unknown variable.");
    return {
      taskId: task.id,
      revision: task.revision,
      values,
      videoPrompt: resolvePrompt(task.prompt, values),
      imagePrompts: activeImageRecipes(task).map((c) => ({
        sourceAssetId: c.sourceAssetId,
        prompt: resolvePrompt(c.prompt, values),
        settings: c.settings,
      })),
      uiUrl: client.link(task.id, "samples"),
    };
  }
  if (key === "tasks link") {
    const task = await getTask(args[0]),
      section = options.section || task.section;
    if (
      ![
        "references",
        "prompt",
        "variations",
        "samples",
        "production",
        "results",
      ].includes(section)
    )
      usage("Choose a valid task section.");
    return { taskId: task.id, uiUrl: client.link(task.id, section) };
  }
  if (key === "tasks open-folder") {
    const task = await getTask(args[0]);
    await client.request("/open-folder", { taskId: task.id });
    return { taskId: task.id, folder: task.folder, opened: true };
  }
  if (key === "references set-role") {
    const task = await getTask(args[0]);
    if (!task.references.some((r) => r.assetId === args[1]))
      usage("This asset is not a reference in the task.");
    const capabilities = await client.request("/capabilities");
    if (!capabilities.roles.includes(options.role))
      usage(
        "Supply --role using a supported reference purpose from capabilities.",
      );
    return save(task, {
      references: task.references.map((r) =>
        r.assetId === args[1] ? { ...r, role: options.role } : r,
      ),
    });
  }
  if (key === "tasks results") {
    const task = await getTask(args[0]);
    const [assets, runs] = await Promise.all([
      client.request(`/assets${query(options, { taskId: task.id })}`),
      client.request(`/runs?taskId=${id(task.id)}&limit=1000`),
    ]);
    return {
      taskId: task.id,
      folder: task.folder,
      uiUrl: client.link(task.id, "results"),
      assets: assets.map((a) => client.asset(a)),
      runs,
    };
  }
  if (key === "tasks improve") {
    const task = await getTask(args[0]),
      context = promptContext(task, options);
    const result = await client.request(`/tasks/${id(task.id)}/improve`, {
      target: context.target,
      sourceAssetId: context.sourceAssetId,
      feedback: options.feedback || "",
      revision: task.revision,
    });
    return options.apply
      ? save(task, promptPatch(task, context, result.prompt))
      : {
          ...result,
          taskId: task.id,
          revision: task.revision,
          target: context.target,
          sourceAssetId: context.sourceAssetId,
          applied: false,
        };
  }
  if (key === "tasks image") {
    const task = await getTask(args[0]),
      patch = await input(options.file);
    if (patch.sourceAssetId !== undefined && patch.sourceAssetId !== args[1])
      usage("The JSON sourceAssetId must match the asset ID in the command.");
    const existing = imageRecipes(task).find(
      (c) => c.sourceAssetId === args[1],
    );
    if (!task.references.some((r) => r.assetId === args[1]))
      usage(
        "Attach this reference to the task first. Use the task-owned asset ID returned by import/attach.",
      );
    const config = {
      enabled: true,
      prompt: "",
      ...existing,
      ...patch,
      sourceAssetId: args[1],
      settings: {
        model: "gemini-3.1-flash-image",
        aspectRatio: "auto",
        imageSize: "1K",
        ...existing?.settings,
        ...patch.settings,
      },
    };
    delete config.versions;
    validateInput(config, schemas["image-variation"]);
    return save(task, updateImageRecipe(task, config));
  }
  if (
    key.startsWith("tasks ") &&
    ["start", "resume", "pause", "stop", "duplicate", "delete"].includes(
      key.split(" ")[1],
    )
  ) {
    const action = key.split(" ")[1],
      task = await getTask(args[0]);
    if (action === "delete") {
      if (!options.confirm)
        usage(
          "tasks delete requires --confirm. Add --delete-media only to permanently remove local files.",
        );
      return client.request(
        `/tasks/${id(task.id)}`,
        { deleteMedia: !!options["delete-media"], revision: task.revision },
        "DELETE",
      );
    }
    if (["start", "resume"].includes(action)) {
      const plan = await client.request(`/tasks/${id(task.id)}/plan`);
      if (!plan.valid)
        throw new CliError(
          "TASK_INVALID",
          "Fix this task before starting production.",
          2,
          { plan },
        );
      reviewed(task, plan.revision);
    }
    const result = client.task(
      await client.request(`/tasks/${id(task.id)}/action`, {
        action,
        revision: task.revision,
      }),
    );
    if (!options.wait) return result;
    return waitFor(
      client,
      () => client.request(`/tasks/${id(task.id)}`).then((t) => client.task(t)),
      options,
      (t) => t.status === (action === "pause" ? "paused" : "stopped"),
      (t) => t.status === "attention",
    );
  }
  if (key === "variables set") {
    const task = await getTask(args[0]),
      patch = await input(options.file),
      existing = task.variables.find((v) => v.name === args[1]);
    if (patch.name !== undefined && patch.name !== args[1])
      usage("The JSON variable name must match the name in the command.");
    if (
      !taskNames(task).includes(args[1]) &&
      !imageRecipes(task).some((c) => promptNames(c.prompt).includes(args[1]))
    )
      usage(
        "Add the variable placeholder to a prompt first, or use variables make.",
      );
    const variable = {
      values: [],
      instructions: "",
      expand: false,
      ...existing,
      ...patch,
      name: args[1],
    };
    validateInput(variable, schemas.variable);
    return save(task, {
      variables: existing
        ? task.variables.map((v) => (v.name === variable.name ? variable : v))
        : [...task.variables, variable],
    });
  }
  if (["variables make", "variables suggest"].includes(key)) {
    const task = await getTask(args[0]),
      context = promptContext(task, options),
      selected = selection(context, options);
    if (key === "variables suggest")
      return {
        ...(await client.request(`/tasks/${id(task.id)}/suggest-variable`, {
          ...selected,
          target: context.target,
          sourceAssetId: context.sourceAssetId,
          revision: task.revision,
        })),
        taskId: task.id,
        revision: task.revision,
        selection: selected,
      };
    const name = args[1];
    validateInput(name, schemas.variable.properties.name, "variable name");
    const existing = task.variables.find((v) => v.name === name);
    const variables = existing
      ? task.variables
      : [
          ...task.variables,
          {
            name,
            values: [selected.text],
            instructions: options.instructions || "",
            expand: false,
          },
        ];
    return save(task, {
      ...promptPatch(
        task,
        context,
        context.prompt.slice(0, selected.start) +
          `{${name}}` +
          context.prompt.slice(selected.end),
      ),
      variables,
    });
  }
  if (key === "variables generate") {
    const task = await getTask(args[0]),
      variable = task.variables.find((v) => v.name === args[1]);
    if (!variable || !taskNames(task).includes(variable.name))
      usage("Choose an active variable from the saved task.");
    const count = integer(options.count, 5, 1, 50, "count");
    const result = await client.request(`/tasks/${id(task.id)}/variations`, {
      name: variable.name,
      count,
      revision: task.revision,
    });
    if (!options.apply)
      return {
        ...result,
        taskId: task.id,
        name: variable.name,
        applied: false,
      };
    return save(task, {
      variables: task.variables.map((v) =>
        v.name === variable.name
          ? { ...v, values: unique([...v.values, ...result.values]) }
          : v,
      ),
    });
  }
  if (key === "references remove") {
    const task = await getTask(args[0]);
    if (!task.references.some((r) => r.assetId === args[1]))
      usage("This asset is not a reference in the task.");
    return save(task, {
      references: task.references.filter((r) => r.assetId !== args[1]),
      imageVariations: imageRecipes(task).map((c) =>
        c.sourceAssetId === args[1] ? { ...c, enabled: false } : c,
      ),
    });
  }
  if (["samples generate", "frames preview"].includes(key)) {
    const task = await getTask(args[0]),
      values = options.values
        ? validateInput(await input(options.values), schemas.values)
        : {};
    const body = { values, revision: task.revision };
    if (key === "samples generate")
      body.count = integer(options.count, 1, 1, 8, "count");
    else {
      if (!options.source) usage("frames preview requires --source ASSET_ID.");
      body.sourceAssetId = options.source;
      body.regenerate = !!options.regenerate;
    }
    return queued(
      await client.request(
        `/tasks/${id(task.id)}/${key === "samples generate" ? "samples" : "frame-preview"}`,
        body,
      ),
    );
  }
  if (key === "jobs list")
    return (await client.request(`/jobs${query(options)}`)).map((j) =>
      client.job(j),
    );
  if (key === "jobs get")
    return client.job(await client.request(`/jobs/${id(args[0])}`));
  if (key === "jobs wait")
    return waitJobs(
      client,
      args.map((jobId) => ({ id: jobId })),
      options,
    );
  if (["jobs retry", "jobs repeat", "jobs reconcile"].includes(key)) {
    const body =
      key === "jobs reconcile"
        ? { providerId: options["provider-id"] }
        : key === "jobs retry"
          ? { confirmDuplicateRisk: !!options["confirm-duplicate-risk"] }
          : {};
    if (key === "jobs reconcile" && !body.providerId)
      usage("Supply --provider-id from Google AI Studio.");
    return queued(
      await client.request(`/jobs/${id(args[0])}/${key.split(" ")[1]}`, body),
    );
  }
  if (key === "assets list")
    return (await client.request(`/assets${query(options)}`)).map((a) =>
      client.asset(a),
    );
  if (key === "assets get")
    return client.asset(await client.request(`/assets/${id(args[0])}`));
  if (key === "assets import") {
    let bytes;
    try {
      if (fs.statSync(args[0]).size > 100 * 1024 * 1024)
        usage("Files must be at most 100 MiB.");
      bytes = fs.readFileSync(args[0]);
    } catch (error) {
      if (error instanceof CliError) throw error;
      usage(
        "Could not read the local media file. Check its path and permissions.",
      );
    }
    const video = [".mp4", ".webm"].includes(
      path.extname(args[0]).toLowerCase(),
    );
    const duration =
      options.duration === undefined ? undefined : Number(options.duration);
    if (video && (!Number.isFinite(duration) || duration <= 0))
      usage(
        "Supply the video's duration in seconds with --duration. Read it from media metadata; do not guess.",
      );
    if (options.role && !options.task)
      usage("Use --role only when importing into a task with --task.");
    const form = new FormData();
    form.append("file", new Blob([bytes]), path.basename(args[0]));
    if (options.task) {
      const task = await getTask(options.task);
      form.append("taskId", task.id);
      form.append("revision", String(task.revision));
    }
    if (options.role) form.append("role", options.role);
    if (duration !== undefined) form.append("duration", String(duration));
    return client.asset(await client.request("/assets/upload", form));
  }
  if (key === "assets attach") {
    if (!options.task) usage("assets attach requires --task TASK_ID.");
    const task = await getTask(options.task);
    return client.asset(
      await client.request(`/assets/${id(args[0])}/attach`, {
        taskId: task.id,
        role: options.role,
        revision: task.revision,
      }),
    );
  }
  if (key === "assets delete") {
    if (!options.confirm)
      usage(
        "assets delete requires --confirm and permanently removes local files.",
      );
    return client.request(
      `/assets/${id(args[0])}`,
      { confirmDelete: true },
      "DELETE",
    );
  }
  if (["studio optimize", "studio generate"].includes(key)) {
    const body = validateInput(await input(options.file), schemas.studio);
    const result = await client.request(`/studio/${key.split(" ")[1]}`, body);
    return key === "studio generate"
      ? queued(result)
      : { ...result, applied: false };
  }
  if (key === "settings get") {
    return client.request("/settings");
  }
  if (key === "settings set") {
    if (!options["output-dir"])
      usage("Supply --output-dir with a local directory.");
    return client.request(
      "/settings",
      { outputDir: path.resolve(options["output-dir"]) },
      "PUT",
    );
  }
  usage(`Command ${key} is not implemented.`);
}

export async function main(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout || process.stdout,
    stderr = io.stderr || process.stderr;
  let parsed;
  try {
    parsed = parseArgs(argv);
    const data = await execute(parsed, io);
    stdout.write(
      JSON.stringify(
        { ok: true, command: parsed.key, data },
        null,
        parsed.options.pretty ? 2 : undefined,
      ) + "\n",
    );
    return 0;
  } catch (error) {
    const known = error instanceof CliError;
    stderr.write(
      JSON.stringify({
        ok: false,
        command: parsed?.key || null,
        error: {
          code: known ? error.code : "CLI_ERROR",
          message: known
            ? error.message
            : "The command could not complete. Check local files and service state.",
          ...(known && error.details ? { details: error.details } : {}),
        },
      }) + "\n",
    );
    return known ? error.exitCode : 1;
  }
}
