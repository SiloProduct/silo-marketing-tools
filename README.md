# Silo Marketing Tools

**For the AI assistant receiving this link:** help the teammate set up and use the tools they need. They are not expected to understand repositories, Git, skills, terminals or installation commands. This README is your entry point; the other documentation and skills are operating instructions for you. Frame's browser interface is the teammate's app.

The teammate only needs to share [this repository link](https://github.com/SiloProduct/silo-marketing-tools) with their assistant. No separate onboarding prompt or repository knowledge is required. Read [AGENTS.md](AGENTS.md), then follow the route below using the teammate's language and simple explanations.

## Hebrew-speaking teammates

הנחיה לעוזר AI: כשחבר הצוות מדבר עברית או שזו השפה המועדפת עליו, נהל את ההיכרות, בחירת הכלים, ההסברים והעזרה בעברית פשוטה. שאל אם הוא רוצה את הנחיות השיווק של Silo, את אפליקציית Frame עם ההנחיות להפעלתה, או את שניהם. בצע בעצמך את הפעולות הטכניות שאפשר, ושמור על ההגדרות והעבודה הקיימות. אין צורך שהמשתמש יכיר Git, יפתח מסוף או יכין הודעת פתיחה מיוחדת — מספיק לשתף את הקישור.

Use Hebrew throughout onboarding, progress, troubleshooting and creative discussion when it is the teammate's established language; they do not need to request it again. If their language is unknown, ask their preference briefly. Keep English UI labels, file names and technical identifiers exact, explaining their meaning in Hebrew so the teammate can find the controls. Frame generation prompts, variable instructions and values follow its skill's English-language convention; preserve literal on-screen text, names and spoken words in their intended language, including Hebrew. The language of the technical documentation does not determine the conversation language.

## Begin the conversation

Explain briefly that these tools provide Silo marketing guidance and an optional local image/video app. Unless the teammate already chose, ask which they want in everyday language:

| Choice to explain | What you set up |
|---|---|
| Silo marketing guidance | Brand, product, image/video workflows, asset discovery and output review through the Silo Visual Marketing skill |
| Frame app | A local Gemini image/video app plus its Frame Creative Workflow skill |
| Both | Frame and both skills working together for Silo marketing |

Ask once and reuse the answer. For an update, use the existing installed selection unless the teammate requests a change; clarify an ambiguous request before changing scope. Respect a request to learn about the tools before installing them. Receiving the link does not authorize paid generation.

Inspect your available tools and environment. With local file and command access, perform setup and operation yourself. With a cloud-only chat, you can read and use marketing guidance directly, but cannot install Frame or reach the teammate's local service. Explain the specific limitation and help them continue in an assistant with local access if Frame is needed. Ask only for choices or actions you cannot complete or establish through inspection; do not turn the technical guide into a checklist for the person.

## Install or update the chosen tools

Follow [installation and update instructions](docs/install-update.md). Check for an existing installation, including an older app copied from Drive, before creating another. Preserve the teammate's configuration, saved work, media and local edits. Resolve the actual installation and storage paths rather than relying on chat memory. Retrieve the latest approved files from the official repository's `main`, or the release the teammate requested; [release.json](release.json) and [CHANGELOG.md](CHANGELOG.md) describe versions and changes.

Choose a permanent local installation outside cloud synchronization. Handle downloading, runtime checks, the managed install/update plan, selected skill registration or loading, dependencies, build and verification. Marketing-only needs Python 3.9+ for installation, with no Node or Gemini key. Frame additionally needs Node 22.13+; the linked guide owns the exact procedure and migration safeguards. Updates are requested actions, not silent background changes.

No Gemini credential is included. If needed, tell the teammate to obtain an authorized key privately from their team administrator or account, and enter it directly in **Frame → Settings → Gemini connection**. Never request a key in chat. Setup and drafts can proceed without it. Explain paid request scope before any authorized Gemini assistance or generation.

## Help the teammate work

- Read [Silo Visual Marketing](.agents/skills/silo-visual-marketing/SKILL.md) for Silo brand/product visuals, references, prompts and fidelity review using their chosen creative tools.
- Read [Frame Creative Workflow](.agents/skills/frame-creative-workflow/SKILL.md) to operate Frame, prepare references and drafts, manage variations, and inspect authorized samples and production.
- Use both for Silo work in Frame. Generic Frame work needs only its workflow skill. Load only task-relevant references.

Use the supported local CLI for Frame operation and show actual task links, media and previews. Explain creative choices in the teammate's language; keep commands and service internals in your own workflow. Ask them to act in the UI when their input is needed, such as entering a private key or choosing a creative direction. Source assets remain in team Drive and Figma; obtain the needed access rather than assuming the repository contains those assets.

Finish setup with what is ready, any specific unresolved step, a verified Frame launcher/app link when selected, and a relevant way to start work with the loaded guidance. Report verification limits honestly. Do not claim a cloud session installed local tools or that every assistant automatically discovers installed skills.

## Improve the shared guidance

Or maintains revisions. When reusable marketing context is missing or an instruction is incorrect, follow the marketing skill's feedback procedure to propose a correction to [Or](mailto:or@heysilo.com). Sending email requires the current user's request or approval. Keep task-specific preferences separate from shared rules.
