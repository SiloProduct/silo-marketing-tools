# Review, production and recovery

Use after preparing a draft or when managing existing generation. Read the relevant command contract in the [CLI guide](../../../../apps/frame/docs/agent-cli.md); discover flags through `--help` rather than guessing them.

## Recommend a useful sample

Recommend one representative combination that tests the main creative uncertainty: product preservation, an image edit, camera motion, or a difficult interaction. Explain the chosen values and what success should look like. Offer a sample before a larger run when it would reduce uncertainty, even if the user does not know to ask for one. Reuse a matching saved preview/sample when it answers the question; inspect current results before submitting another paid request.

For a requested image and video sample with an image recipe, normally generate or retrieve the edited image first, inspect it, then generate the video from that saved image. This exposes reference defects before spending on dependent video and reuses the same edit. Automatic image preparation through `samples generate` remains appropriate when a separate image review is unnecessary. A fixed reference needs no paid image edit just to show a sample image.

## Sample selection and image previews

1. Read the latest task/plan. Select one exact saved list value for every active variable, including image-only variables. Shared variables receive one value. Avoid adding an unsaved suggestion directly to a sample request.
2. `tasks resolve --values …` previews resolved image and video prompts without generation. Check that selected values fit the sentences and preserve the brief.
3. `frames preview --source … --values …` generates only the chosen image recipe. It requires values relevant to that image. For several varied images, preview the relevant sources separately when useful.
4. `samples generate --values … --count …` prepares missing edited references first, then creates sample videos. Saved frames are reused; previewing before a sample does not require another identical edit. The sample returns the frames used through its generation details.
5. Frame regeneration uses `frames preview --regenerate`. It preserves earlier versions and existing videos; successful replacements become available for future work. Respect production's pause/edit rules when changing active work.

Use one sample take unless the user requests comparison or a justified small set. Samples persist immediately before production and never count toward production totals. An image preview is not a completed video; keep those results distinct.

## Inspect the media and guide refinement

Inspect the actual saved media, rather than treating a completed job or valid plan as creative success. Compare it with the brief and the original reference:

- For an edited image, check the requested change, product geometry and lid details, transparency, surrounding objects, framing, lighting and unwanted additions. Distinguish an acceptable change from a defect; preservation instructions are not a guarantee.
- For video, watch playback with available tools. If playback inspection is unavailable, extract and inspect representative beginning, middle and end frames with available local media tools; add frames around suspected defects. Check product consistency, requested camera/action, temporal artifacts, framing and unintended text or objects. Inspect audio when tools support it and sound matters to the brief. A metadata probe verifies format/duration, not visual quality or silence.
- State the extent of inspection honestly. Representative frames do not establish smooth motion between them, and visual inspection does not establish audio quality. If the environment cannot inspect video, show the real media, disclose that limit and request the user's review; never claim to have watched it.

Give a short assessment of what worked, any material mismatch, and one recommended next action. Show the media so the user can judge it too. If an image has a clear defect that would invalidate the requested video, show it and propose a targeted correction before generating the dependent video. Save prompt fixes within the request; an additional paid regeneration needs remaining authorized scope or a new user decision. Preserve earlier versions and results.

Before recommending production, use the inspected sample to judge readiness. If the user requested sample approval, wait for it. If production is already authorized, continue within that scope unless a material defect requires a consequential change; do not add paid tests or replace the user's creative direction unasked. A direct batch request does not require an unrequested sample.

## Wait and show actual results

Generation can take minutes. Without `--wait`, store returned job IDs and poll `jobs get`/`jobs list` or use bounded `jobs wait` calls. Where supported, let a tool yield while running. Keep the user informed of meaningful progress without busy polling or repeating unchanged updates.

- Exit 0 on submission means queued, not necessarily finished.
- `--wait` defaults to 600 seconds; request timeout is separate. Use shorter bounded waits when the agent environment requires frequent updates.
- Exit 4 means waiting timed out and work continues. Inspect the **same** job IDs. Do not submit replacements.
- Exit 5 means the generation needs attention; inspect `error.details.state` and affected jobs.

On completion, `jobs get`/`jobs wait` includes an `asset` with absolute `file`, local `mediaUrl`, MIME type and metadata. `tasks results` and `assets get` provide the same saved media details. Resolve paths from these results rather than reconstructing filenames. For a video's edited sources, inspect `generatedReferences` in its snapshot/metadata and retrieve the referenced registered assets if needed.

Show the resulting image alongside the sample video where supported. Identify the chosen values and take, and invite concrete feedback on content, preservation, motion and composition if review was requested. Translate the direction back into the user's language when explaining it; do not change the saved English prompt just to display a summary.

### Chat media capabilities

Use the assistant's supported local attachment/video preview. In Codex, render local media through Markdown image syntax using the actual absolute path returned by Frame. Use the same mechanism for images. An agent on the same computer may use the returned local media URL.

A cloud chat cannot retrieve the user's localhost or local disk. Use a file-upload tool only when available and authorized; otherwise provide the actual Frame Samples/Results link and explain how to review locally. Do not create a public upload/link as a workaround without authorization. Never claim the user saw playable video when the chat only shows a filename or inaccessible URL.

Review handoff: selected values, actual preview/video, task review link, saved state and the next decision. If the user asked to approve the sample first, keep production pending until that approval arrives. If execution is already authorized, proceed within that scope after verifying the plan.

## Start production

Read `tasks plan` after final edits and check `valid:true`; list issues in plain language if it is invalid. Explain the count from the returned fields:

| Plan field | Meaning to communicate |
| --- | --- |
| `combinations`, `takesPerCombination`, `initialVideos` | Configured batch arithmetic |
| `completedCombinationTakes`, `unfinishedVideos` | Completed versus remaining production slots |
| `referenceImages`, `reusableImages`, `missingImages` | Required edited frames, available frames and new frames needed |
| `production.mode`, `videoLimit`, `countScope` | Defined batch or ongoing expansion; scope of counts/limit |

