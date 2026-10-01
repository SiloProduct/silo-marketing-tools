# Frame CLI for creative assistants

The CLI lets any assistant with local command access use the same tasks, reference library, samples, production runs, and files as the Frame UI. It calls the local background service; it does not open the SQLite database, run a second worker, or send the Gemini key to the assistant. The UI remains available for review and manual editing.

The bundled [Frame creative workflow skill](../../../.agents/skills/frame-creative-workflow/SKILL.md) uses this interface to guide a fresh agent session through ideation, references, shared variations, samples and production. [AGENTS.md](../AGENTS.md) routes project creative requests to it. This guide remains the detailed CLI contract.

## Install and discover

Use the user's verified **local, non-synced installation**, configured according to [START-HERE-WINDOWS.md](../START-HERE-WINDOWS.md). Node and dependencies must already be installed. There is no additional CLI dependency or API key argument.

From the app folder:

```text
node scripts/frame.js --help
node scripts/frame.js schema task --pretty
node scripts/frame.js service start
node scripts/frame.js status
node scripts/frame.js capabilities
```

`--help` returns a machine-readable registry with every command, positional argument, flag, and exit code. `schema` returns JSON input schemas and works without a running service. `capabilities` gets the actual supported model identifiers, settings, roles, and limits from the service.

You can call `node /absolute/path/to/app/scripts/frame.js …` from another directory. The service URL is resolved from this app's `.env`, not the caller's folder. Paths passed with `--file`, `--values`, and `assets import` resolve from the caller's working directory.

Optional: run `npm link` once in the local app folder to install the `frame` command for that user. Then use `frame …` on macOS, or `frame.cmd …` in Windows PowerShell. `node scripts/frame.js …` works without global installation. `npm run cli -- …` also works, but npm may add log lines; use direct Node or the linked executable when parsing JSON.

By default the CLI connects to `http://127.0.0.1:4310`. It honors the installation's `PORT`. `--url http://127.0.0.1:PORT` or `FRAME_URL` can select another local Frame service. Remote addresses are rejected. Service lifecycle commands manage only this installation's configured endpoint and verify the running process before stopping it. An old service without API v1 needs to be updated/restarted before using these commands.

## Input and output contract

JSON is the default. Success writes one JSON document to stdout:

```json
{
  "ok": true,
  "command": "tasks get",
  "data": {
    "id": "…",
    "revision": 3,
    "uiUrl": "http://127.0.0.1:4310/#task/…/prompt"
  }
}
```

Errors write one JSON document to stderr and return a nonzero exit code. `--pretty` indents successful JSON. `--json` is accepted for callers that explicitly request JSON.

| Exit | Meaning                                                                                                                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0    | Success; a queued generation is not necessarily finished unless `--wait` was used.                                             |
| 1    | Service, API, or local file failure. Inspect the error code/message.                                                           |
| 2    | Invalid command/input or task not ready for production.                                                                        |
| 3    | Task changed, is not currently editable, or another API conflict. Read current state before acting again.                      |
| 4    | Waiting timed out; the generation continues in the background.                                                                 |
| 5    | Generation needs attention, including failed, blocked, uncertain, or cancelled jobs. Latest state is in `error.details.state`. |

Use UTF-8 JSON files to avoid quoting prompts in a shell. `--file PATH` reads task, variable, image, or studio inputs; `--values PATH` reads selected sample values. Both accept `-` for stdin. Input is limited to 2 MiB. PowerShell JSON files with a UTF-8 BOM are supported.

Do not interpolate user prompts into shell command strings. Prefer a structured process argument array and a saved JSON file or stdin. Do not put secrets in command arguments or logs. The CLI reports key presence and can check connection access; it does not return the key.

## Creative workflow

Converse in the user's preferred language. Brainstorm and clarify their creative direction in chat, then write **English generation prompts, variable instructions, and variation values**. Keep literal text/names in their intended language when those are supposed to appear or be spoken in the output. The CLI does not automatically translate every submitted string; the assistant writes English, or can request a Gemini optimization proposal. Preserve user intent and leave placeholders unresolved.

The normal sequence is: create a draft → add references → configure video/image prompts → build lists → inspect plan → make a sample → review in chat or UI → explicitly start production when authorized. User authorization can cover multiple steps; the CLI does not add interactive permission prompts.

### Create and edit a draft

```text
node scripts/frame.js tasks create --file examples/agent-task.json
node scripts/frame.js tasks get TASK_ID
node scripts/frame.js tasks update TASK_ID --file patch.json --revision 3
node scripts/frame.js tasks plan TASK_ID
node scripts/frame.js tasks link TASK_ID --section prompt
```

Replace uppercase IDs and revision numbers with actual returned values. Task creation accepts complete prompt/list/settings configuration and defaults to **one take** for CLI-created tasks. Creating and updating never starts production. Other UI defaults are unchanged.

