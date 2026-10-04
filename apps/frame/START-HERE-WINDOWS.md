# Frame — Windows installation and onboarding

For a local AI agent helping a colleague install, update or learn Frame. Use the user's language; use simple Hebrew when requested. The public repository includes no Gemini credentials or another user's task history.

## Choose scope and install locally

1. Read the repository [README](../../README.md), [AGENTS.md](../../AGENTS.md) and [installation/update guide](../../docs/install-update.md). Ask whether the user wants Silo marketing guidance, Frame, or both. Frame selection includes its workflow skill. Marketing-only users do not need this app setup.
2. Locate or download a complete source snapshot of [silo-marketing-tools](https://github.com/SiloProduct/silo-marketing-tools). Select a permanent writable installation directory outside Drive, OneDrive, temporary extraction folders and network shares. Keep the source separate from the destination. An agent without local file/command tools must explain that limitation and guide the user to a local agent.
3. Check Python 3.9+ for the repository helper. Run its `plan` action with `--source`, `--destination` and `--scope frame` or `both`; inspect the plan before `apply`, then run `verify`. Follow the linked guide for exact commands, prerequisites and error handling. The app is installed at `apps/frame/` and selected skills at `.agents/skills/` inside the destination. The helper does not build the app or configure credentials.
4. For an update, preserve `.marketing-tools-install.json` and use the comparison plan. Resolve local code modifications before replacement. Never overwrite `.env`, discard tasks/media or replace a running service. Let authorized active production finish or pause/drain it, then stop the verified installation before replacing app files.

Do not install by copying a maintainer's `.env`, `.frame`, database, generated media, `node_modules`, `dist` or PID file. For an existing colleague installation, follow migration guidance and preserve their real configuration and state/media paths. Reuse their own storage; do not initialize over it. Changing an output setting affects new tasks and does not migrate old saved asset paths. Do not delete the old app folder or rewrite SQLite to make migration appear complete.

## Configure personal storage and connection

For a new user, Frame defaults to a state directory under their actual `%LOCALAPPDATA%/Frame`. Keep SQLite on a local disk. Choose a writable personal local media location in **Settings → Choose folder**. For environment overrides, set `FRAME_DATA_DIR`/`FRAME_OUTPUT_DIR` to fully resolved absolute paths in the local `.env`; the app does not expand `%LOCALAPPDATA%`, `%USERPROFILE%`, PowerShell variables or `~` within `.env`. Preserve an established user's values and check inherited environment overrides.

Create `.env` from `.env.example` only when no `.env` exists. Keep port 4310 unless there is a verified conflict. No key is published. Ask the user to obtain their key privately from their account owner or team administrator, then enter it directly in **Settings → Gemini connection → Gemini API key → Save connection**. Never ask for a key in chat, display it, or send it through CLI arguments. Setup and drafts work without generation credentials.

## Build and start

Work from the installed `apps/frame/` directory, quoting paths containing spaces. Check `node --version` and `npm.cmd --version`. The app requires Node.js 22.13+ with `node:sqlite`. If missing, install a suitable official Node runtime using the agent environment's permissions, then reopen the terminal. Do not disable security or change machine-wide PowerShell execution policy.

Run the helper's `configure-runtime` action for this destination and scope with `--node` set to the selected absolute Node executable. It verifies the runtime and records its actual path in local `apps/frame/.frame-runtime.json`. Preserve that private file on updates; reconfigure if Node moves. Use npm from the same Node installation with its bin directory on the process PATH.

Run sequentially, inspecting each result before continuing:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

Use `npm.cmd` in PowerShell to avoid `npm.ps1` execution-policy errors. `npm ci` installs the locked platform-appropriate dependencies; do not reuse Mac dependencies or delete the lockfile. Use the production service, not the development server. A `node:sqlite` experimental warning alone is not failure; verify exit status and response. Diagnose actual build errors before taking later steps.

## Verify opening and create the desktop shortcut

1. Confirm startup and HTTP 200 from the configured local `/api/state`. Do not print full state or task contents into chat. The default browser address is **http://127.0.0.1:4310**.
2. Open the UI and verify **Tasks**, **Reference studio** and **Settings**. Confirm actual state/media locations are writable local Windows paths.
3. If a key is configured, run **Settings → Check connection** or the documented CLI equivalent. Distinguish local startup, key presence and verified Google/model access. This check only lists models; it does not test generation or retrieval of video results. Explain account/model/billing problems separately from app setup. Google supports both standard and authorization keys; do not reject a key solely because it starts with `AQ.`. For “Multiple authentication credentials” during video polling, ask the account owner for another key verified for video generation, save it in Settings, and inspect the submitted interaction before retrying. See [Google’s key documentation](https://ai.google.dev/gemini-api/docs/api-key).
4. Verify **Start Frame.bat** from the installed app directory opens the app without duplicate services. It uses port 4310 by default. For a custom port, update the launcher/browser address and instructions consistently. Identify any existing port listener; never kill an unknown process or trust a stale/copied PID.
5. Create and test a desktop shortcut named **Frame** targeting **Start Frame.bat**, with the app directory as its working directory. A URL shortcut cannot start the app after restart. Use Windows' actual Desktop special-folder location, including redirected desktops; only the shortcut belongs there.

For an agent with PowerShell access, run this from the verified local app directory when no Frame shortcut exists:

```powershell
$frameAppFolder = (Get-Location).Path
$frameLauncher = Join-Path $frameAppFolder 'Start Frame.bat'
$frameDesktop = [Environment]::GetFolderPath('DesktopDirectory')
$frameShortcutPath = Join-Path $frameDesktop 'Frame.lnk'
if (-not (Test-Path -LiteralPath $frameLauncher)) {
    throw 'Start Frame.bat was not found in the current folder.'
}
if (Test-Path -LiteralPath $frameShortcutPath) {
    throw 'Inspect the existing Frame shortcut before changing it.'
}
$frameShell = New-Object -ComObject WScript.Shell
$frameShortcut = $frameShell.CreateShortcut($frameShortcutPath)
$frameShortcut.TargetPath = $frameLauncher
$frameShortcut.WorkingDirectory = $frameAppFolder
$frameShortcut.Description = 'Open Frame video studio'
$frameShortcut.WindowStyle = 7
$frameShortcut.Save()
Start-Process -FilePath $frameShortcutPath
```

Inspect an existing shortcut before reusing/updating it; do not overwrite an unrelated shortcut. Verify the saved target and working directory, then launch the shortcut itself. For a new installation without active work, also verify opening after the service is stopped. Do not interrupt production simply to test this state. If tools cannot create it, guide File Explorer's **Send to → Desktop (create shortcut)** on **Start Frame.bat** (possibly under **Show more options**), rename it **Frame**, and verify the user's double-click.

A minimized launch window may appear briefly. If the agent sandbox terminates child services at session end, have the user launch the desktop shortcut outside the agent and verify opening. Do not claim Windows launch was tested from macOS or promise persistent operation without verification.

## Teach the creative workflow

Read [Frame Creative Workflow](../../.agents/skills/frame-creative-workflow/SKILL.md) and the relevant [CLI guide](docs/agent-cli.md). For Silo work, also load [Silo Visual Marketing](../../.agents/skills/silo-visual-marketing/SKILL.md) when installed; it owns product/brand accuracy and review. Generic Frame work needs no Silo-specific guidance.

Keep installation internals out of the user walkthrough. Operate the CLI for nontechnical users, while showing the actual task links and results. Write generation directions, variable instructions and values in English, preserving literal intended output text in its original language. Explain in the user's language:

1. **Reference studio** imports, generates and refines reusable media. Select **Image** or **Video**, assign explicit reference purposes, inspect selected versions, and use **Add to task**. **Auto · Match original** requests original proportions for image edits but does not guarantee pixel-perfect preservation.
2. **New task → References** chooses inputs and **Use this as** roles. **Vary this image** enables an image-edit recipe; unselected images stay fixed. References are optional and several can vary.
3. **Prompt** holds video instructions and separate image-edit prompts. **Make variable** creates editable dynamic parts. **Improve prompt** proposes English wording; inspect it before applying and reject invented details.
4. **Variations** holds all lists together. Manual values and Gemini ideas are alternatives. Shared variable names use one list/value; distinct dimensions combine exhaustively. Explain takes and the actual plan's video/image counts before production.
5. **Samples** lets the user preview an edited reference or request a sample video. Image previews may be reused in production; samples are additional videos outside production counts.
6. **Production** sets supported format, quality, takes and mode. Saving a draft never generates. Start only the current user's authorized sample/batch scope; installation or onboarding alone does not authorize a paid demo. Resolve missing generation quantities before running. Continuous mode requires an explicit request.
7. **Results** shows saved outputs and details; **Open folder** opens their actual media location. **Pause** stops new work and lets submitted work finish; do not restart finished outputs when resuming.

Use a saved draft to teach without generating when no production request exists. When the user requests a demonstration, explain the planned scope and counts, perform the authorized steps, inspect media, and show results before scaling. Do not buy credits, change billing or run an implicit onboarding batch.

Explain autosave and the **Saved** indicator. The browser may close while production continues on an awake, connected machine; sleep/shutdown interrupts local processing. After restart the app recovers known provider interactions and pauses tasks for review rather than promising automatic resumption.

## Recovery and handoff

- **Browser cannot connect:** inspect the verified launcher, configured port and Node, then useful errors in the configured state's `service.log`. Summarize errors without dumping credentials or personal state.
- **Missing media:** verify the file exists on this machine and restore/import through the app. Preserve original files and data; a copied Mac path is not a completed migration.
- **Storage permissions:** choose a writable local directory; do not run everything as administrator as a generic fix.
- **Generation failure:** inspect actual errors, account access, inputs and storage. For an uncertain accepted request, reconcile its provider/job ID before retrying; never repeatedly submit paid requests because a wait timed out.
- **Stop completely:** pause/drain active work first, then `npm.cmd stop` from the verified app. Closing the browser does not stop it. This guide does not configure Windows-login startup.

Finish with verified setup status, app link, tested Frame desktop shortcut, actual storage locations, saved drafts/authorized results and one relevant next action. State pending or unverified steps explicitly. In Hebrew, explain: “בפעם הבאה פשוט לחצו פעמיים על Frame בשולחן העבודה. האפליקציה תיפתח בדפדפן — אין צורך לפתוח מסוף או להריץ פקודות.”
