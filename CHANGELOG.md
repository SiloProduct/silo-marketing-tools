# Changes

## 1.0.3

- Allow bounded asynchronous retries when removing service-test folders briefly locked after Windows process exit. Service ownership and stop assertions remain intact; app/skill components remain 1.0.0.

## 1.0.2

- Make the generated-image folder assertion use native path separators so the same Frame production test runs on Windows and Unix. App/skill component versions remain 1.0.0.

## 1.0.1

- Read publication metadata and multilingual guidance explicitly as UTF-8 on Windows and other hosts; preserve LF bytes when refreshing the public manifest.
- Add coverage for Hebrew documentation under a legacy default encoding and use platform-independent line endings in checkout fixtures. Component app/skill versions remain 1.0.0.

## 1.0.0

- Share Silo Visual Marketing and Frame in one repository with separate installation scopes.
- Consolidate both skills into a discoverable project skill directory and connect Silo guidance to Frame operation.
- Install and update selected components while preserving credentials, saved work and local modifications.
- Replace Drive-copy credential assumptions with private connection setup.
- Distribute product/brand source links without research reports or collected marketing media.
- Verify Frame service identity and the Node runtime before launcher/service actions.
- Translate Silo part names into source-anchored generator instructions and require complete product-detail comparison after every generation/edit and repair.
- Make the repository link an assistant entry point: scope selection, setup, updates and operation are handled by the assistant for teammates without repository or command-line knowledge.
- Keep explicit Hebrew onboarding and conversation guidance, with exact English UI labels and intended Hebrew output text preserved.