Updates are partial. `settings` merges supplied fields; arrays such as `variables`, `references`, and `imageVariations` replace the respective array. Use targeted commands to edit one variable or image recipe without replacing the others. `tasks export` returns `{taskId, revision, config}`; save `data.config` as a reusable configuration file. Reference asset IDs remain specific to the original task. To copy a task with its original references, use `tasks duplicate` instead of blindly reusing those IDs in another task.

Every task has a revision. Read it before editing and pass `--revision` when applying an earlier reviewed change or starting an approved task. The CLI also protects the read/save interval automatically. If the UI changes while Gemini is optimizing or suggesting ideas, `--apply` cannot overwrite that newer draft. A conflict requires a fresh read/review; the CLI does not silently retry the write.

### Import or generate references

```text
node scripts/frame.js assets import "/local/path/original.png" --task TASK_ID --role "Starting frame"
node scripts/frame.js assets import "/local/path/clip.mp4" --duration 3 --task TASK_ID --role "Visual style"
node scripts/frame.js assets list --limit 100
node scripts/frame.js assets attach ASSET_ID --task TASK_ID --role "Subject appearance"
node scripts/frame.js references set-role TASK_ID TASK_ASSET_ID --role "Composition"
node scripts/frame.js references remove TASK_ID TASK_ASSET_ID
```

Import/attach returns the **task-owned asset ID** to use in subsequent image recipes. Attaching library media makes a managed copy; removing a reference retains its local file. Use `capabilities` for exact role names. Video imports need an accurate duration in seconds from media metadata; do not guess it. The server validates the actual file signature. Files are limited to 100 MiB.

Reference studio is also available through CLI:

```text
node scripts/frame.js studio optimize --file examples/agent-studio.json
node scripts/frame.js studio generate --file examples/agent-studio.json --wait
node scripts/frame.js assets get GENERATED_ASSET_ID
```

`studio optimize` proposes English wording without changing anything. To refine an asset, provide its ID as `parentId` in the studio JSON, plus the follow-up prompt. To use reference assets alongside generation or refinement, supply `references: [{"assetId":"…","role":"Visual style"}]`. Use the returned studio asset with `assets attach` to add it to a task.

### Configure image and video variations

```text
node scripts/frame.js tasks image TASK_ID TASK_ASSET_ID --file examples/agent-image-edit.json
node scripts/frame.js variables set TASK_ID food_items --file examples/agent-food-list.json
node scripts/frame.js variables make TASK_ID camera_movement --text "slow orbit"
node scripts/frame.js variables suggest TASK_ID --target image --source TASK_ASSET_ID --text "fresh fruit"
node scripts/frame.js variables generate TASK_ID food_items --count 5
node scripts/frame.js variables generate TASK_ID food_items --count 5 --apply
node scripts/frame.js tasks improve TASK_ID --feedback "Keep only the requested camera action"
node scripts/frame.js tasks improve TASK_ID --target image --source TASK_ASSET_ID --apply
```

`tasks image` upserts one image recipe while preserving the others. Its input may omit `sourceAssetId` because the command specifies it; use `enabled:false` to disable that recipe. Any supported image reference purpose can vary, and several images can vary together. Each edited version starts from its own original image. Image settings default to Flash Image, Auto format, and 1K.

`variables make` replaces ordinary selected text with `{name}` and seeds a new list from that text. If the variable already exists, it reuses the existing shared list. `variables suggest` only proposes a name and instructions; make or update the variable after review. `--text` must occur exactly once. For repeated text, supply zero-based `--start` and `--end` offsets (JavaScript UTF-16 indices). Image-target commands require `--target image --source TASK_ASSET_ID`; video is the default.

Use selection commands only for ordinary text actually present in the saved prompt. The supplied example files already contain their placeholders, so their runnable sequence does not need `variables make` or `variables suggest` again.

`variables set` replaces one variable's ordered values and can edit `instructions` and `expand`. `variables generate` proposes values; `--apply` explicitly appends them with exact-repeat filtering and revision protection. `tasks improve` similarly proposes wording unless `--apply` is specified. Assistance uses the same Gemini instructions and actual reference context as the UI.

All lists share one variable collection. Names used in image and video prompts share one value and count once. `tasks plan` returns validation issues, combinations, takes, initial video count, reusable/missing image counts, stage labels, and the reviewed revision. It does not generate anything. Continuous counts describe the initial lists; expansion may add more videos, bounded by an optional per-run limit. `limit` counts videos, not image requests.

### Generate and review a sample

```text
node scripts/frame.js tasks resolve TASK_ID --values examples/agent-values.json
node scripts/frame.js frames preview TASK_ID --source TASK_ASSET_ID --values examples/agent-values.json --wait
node scripts/frame.js samples generate TASK_ID --values examples/agent-values.json --count 1 --wait
node scripts/frame.js tasks link TASK_ID --section samples
```

Values must be exact entries from the saved lists. Samples require one value for every active variable. An image-only preview requires values for that image's variables. A sample prepares missing edited images automatically; saved preview images are reused. Sample videos never consume production slots.