These count fields live under `counts`, except the fields under `production`. Required images exclude fixed/original references. Counts are not price quotes. Do not invent a monetary estimate unless obtained from an authoritative current source.

Use `tasks start TASK_ID --revision REVIEWED_REVISION` when production is authorized. A revision conflict requires rereading the task and considering the changes; do not blindly fetch a new revision just to bypass review. The requested configuration must still match the user's authorized scope.

The background service generates edited images on demand before their first dependent video, reusing them across camera choices and takes. It does not require approval for every image once the run is authorized. Multiple tasks share the service; do not start a parallel worker or promise unlimited concurrent generation.

Show the actual production/results link and current state. Explain that the browser may close while the awake, connected computer and local app continue working. Unless asked to wait for completion, a successful background start with a clear status/results handoff completes a “start production” request. If the user asks to wait/review all results, keep monitoring the existing run with useful progress updates.

## Continuous mode

Enable only when requested. Require at least one expanding variable. Explain what expands and any video limit before starting:

- Finish the initial combinations first.
- Add one new distinct value to each expanding variable by default.
- Cross new values with accumulated older values, including linked image/video variables, without repeating processed combination/take slots.
- Finish that expansion before creating another. Required images are generated only for the videos being attempted within the limit.
- A limit counts production videos per run, not image generations, and initial count arithmetic is not a promise of a final total.

Best-effort idea uniqueness is not a guarantee of visually different outputs. Expansion may require attention when distinct new values cannot be supplied or failures remain unresolved. Do not silently switch to endless retries or shrink lists to make a run look complete.

## Pause, edit, resume and additional takes

To edit running production, pause first. Pause stops new image/video submissions and lets active requests finish. Wait for paused state before applying changes; describe “finishing active videos” where relevant. A completed image does not authorize dependent videos to start while paused.

Changes affect unfinished work. Existing completed videos retain their prompt, variables, settings and exact generated references. Replan after edits before resuming with the current reviewed revision. Camera/video-only changes reuse matching frames; source/image-prompt/model/settings changes may require new frames for unfinished work. Do not erase cache files or manually rewrite completed metadata.

- `tasks resume` continues unfinished work; do not automatically replay completed videos.
- `tasks stop` ends the run and keeps its outputs. Starting again defaults to unfinished work.
- `jobs repeat` creates a paid extra take from the completed job's immutable snapshot. Use it for “another take of this result,” not as a way to apply new task settings.
- `tasks duplicate` creates a separate draft with original references/configuration and its own folder, without completion or generated-image cache history.

Service restart recovers known provider operations and pauses tasks for review. Resume the intended task when requested; do not resume every stored run.

## Recovery decisions

| Situation | Action |
| --- | --- |
| Invalid draft, unsupported inputs, missing file | Read plan/issues, explain the exact affected item, correct/import/restore within the request, then replan. Never silently substitute the original for a failed varied image. |
| Revision or edit conflict (exit 3) | Reread latest state. Preserve UI changes and adjust the intended patch; pause if needed. Do not force or blindly reapply an old whole-array payload. |
| Request interrupted / `OUTCOME_UNKNOWN` | Inspect task/job state before any repeated write. The first request may have been accepted. |
| Wait timed out (exit 4) | Continue inspecting the same job IDs; no new paid request. |
| Known failed image | Inspect image job and video `snapshot.frameDependencies`. Retry the failed image through `jobs retry`; dependent videos retain their linkage. Unrelated combinations may continue. |
| Known failed video or download | Inspect its job/error and use the documented retry. A saved provider result may allow download recovery without regeneration. |
| Uncertain provider submission | Reconcile a known interaction ID with `jobs reconcile --provider-id …` first. If it cannot be reconciled, explain duplicate generation/charge risk and obtain explicit acknowledgment before `jobs retry --confirm-duplicate-risk`. Sample or batch authorization does not provide that acknowledgment. |
| Storage unavailable | Restore write access/location before retrying. Do not delete outputs or change persisted asset paths to disguise the problem. A new default output directory does not relocate existing tasks. |
| Model/key/access/billing failure | Explain the actual error; check access as appropriate. Do not resubmit repeatedly, switch accounts/models unasked, or purchase credits. Obtain a missing key privately from the account owner or team administrator; enter it in Settings. |

The app already performs bounded retries for temporary failures. After a manual retry fails for the same unchanged cause, stop repeated submissions and explain the required change. Preserve job IDs, errors and saved outputs. Do not promise an outcome you cannot observe.

## Results, deletion and handoff

Use `tasks results --kind production` with pagination for large libraries. Show relevant takes rather than flooding chat with every file. Results expose exact prompts, values, settings, references and run history. `tasks open-folder` opens managed media in Finder/Explorer; file links should use the actual absolute paths. Do not rename/move managed files without a separately supported workflow.

Distinguish removing a reference, deleting a task, and deleting local media:

- `references remove` detaches the asset and disables its image recipe while retaining files.
- `tasks delete --confirm` removes the task while keeping local media by default.
- `tasks delete --confirm --delete-media` permanently deletes its media; the user must intend that outcome.
- `assets delete --confirm` permanently removes a studio asset and sidecar, subject to in-use protections. Copies already attached to tasks are separate managed assets.

Never use deletion as silent cleanup of demos or failures. Use the user's expressed intent, explain keep/delete consequences when ambiguous, and honor app protections.

End with the saved task link, current status, generated versus outstanding media, usable previews/files, output folder, and the one relevant next action. For a nontechnical user, say “the videos are still being created; you can review them here” rather than exposing queue/worker terminology.
