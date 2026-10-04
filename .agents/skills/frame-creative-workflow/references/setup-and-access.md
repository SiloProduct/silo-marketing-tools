# Setup and access

Use for installation, updates, migration or access problems, not for every creative request. Follow [Install and update](../../../../docs/install-update.md) for the helper contract and managed-file safeguards.

## Determine the situation

- **Established installation:** Verify the app root, runtime and service. Reuse the user's data and output locations. Do not initialize over their database or stop active production just to test a launcher.
- **New installation:** Choose a permanent writable local directory outside Drive/OneDrive, cloud placeholders and network shares. Ask whether the user wants marketing guidance, Frame, or both; Frame requires its own workflow skill. Use `scripts/manage-install.py` from the source repository with `plan`, review the result, then `apply` and `verify` for the selected scope. Python 3.9+ is required for this helper; marketing-only installation requires no Node or Gemini key.
- **Update:** Use the installed selection/version record in `.marketing-tools-install.json` and the helper's comparison plan. Keep `.env`, user data and media untouched; resolve reported local source changes before replacement. Build and verify Frame after an app update. A running service must finish or pause/drain its work and be stopped through the verified installation before replacing app files.
- **Existing Drive copy:** Preserve its actual `.env`, configured state and media locations, including saved absolute paths. Install the clean repository separately and follow the migration guidance; do not copy a maintainer's database/PID, delete old folders or rewrite SQLite. Confirm which installation owns the user's work before switching launchers.
- **Chat has no local tools:** The CLI operates on the same computer as Frame; a cloud assistant cannot reach the user's `127.0.0.1`. Help them open the local installation in an agent with file/command access or guide required actions. Do not pretend remote execution is possible.

The helper installs selected skills at the installation root's `.agents/skills/` and the app at `apps/frame/`. It does not automatically install global skill copies, build the app or configure a key. Use the agent host's supported skill loading or read the installed skill files directly. Verify all required files without displaying credentials.

## Windows onboarding

Follow [START-HERE-WINDOWS.md](../../../../apps/frame/START-HERE-WINDOWS.md) for installation, personal storage, Node, local build, launch verification, the desktop shortcut and a language-appropriate UI walkthrough.

1. Use personal local storage for a new user, not copied Mac database/media paths or PID files. Reuse existing colleague storage when present. Do not import somebody else's pending jobs implicitly.
2. Check the runtime against `package.json` (Node 22.13+). Use the helper's `configure-runtime` action with the selected absolute Node executable to record verified runtime metadata; it is local and preserved on updates. Use `npm.cmd` from that same runtime in PowerShell. Install locked dependencies with `npm.cmd ci` and rebuild locally. Use the production launcher rather than the development server.
3. Create and test a desktop **Frame** shortcut targeting the installation's **Start Frame.bat**, with the app folder as its working directory. A URL shortcut cannot start the app. Use the actual Desktop special-folder location, which may be redirected.
4. Leave the user with a double-click workflow, not daily terminal commands. If tools cannot create the shortcut, guide the File Explorer shortcut action and verify it with the user.
5. Verify on the actual Windows machine. macOS startup does not verify Windows behavior; report remaining unverified steps.

On macOS, use the same local-installation, private-key and personal-storage principles, then follow [Frame README](../../../../apps/frame/README.md). Use **Start Frame.command** for repeat opening. Preserve established storage and saved work.

## Connect from the agent

From the verified app root, inspect the relevant CLI commands: `--help`, `schema task`, `service status`, `status`, `capabilities`, `settings get`, and `connection check`. Use `service start` only when not already running and the installation is ready. Help/schema work without a service. `connection check` only checks model-list access without media generation; listed models do not establish generation or video-result retrieval. Read its `warning` and do not present `videoAvailable` as an end-to-end test. A successful session check need not be repeated before every generation unless evidence changes.

Use the returned UI URL/configured port rather than assuming 4310 in a customized installation. Identify an occupied port's listener before changing anything; never kill an unknown process or trust a stale/copied PID. Do not disable security settings or make broad source changes to disguise an installation issue.

The browser may close while production continues on an awake, connected computer with the service running. Sleep/shutdown interrupts local processing. After restart, known provider operations are recovered and tasks are paused for review; do not promise automatic resumption or resume every task unasked.

## Gemini key

No credential is included in the public repository. Create `.env` from `.env.example` only if no `.env` exists; never overwrite an existing configuration. The user obtains a key privately from their account owner or team administrator and enters it directly in **Settings → Gemini connection → Gemini API key → Save connection**. Do not request it in chat, pass it as a CLI argument, dump the file or expose it in logs/screenshots. Check key presence through the CLI or report only whether a supported key is nonempty.

Google supports both standard and authorization keys; do not reject `AQ.` solely by prefix. For Google’s “Multiple authentication credentials” response during interaction retrieval, ask the account owner for another key verified for video generation and have the user save it privately in Settings. Preserve and inspect the submitted interaction ID before retrying; changing a key does not authorize a new paid submission. See [Google’s key documentation](https://ai.google.dev/gemini-api/docs/api-key).

Setup and drafts can continue without a key. Explain a rejected key/model/access error from the actual response; do not repeatedly submit media requests or silently switch accounts/models.

## Teach while doing

Introduce **Tasks**, **Reference studio** and the five task sections using the user's language, with English UI labels. Explain reference purposes, image versus video prompts, shared variables, plan counts, samples and production. Operate the technical workflow and show saved tasks and actual resulting media when generation is requested. Installation alone authorizes no paid demo: agree on sample/batch scope through the current user's request, explain the actual plan counts before generation and stay within them. Use simple Hebrew when requested, while writing generation directions in English and preserving literal output text in its intended language.

Keep installation commands out of the creative walkthrough. End onboarding with the verified launcher/shortcut, actual app link, output location, saved drafts or authorized results, and the next relevant creative action.
