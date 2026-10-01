export const taskFields = [
  "name",
  "prompt",
  "variables",
  "references",
  "imageVariations",
  "startingFrame",
  "settings",
  "mode",
  "takes",
  "limit",
  "section",
  "revision",
];
const variable = {
  type: "object",
  required: ["name", "values"],
  additionalProperties: false,
  properties: {
    name: { type: "string", pattern: "^[a-zA-Z][a-zA-Z0-9_]*$" },
    values: { type: "array", items: { type: "string" }, maxItems: 2000 },
    instructions: { type: "string" },
    expand: { type: "boolean" },
  },
};
const image = {
  type: "object",
  required: ["sourceAssetId", "prompt"],
  additionalProperties: false,
  properties: {
    sourceAssetId: { type: "string" },
    enabled: { type: "boolean", default: true },
    prompt: { type: "string" },
    settings: {
      type: "object",
      additionalProperties: false,
      properties: {
        model: { type: "string" },
        aspectRatio: { type: "string", default: "auto" },
        imageSize: { enum: ["1K", "2K", "4K"] },
      },
    },
  },
};
export const schemas = {
  task: {
    type: "object",
    additionalProperties: false,
    properties: {
      name: { type: "string", maxLength: 160 },
      prompt: { type: "string", maxLength: 30000 },
      variables: { type: "array", items: variable, maxItems: 12 },
      references: {
        type: "array",
        maxItems: 14,
        items: {
          type: "object",
          required: ["assetId", "role"],
          additionalProperties: false,
          properties: { assetId: { type: "string" }, role: { type: "string" } },
        },
      },
      imageVariations: { type: "array", items: image, maxItems: 14 },
      startingFrame: {
        type: ["object", "null"],
        properties: image.properties,
        additionalProperties: false,
      },
      settings: {
        type: "object",
        additionalProperties: false,
        properties: {
          model: { type: "string" },
          aspectRatio: { enum: ["16:9", "9:16"] },
          resolution: { enum: ["360p", "720p", "1080p", "4k"] },
          task: {
            enum: [
              "auto",
              "text_to_video",
              "image_to_video",
              "reference_to_video",
              "edit",
              "extend",
            ],
          },
        },
      },
      mode: { enum: ["batch", "continuous"] },
      takes: { type: "integer", minimum: 1, maximum: 20 },
      limit: { type: ["integer", "null"], minimum: 1 },
      section: {
        enum: ["references", "prompt", "variations", "samples", "production"],
      },
      revision: { type: "integer" },
    },
    notes: [
      "Prompts should be English; the assistant can converse in any language.",
      "Create a draft, then import/attach task-owned references before configuring image variations.",
      "Updates are partial; arrays replace existing arrays. settings is merged. Pass revision from the reviewed task to protect UI edits.",
      "Creation uses takes=1 unless explicitly provided by the agent. Saving does not start production.",
      "Model identifiers and reference roles come from the capabilities command.",
    ],
  },
  variable,
  "image-variation": image,
  values: {
    type: "object",
    additionalProperties: { type: "string" },
    description:
      "One exact list value per active variable, including variables used by images. Shared variable names have one value.",
  },
  studio: {
    type: "object",
    required: ["prompt", "model"],
    additionalProperties: false,
    properties: {
      prompt: { type: "string" },
      model: { type: "string" },
      parentId: { type: "string" },
      references: {
        type: "array",
        items: {
          type: "object",
          properties: { assetId: { type: "string" }, role: { type: "string" } },
        },
      },
      aspectRatio: { type: "string" },
      imageSize: { enum: ["1K", "2K", "4K"] },
      resolution: { enum: ["360p", "720p", "1080p", "4k"] },
    },
    description:
      "Generate/refine reference media, or propose an optimized prompt. parentId refines an existing asset; references guide the result.",
  },
};

