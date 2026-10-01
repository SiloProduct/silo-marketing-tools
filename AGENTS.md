# Install, update and use Silo Marketing Tools

This is the public distribution of Silo Visual Marketing and Frame. A teammate shares its link with an AI assistant; that assistant handles onboarding and operation. All documentation outside Frame's UI addresses the assistant. Read [README.md](README.md) and [installation/update instructions](docs/install-update.md) before onboarding. Do not require the teammate to understand repositories or prepare a special prompt. Perform technical work for them; ask only for choices or actions you cannot resolve through inspection. Explain outcomes and creative decisions in their language, keeping commands and implementation details in your own workflow.

Follow the README's [Hebrew onboarding guidance](README.md#hebrew-speaking-teammates). Use simple Hebrew when the teammate speaks or prefers Hebrew, without requiring a separate language request. Preserve exact English UI labels while explaining them in Hebrew; keep generation directions and literal output language aligned with the relevant skill.

## Choose the requested scope

Unless the user already specified it, explain and ask whether they need **Silo marketing guidance**, **the Frame app with its operating guidance**, or **both**. Map their choice to `marketing`, `frame`, or `both` internally. Ask once; reuse the answer. Identify their agent environment and whether you have local file/command access. A cloud-only chat can read marketing guidance, but cannot install or control a service on the user's computer. Explain the actual limitation and help them continue in a local assistant when necessary; avoid handing them a technical setup guide to execute unaided.

Find an existing installation before creating another. Preserve its credentials, data, outputs, shortcuts and local edits. Follow the managed installer and migration instructions. Downloading this repository is not permission to start paid generation. Use the current user's creative request to determine generation scope.

## Skill routing

| Request | Read |
|---|---|
| Silo brand/product visuals, prompts, asset discovery or fidelity review | [Silo Visual Marketing](.agents/skills/silo-visual-marketing/SKILL.md) |
| Frame onboarding or creative app operation | [Frame Creative Workflow](.agents/skills/frame-creative-workflow/SKILL.md) |
| Silo marketing produced in Frame | Both skills and only their task-relevant references |
| Frame implementation/code changes | [app agent guidance](apps/frame/AGENTS.md) and relevant source/tests |

Marketing guidance determines brand/product correctness. Frame guidance determines executable commands, supported settings, reference roles and production handling. Resolve a mismatch using the actual installed app's capabilities; do not invent controls or silently weaken a product requirement. Keep creative directions separate from API settings.

## Installation and update boundaries

- Fetch the latest approved source from the official repository. Review `release.json` and the managed install plan before applying it. Do not treat an old cached archive as latest.
- Ask before choosing a different scope when an update request is ambiguous; selected components recorded in the existing installation are the default.
- Use a permanent non-synced local installation. Run the helper from the downloaded source, targeting the user's installation, rather than updating the source checkout itself.
- Do not overwrite modified files, use `git reset --hard` or `git clean`, delete user outputs, rewrite SQLite, or copy another person's database/PID history into a fresh workspace.
- Use the agent host's supported skill discovery location when known. The project package is the maintained source; link it into a host skill location where supported, or read the actual `SKILL.md` directly. If a host requires a copy, record it as a derived installed copy and update it with the selected scope. Never author improvements in an untracked second skill copy.
- Keep `.env` and runtime configuration private. Do not print key values, request them in chat or pass them in command arguments. Connection checks may report presence/access without revealing the key.

Verify what you actually installed. Report component versions, app/skill locations, usable launch/task links and any unverified platform-specific step. Native Windows shortcut behavior requires verification on Windows. Stop at the user's requested scope.
