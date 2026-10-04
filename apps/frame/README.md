# Frame — local video production studio

A minimal creative workspace for Gemini video batches, prompt variations, sample takes, and a reusable reference library. React interface; a local Node service with a durable SQLite queue. Closing the browser does not stop production.

This is an operating reference for the AI assistant. Handle technical setup and app operation for the teammate; use Frame's browser UI for their review and direct interaction. Start onboarding from the [repository README](../../README.md), explain scope choices simply, and reuse an existing installation where present. Do not ask the teammate to execute this technical guide.

Install or update selected components through the [repository installation guide](../../docs/install-update.md). The repository provides Frame with its workflow skill, Silo marketing guidance alone, or both. On Windows, use [Windows setup and onboarding](START-HERE-WINDOWS.md).

For creative assistance, use [Frame Creative Workflow](../../.agents/skills/frame-creative-workflow/SKILL.md). For Silo work, also load [Silo Visual Marketing](../../.agents/skills/silo-visual-marketing/SKILL.md) when installed. Their single maintained packages live at the shared repository root, alongside this app. Agents without a skill loader can read the files directly. [AGENTS.md](AGENTS.md) routes creative and engineering requests.

The [agent CLI guide](docs/agent-cli.md) documents `node scripts/frame.js`; use `--help`, `schema task` and `capabilities` for the installed contract. Agents and the browser share saved tasks and one local service.

## Assistant setup on macOS or Windows

Requires **Node.js 22.13 or newer** with `node:sqlite` available. Use a permanent local installation outside active cloud synchronization. Marketing-only installation does not need Node.

After managed installation and runtime configuration through the repository guide, perform these steps from the verified installed app folder:

1. Run `npm ci` (`npm.cmd ci` in Windows PowerShell) using the verified Node runtime.
2. Copy `.env.example` to `.env` only if no `.env` exists. Drafts and exploration need no key.
3. Run `npm run build`, then `npm start` if the verified service is not already running.
4. Verify service health and show the teammate the returned app URL. The default is **http://127.0.0.1:4310**; preserve a configured custom port.