// One command registry drives parsing and discovery; unknown options are errors.
export const commands = {
  status: {
    args: [],
    options: [],
    description: "Local service health and Gemini key presence; no generation.",
  },
  capabilities: {
    args: [],
    options: [],
    description:
      "Supported model IDs, roles, settings and limits from the service.",
  },
  schema: {
    args: ["NAME?"],
    options: [],
    description:
      "JSON input schemas: task, variable, image-variation, values, studio.",
  },
  "service status": {
    args: [],
    options: [],
    description: "Check the background service.",
  },
  "service start": {
    args: [],
    options: [],
    description:
      "Start the configured local background service; no generation.",
  },
  "service stop": {
    args: [],
    options: ["confirm"],
    description:
      "Stop the configured service; requires --confirm. Pause production first.",
  },
  "connection check": {
    args: [],
    options: [],
    description: "Check Gemini account/model access without generating media.",
  },
  "tasks list": {
    args: [],
    options: ["status=", "limit=", "offset="],
    description: "List saved tasks.",
  },
  "tasks get": {
    args: ["TASK"],
    options: [],
    description: "Read a task, revision, progress and UI link.",
  },
  "tasks create": {
    args: [],
    options: ["file=", "name=", "prompt=", "takes="],
    description:
      "Create a saved draft from JSON or simple options; never starts production.",
  },
  "tasks update": {
    args: ["TASK"],
    options: ["file=", "revision="],
    description:
      "Apply a JSON patch to an editable task, protecting concurrent UI changes.",
  },
  "tasks export": {
    args: ["TASK"],
    options: [],
    description:
      "Return editable configuration JSON; asset IDs belong to this task.",
  },
  "tasks plan": {
    args: ["TASK"],
    options: [],
    description:
      "Validate and count saved combinations, videos, and reusable images without generation.",
  },
  "tasks resolve": {
    args: ["TASK"],
    options: ["values="],
    description:
      "Preview resolved English video/image prompts for selected list values.",
  },
  "tasks improve": {
    args: ["TASK"],
    options: ["target=", "source=", "feedback=", "apply", "revision="],
    description: "Use Gemini to propose a prompt. --apply explicitly saves it.",
  },
  "tasks image": {
    args: ["TASK", "ASSET"],
    options: ["file=", "revision="],
    description:
      "Configure/disable one image variation from JSON; preserve other recipes.",
  },
  "tasks start": {
    args: ["TASK"],
    options: ["revision="],
    description: "Validate and explicitly start paid production.",
  },
  "tasks resume": {
    args: ["TASK"],
    options: ["revision="],
    description: "Resume unfinished production.",
  },
  "tasks pause": {
    args: ["TASK"],
    options: ["revision=", "wait", "timeout=", "interval="],
    description:
      "Stop new submissions; active requests finish. --wait awaits paused state.",
  },
  "tasks stop": {
    args: ["TASK"],
    options: ["revision=", "wait", "timeout=", "interval="],
    description: "End this run and retain outputs.",
  },
  "tasks duplicate": {
    args: ["TASK"],
    options: ["revision="],
    description: "Copy configuration and original references to a new draft.",
  },
  "tasks delete": {
    args: ["TASK"],
    options: ["confirm", "delete-media", "revision="],
    description:
      "Delete a task; keep local media unless --delete-media. Requires --confirm.",
  },
  "tasks results": {
    args: ["TASK"],
    options: ["kind=", "run=", "limit=", "offset="],
    description:
      "List task media with absolute paths, preview URLs, details and results UI link.",
  },
  "tasks link": {
    args: ["TASK"],
    options: ["section="],
    description: "Return a link to review the task in Frame.",
  },
  "tasks open-folder": {
    args: ["TASK"],
    options: [],
    description:
      "Open the task's managed media folder in Finder or Windows Explorer.",
  },
  "references set-role": {
    args: ["TASK", "ASSET"],
    options: ["role=", "revision="],
    description:
      "Change the purpose of one attached reference while retaining its image recipe.",
  },
  "variables set": {
    args: ["TASK", "NAME"],
    options: ["file=", "revision="],
    description:
      "Edit one variable's ordered list, instructions and continuous expansion.",
  },
  "variables make": {
    args: ["TASK", "NAME"],
    options: [
      "text=",
      "start=",
      "end=",
      "target=",
      "source=",
      "instructions=",
      "revision=",
    ],
    description:
      "Replace selected prompt text with a variable; seed a new list from that text.",
  },
  "variables suggest": {
    args: ["TASK"],
    options: ["text=", "start=", "end=", "target=", "source=", "revision="],
    description:
      "Gemini suggests a variable name and instructions for selected text; does not save.",
  },
  "variables generate": {
    args: ["TASK", "NAME"],
    options: ["count=", "apply", "revision="],
    description:
      "Propose distinct ideas; --apply appends them while preserving revision checks.",
  },
  "references remove": {
    args: ["TASK", "ASSET"],
    options: ["revision="],
    description:
      "Detach a reference and disable its image variation; retain managed files.",
  },
  "samples generate": {
    args: ["TASK"],
    options: [
      "values=",
      "count=",
      "revision=",
      "wait",
      "timeout=",
      "interval=",
    ],
    description:
      "Generate paid sample takes, preparing missing image variations first.",
  },
  "frames preview": {
    args: ["TASK"],
    options: [
      "source=",
      "values=",
      "revision=",
      "regenerate",
      "wait",
      "timeout=",
      "interval=",
    ],
    description:
      "Preview/regenerate an edited reference image without a video.",
  },
  "jobs list": {
    args: [],
    options: ["task=", "status=", "kind=", "run=", "limit=", "offset="],
    description: "List generation jobs and their dependencies.",
  },
  "jobs get": {
    args: ["JOB"],
    options: [],
    description:
      "Read progress, exact snapshot, errors, dependencies and completed asset.",
  },
  "jobs wait": {
    args: ["JOB..."],
    options: ["timeout=", "interval="],
    description:
      "Wait for jobs to finish; failure/timeout returns nonzero with latest state.",
  },
  "jobs retry": {
    args: ["JOB"],
    options: ["confirm-duplicate-risk", "wait", "timeout=", "interval="],
    description:
      "Retry failed work. Uncertain submissions require explicit duplicate-risk acknowledgement.",
  },
  "jobs reconcile": {
    args: ["JOB"],
    options: ["provider-id=", "wait", "timeout=", "interval="],
    description: "Recover an uncertain provider operation by interaction ID.",
  },
  "jobs repeat": {
    args: ["JOB"],
    options: ["wait", "timeout=", "interval="],
    description:
      "Explicitly generate another take from an immutable completed snapshot.",
  },
  "assets list": {
    args: [],
    options: ["task=", "kind=", "run=", "limit=", "offset="],
    description: "List registered media.",
  },
  "assets get": {
    args: ["ASSET"],
    options: [],
    description: "Get local file path, preview URL and generation metadata.",
  },
  "assets import": {
    args: ["FILE"],
    options: ["task=", "role=", "duration="],
    description:
      "Import one local image/video, optionally as a task reference. Video duration must be supplied.",
  },
  "assets attach": {
    args: ["ASSET"],
    options: ["task=", "role=", "revision="],
    description: "Copy library/result media into a task's managed references.",
  },
  "assets delete": {
    args: ["ASSET"],
    options: ["confirm"],
    description:
      "Permanently delete a studio asset and sidecar. Requires --confirm; task media is protected.",
  },
  "studio optimize": {
    args: [],
    options: ["file="],
    description:
      "Propose an optimized English studio prompt using model and actual reference context.",
  },
  "studio generate": {
    args: [],
    options: ["file=", "wait", "timeout=", "interval="],
    description: "Generate/refine paid reference media from JSON.",
  },
  "settings get": {
    args: [],
    options: [],
    description: "Read output directory; never reveals the API key.",
  },
  "settings set": {
    args: [],
    options: ["output-dir="],
    description: "Set a local output directory for new tasks.",
  },
};
export const globals = [
  "url=",
  "request-timeout=",
  "pretty",
  "json",
  "help",
  "version",
];
export function helpData() {
  return {
    name: "frame",
    version: "1.0.0",
    apiVersion: 1,
    transport: "Local Frame HTTP service",
    globalOptions: globals,
    commands,
    schemas: Object.keys(schemas),
    json: "stdout: {ok:true, command, data}; stderr: {ok:false, command, error}. JSON is the default; --pretty indents it.",
    input:
      "--file PATH (or - for UTF-8 JSON stdin); --values PATH (or -). Shell paths resolve from the caller's directory.",
    exitCodes: {
      0: "success",
      1: "service/API failure",
      2: "usage/input error",
      3: "revision/edit conflict",
      4: "wait timed out (job continues)",
      5: "generation needs attention",
    },
  };
}
