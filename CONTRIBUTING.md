# Contributing to devilge

Thanks for considering a contribution. devilge is a small, opinionated MCP
server — keeping it focused matters more than feature volume.

## Before opening a PR

- **Open an issue first** for anything beyond a typo fix or trivial bug. We'd
  rather discuss design than reject implemented work.
- **Read the README and the `specs/` folder** to understand the architectural
  decisions (clean / hexagonal layers, deny-by-default security, no opinions
  baked into auditing tools, Maestro as optional integration).
- **Run the bootstrap** locally and confirm everything stays green:

  ```bash
  bash scripts/bootstrap.sh
  ```

  This runs `npm install`, type-check, build, lint and the full test suite.

## Code style

- TypeScript with `strict: true` and `noUncheckedIndexedAccess`. No `any`.
- Clean / hexagonal layers — `src/domain` knows nothing about `src/infrastructure`.
- New tools require: domain entity / port → use case → adapter → MCP tool.
  Don't put logic in the tool handler beyond input validation and JSON
  serialization.
- Spawning external processes goes through `AdbProcessRunner`,
  `GradleProcessRunner`, or `MaestroProcessRunner`. **Never** raw `child_process`
  in business code; **never** `shell: true`. Inputs go through `CommandSanitizer`.
- File reads constrained by `PathValidator` — paths are resolved with
  `realpath` and rejected if they escape the project root.
- Errors throw `DevilgeError` subclasses. The `toToolError` helper sanitizes
  unknown exceptions to opaque `INTERNAL_ERROR`.

## Tests

- Every new use case, parser, or sanitizer ships with Vitest tests.
- Tests live under `tests/` and mirror `src/` filenames.
- `npm test` must stay green — no `it.skip`, no flaky tests checked in.
- Aim for behavior tests over implementation details; mock at the port boundary.

## Pull request checklist

A maintainer will close PRs that miss these without comment. Save them for review:

- [ ] CI is green on the PR branch.
- [ ] New behavior has tests.
- [ ] README updated when user-facing behavior or env vars change.
- [ ] No new dependencies without justification in the PR description (we keep
  the dependency tree small on purpose).
- [ ] No personal paths or secrets in committed files.
- [ ] If the change adds a new tool, register it in `src/server.ts` and add it
  to the README's tool catalog.
- [ ] Commit messages are conventional: `feat:`, `fix:`, `docs:`, `refactor:`,
  `test:`, `chore:`.

## What we will NOT accept

These are deliberate non-goals — bringing them up will get a polite "no":

- **Custom flow runner DSL.** Maestro fills that role and is reusable.
- **Frontmost-app enforcement** for input/lifecycle tools. That's a deployment
  concern; devilge assumes a dedicated dev emulator or wiped test device.
- **Convention-based code-quality auditors.** Removed deliberately — see the
  deprecated `specs/05-quality-and-rendering-*.md` for the rationale.
- **Compose Live Edit MCP** as part of devilge. If JetBrains ships Compose Hot
  Reload for Android, we'll wrap it. Reimplementing it from scratch is not
  in scope.

## Triage policy

- Issues without a minimal reproducible case may be closed after 14 days.
- Feature requests are welcome but the bar is high: spell out the use case,
  why it can't be done by composing existing tools, and the expected
  invocation shape.
- Maintenance happens in batches roughly monthly, not in real time.

## Releasing (maintainers)

1. Update `CHANGELOG.md` with the new version.
2. Bump `version` in `package.json`.
3. Tag: `git tag vX.Y.Z && git push --tags`.
4. Publish: `npm publish --access public`.
5. Update the README's tool count if anything changed.