If connection setup is needed, guide the teammate to enter their privately obtained key directly in **Settings → Gemini connection → Save connection**; never ask for it in chat. Frame stores it in the backend’s `.env` file and uses it immediately. The saved key is never sent back to the browser. Private local configuration can alternatively set `GEMINI_API_KEY` in `.env` followed by a restart. Google supports standard and newer authorization keys; Frame accepts both formats. If Google reports “Multiple authentication credentials” after submission, ask the account owner for another key verified for video generation and save it in Settings. This has been reported with some `AQ.` keys despite successful model listing; it is not evidence that all such keys are invalid. Preserve the submitted interaction ID and check its status before retrying to avoid duplicate work. See [Google’s current key documentation](https://ai.google.dev/gemini-api/docs/api-key).

In Settings, **Choose folder** opens the macOS/Windows folder picker for the teammate's media location.

After the initial install/build, verify **Start Frame.command** on macOS or **Start Frame.bat** on Windows, then leave the teammate a simple double-click workflow. These start the background service and open the browser. Handle stopping through `npm stop` from the verified installation, after settling active work. Restart after changing `.env`. These launchers are for the default port; a custom `PORT` is printed by `npm start`.

`npm run dev` runs the server with Vite hot reload. `npm run serve` runs the production server in the foreground. Do not run multiple services on the same port.

## Workflow

Use these UI behaviors to operate the app and explain the relevant creative step. Load the workflow skill for the agent procedure; do not make the teammate learn every feature before beginning.

- **New task** creates a local draft and folder immediately. **Explore an example** creates an editable pet-video prompt, not pre-generated media.
- Import or generate references. Each reference has a purpose and stays fixed across a task.
- Write a prompt. Select words, choose **Make variable**, then review the optional **Improve prompt** proposal.
- Add ordered values for each variable, or ask Gemini for distinct ideas. Values are combined exhaustively.
- To vary reference images, select **Vary this image** in References for any image purpose. Several images can vary together. Write the video prompt and each image edit prompt in **Prompt**, using the same variable controls, then manage all lists in **Variations**. Shared variables count once; image and video totals are shown separately. Samples can preview each image independently, and production reuses those images across video variations and takes.
- Choose a combination in **Samples**. Samples save immediately and never count toward production.
- In **Production**, choose format, resolution, takes per combination, and batch or continuous mode. Saving never starts generation.
- Pause lets active requests finish before editing. Changes affect unfinished combinations; existing videos keep their original metadata.
- Use **Results** to browse, inspect provenance, make an additional take, or open the folder in your media tools.
- **Reference studio** supports images, videos, imported assets and refinement history. Select versions to compare, refine a selected version, then add it to a task.
- Image refinement defaults to **Auto · Match original** format. This omits Gemini's aspect-ratio override so the model can match the source proportions, including sources outside the listed presets. Resolution remains independently selectable; auto does not promise identical pixel dimensions. Explicit aspect ratios remain available, while video keeps its supported fixed formats.
- In the studio, **Choose references** selects multiple assets from the library or imports files directly into the selection. **Use as reference** adds the previewed asset. Assign subject, style or composition; Omni also supports starting and ending frames. Removing a selection keeps the file. Reference choices and purposes survive navigation/reload within the browser session, and are recorded with each generation. Optimization sees the selected media and their purposes. Extra references can also accompany a refinement.
- Beside the studio prompt, **Optimize prompt** asks Gemini 3.8 Flash for an editable proposal tailored to the selected image/video model. Review it before applying; **Restore original prompt** undoes the change. Instructions preserve creative intent, translate directions into English, and preserve names and literal text intended to appear or be spoken in its original language. No media generation starts when optimizing.
- The trash button on a studio asset opens a permanent-deletion confirmation. It removes the managed media file and its JSON sidecar, while keeping copies already attached to tasks and other versions. Assets needed by unfinished work cannot be deleted. Task-owned assets remain managed within their task.

Studio optimization guidance is maintained in `server/studio-prompts.js`, based on Google's [image prompting guide](https://ai.google.dev/gemini-api/docs/image-generation#prompting-guide-and-strategies), [Omni prompt guide](https://deepmind.google/models/gemini-omni/prompt-guide/) and [Omni API guide](https://ai.google.dev/gemini-api/docs/omni), reviewed September 27, 2026. It is bundled guidance, not fetched on each click. Prompt fidelity remains a model behavior to review before generation.

## Background behavior

A single local service performs requests independently of the browser, one media generation at a time. Multiple tasks share it in round-robin order. Batch combinations are traversed lazily rather than creating millions of queue records. Each submitted generation captures an immutable prompt/settings/reference snapshot.

Continuous mode adds one new value to each expanding variable after completing the current combinations. New values cross with all prior values, without replaying existing combination/take slots. An optional video limit applies to the current run. Failed generations are recorded and do not silently trigger endless replacements.

Temporary rejected requests retry with bounded backoff. Submitted Google interaction IDs are saved and polled. Unknown submission outcomes require review rather than automatic resubmission. Results offers recovery by interaction ID from AI Studio, or an explicitly acknowledged new attempt. Finished media downloads can be retried without regenerating it.

After a service/computer restart, tasks are paused for review; known in-flight interactions are retrieved. Sleep/offline periods suspend local processing. Keep the computer awake for unattended production. Node must remain installed; this is a locally hosted application, not a packaged native installer or a remote rendering service.

## Storage

State defaults to `~/Library/Application Support/Frame` on macOS, `%LOCALAPPDATA%/Frame` on Windows, or `~/.local/share/frame` on Linux. `FRAME_DATA_DIR` overrides it. Preserve existing `.env` overrides and saved storage paths during updates or migration. Keep the SQLite state on a local disk rather than an actively synchronized folder for sustained production. `FRAME_OUTPUT_DIR` sets the initial media location; Settings changes the location for **new tasks**, leaving existing folders intact.

Each task contains `references/`, `samples/`, `production/run-001/`, and `task-manifest.json`. Every media file has a JSON sidecar with its generation details. Imported references are copied into the task. Files are written atomically. Task folders keep their original stable path when a task is renamed.

The library and task results are directly available to external media tools. Deleting a task can keep its files; deleting media permanently is a separate choice. Back up both the state directory and media folders. The service log and PID file are in the state directory.

## Model capabilities

The adapter uses Google's **Interactions API**. Image requests return synchronously to the local worker; they do not use Google's unsupported image-background flag. Video requests use background interactions. Both continue independently of the browser:

| Purpose                | Model                                          | Controls                                                                                       |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Video                  | `gemini-omni-1.1-flash`                        | 16:9 / 9:16; 360p / 720p / upscaled 1080p / upscaled 4K; automatic or explicit generation mode |
| Prompt editing / ideas | `gemini-3.8-flash`                             | Prompt context, per-variable instructions, previous idea history                               |
| Reference images       | `gemini-3.1-flash-image`, `gemini-3-pro-image` | Aspect ratio; 1K / 2K / 4K; follow-up refinement                                               |

Frame sends `generation_config.thinking_level: "high"` for every `gemini-3.1-flash-image` generation and refinement, including task image variations. Google documents `minimal` as its default and `high` as the other supported level. This setting is not sent to Pro Image, Omni or text assistance. Higher thinking can increase latency and billed thinking tokens; it does not replace visual fidelity review. See [Google’s thinking controls](https://ai.google.dev/gemini-api/docs/image-generation#controlling-thinking-levels).

Video duration, camera, lens, lighting, and sound are prompt directions, not invented API fields. Current Omni documentation does not expose a `duration_seconds` control. System instructions, temperature and negative-prompt API fields are not sent to Omni. Video-reference clips are limited to three clips of up to three seconds; uploaded edit/extension sources use one clip of up to ten seconds. The UI validates these distinct roles. Longer source material must be prepared in a media editor first. Account, regional, model, and content restrictions are returned as actionable errors.

Documentation checked during development: [Omni](https://ai.google.dev/gemini-api/docs/omni), [Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview), [image generation](https://ai.google.dev/gemini-api/docs/image-generation). Use **Settings → Check connection** to check model-list access without generating media; a listed model does not establish successful generation or video-result retrieval. Model availability and billing depend on the Google account. No credential is included in this repository.

Studio reference compatibility follows those guides: both image models accept image references (up to 14 total images including a refinement source); Flash Image also accepts video references, while Pro Image does not. Omni accepts up to three video reference clips of up to three seconds each, distinct from its ten-second uploaded editing source. Studio selections have an app limit of 14 references. Incompatible selections stay visible with a message and block generation until corrected. A task cannot be deleted while unfinished studio work depends on its assets.

## Validation

- `npm test`: domain, provider contract, persistence, queue, and API tests with isolated temporary storage and fake providers. No paid model requests.
- `npx playwright install chromium`, then `npm run test:ui`: isolated browser workflow, persistence, variable editing, responsive layout and accessibility tests. Builds must be refreshed with `npm run build` first.
- Tests exercise 2 × 3 × 4 values × 4 takes = 96 outputs, continuous crossings, samples, pause/drain, editing, recovery, retries, deduplication, upload copying, deletion choices and local request protections.

Live model generation requires a configured key; simulated tests do not establish live account access or generation quality. Semantic novelty is best effort, and repeated takes can look similar. Native Windows shell behavior requires checking on a Windows machine.
