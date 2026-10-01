# Working with Frame

This folder contains **Frame**, a local creative app and agent CLI. The shared tools installation has its app at `apps/frame/` and both skills at the repository root's `.agents/skills/`.

For brainstorming media, creating/editing tasks, preparing references or variations, reviewing samples, managing production or onboarding, read [Frame Creative Workflow](../../.agents/skills/frame-creative-workflow/SKILL.md). Invoke `$frame-creative-workflow` where supported; otherwise read the file directly.

For Silo marketing or product-bearing work, also read [Silo Visual Marketing](../../.agents/skills/silo-visual-marketing/SKILL.md) when installed. It owns brand/product context, asset discovery and fidelity review; Frame owns app capabilities and execution. Generic Frame work does not require Silo guidance. If product context is missing, obtain it before inventing details.

Converse in the user's language, use English generation directions and preserve literal output text in its intended language. Operate the CLI for nontechnical users, showing actual media and task links. Use [installation/update guidance](../../docs/install-update.md) for selected-component setup; reuse established storage and saved work. Installation does not authorize paid generation.

For feature development, code review or fixes, follow the engineering request, inspect relevant code and run appropriate checks. Do not start paid media generation merely to test code or documentation.

The command/schema contract is in [docs/agent-cli.md](docs/agent-cli.md), `node scripts/frame.js --help`, `schema` and `capabilities`. Never expose `.env` keys or edit SQLite/media history to bypass the CLI.

## Skill source of truth

Maintain the Frame skill only at the shared repository root's `.agents/skills/frame-creative-workflow/`, including references and `agents/openai.yaml`. The Silo marketing skill is its sibling. Do not restore old app-bundled copies or maintain a separate authoring version in this app. Managed colleague installations receive their selected packages through repository updates; host-specific installed copies are distribution targets rather than independent authoring sources.