`--wait` returns completed jobs with an `asset` containing an absolute `file` path, a local `mediaUrl`, MIME type, and generation metadata. Present the actual media in chat using the assistant's supported image/video attachment or preview mechanism. If that chat can render local files, use `asset.file`. A local URL is accessible only on the same computer; a cloud chat cannot fetch `127.0.0.1`. Use its authorized file-upload tools or give the task's `uiUrl` to review in Frame. Do not claim playback occurred unless it was actually displayed.

Without `--wait`, the CLI returns queued job IDs immediately. `jobs get JOB_ID` or `jobs wait JOB_ID …` retrieves results later. Waiting defaults to 600 seconds with a 2-second poll interval; `--timeout` and `--interval` adjust it. A wait timeout never stops or resubmits a job. Network requests have a separate `--request-timeout` (default 240 seconds).

To regenerate a preview, use `frames preview … --regenerate`. Earlier versions and completed videos retain their original image; a successful replacement applies to future work.

### Produce and manage results

```text
node scripts/frame.js tasks start TASK_ID --revision REVIEWED_REVISION
node scripts/frame.js tasks get TASK_ID
node scripts/frame.js jobs list --task TASK_ID
node scripts/frame.js tasks pause TASK_ID --wait
node scripts/frame.js tasks resume TASK_ID --revision CURRENT_REVISION
node scripts/frame.js tasks results TASK_ID --kind production
node scripts/frame.js tasks open-folder TASK_ID
```

Start/resume validates the saved task and uses revision checks. Pause stops new submissions at both image and video stages and lets active requests finish. Once paused, edit and resume through either CLI or UI. Starting again defaults to unfinished work; outputs retain immutable generation details. Images are reused across camera choices and takes.

`tasks stop` ends the run while keeping output. `tasks duplicate` creates a new draft with original references and configuration, without copied completion/cache history. `jobs repeat` explicitly makes an additional take from the exact completed snapshot.

Collection commands support `--limit` (1–1000, default 100) and `--offset`. Filter jobs by `--task`, `--run`, `--status`, or `--kind`; filter assets/results by task, run, or kind. Kinds include `studio`, `reference`, `frame`, `sample`, and `production`. Results include file paths, URLs, values, resolved prompts/settings, and the exact `generatedReferences` each video used.

### Errors, recovery and deletion

```text
node scripts/frame.js jobs get JOB_ID
node scripts/frame.js jobs retry JOB_ID --wait
node scripts/frame.js jobs reconcile JOB_ID --provider-id GOOGLE_INTERACTION_ID --wait
node scripts/frame.js jobs retry JOB_ID --confirm-duplicate-risk
node scripts/frame.js tasks delete TASK_ID --confirm
node scripts/frame.js tasks delete TASK_ID --confirm --delete-media
node scripts/frame.js assets delete STUDIO_ASSET_ID --confirm
```

Image failures block dependent videos, while other combinations can continue. Inspect `snapshot.frameDependencies` and the relevant image jobs. Retry the failed image rather than creating an unrelated replacement; the background service preserves dependencies.

For uncertain requests, reconcile a known Google interaction ID first. A retry that could duplicate an accepted request requires `--confirm-duplicate-risk`, following the user's authorization. The CLI never automatically resubmits writes after a network interruption: `OUTCOME_UNKNOWN` means inspect task/job state before trying again.

Destructive commands require `--confirm`. Task deletion keeps local media by default; `--delete-media` explicitly removes it. Studio asset deletion removes its managed media and sidecar. In-use assets and task-owned media retain the API's existing protections.

`settings get` reports the output directory and connection presence. `settings set --output-dir /local/path` sets the directory for new tasks. `connection check` verifies account access. For complete shutdown, pause tasks first, then `service stop --confirm`. The browser can close while production continues; the computer and local service must remain running and awake.

## Runnable example sequence

The example files describe a two-food, two-camera, one-take batch: **2 edited reference images and 4 production videos**, plus any original studio media/sample takes. To try it, create the draft from `examples/agent-task.json`, import a suitable starting image (or generate one with `examples/agent-studio.json` and attach it), configure it with `examples/agent-image-edit.json`, then set the food list from `examples/agent-food-list.json`. Resolve/preview/sample with `examples/agent-values.json`, inspect the plan and results, and start when the user's request authorizes production.

Creation itself is free of generation requests. Gemini assistance, previews, samples, studio generation and production use the privately configured Google account. Installation/onboarding alone does not authorize paid generation; use the current user's request to establish sample or batch scope, and explain the plan counts before starting.

## Verification

`npm test` includes real CLI subprocess tests against an isolated HTTP service and fake Gemini provider. It covers UTF-8/stdin, drafts, concurrent-edit conflicts, file imports, image/video variables, Gemini assistance, previews, sample reuse, production counts, chat-usable asset outputs, guarded deletion, and job recovery/timeouts. These tests do not spend Gemini credits or establish live generation quality. Verify native Windows installation/launcher behavior on the colleague's Windows computer.
