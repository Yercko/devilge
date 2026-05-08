# Security policy

devilge runs on a developer's machine and exposes mutating tools (input
automation, app install, force-stop, data wipe) to an LLM. Treat security
issues seriously.

## Reporting a vulnerability

**Do NOT open a public GitHub issue for a vulnerability.** Instead:

- Email the maintainer at the address listed in `package.json`'s `author`
  field, or
- Open a private security advisory on the repository:
  `Security` tab → `Report a vulnerability`.

Please include:

- Affected version (run `node dist/index.js --version` if available, or the
  git commit you tested against).
- Reproduction steps and the smallest input that triggers the issue.
- Your assessment of impact (confidentiality / integrity / availability) and
  affected use cases.

You'll get an acknowledgement within 5 working days.
We aim to ship a fix within 30 days for high-severity issues; 90 for low
severity. Coordinated disclosure timelines can be agreed on a case-by-case
basis.

## Scope

In scope:

- Argument injection in any tool that spawns a subprocess (`adb`, `gradlew`,
  `maestro`).
- Path-traversal escapes from `PathValidator`.
- Leakage of secrets through tool responses (e.g. headers we should redact).
- Logic flaws that let an LLM cause data loss outside the configured project root.
- Build-time supply-chain issues in our own code (not transitive `npm` deps).

Out of scope (file regular issues, not security advisories):

- Vulnerabilities in `adb`, `gradlew`, `maestro` themselves — report upstream.
- Vulnerabilities in transitive `npm` dependencies — `npm audit` should pick
  them up; we update on a normal cadence.
- Risks the README explicitly warns about (e.g., running devilge against a
  personal device with logged-in apps).

## Hardening recommendations for operators

devilge inherits its trust model from the operator's setup. To minimize blast
radius:

1. **Connect only a dedicated dev emulator or a wiped test device.** Never a
   personal phone with banking, email, or any logged-in account.
2. Set `DEVILGE_ANDROID_PROJECT_ROOT` to a directory that contains only the
   project you want devilge to access. Anything outside that root is rejected
   by `PathValidator`.
3. **Do not enable `DEVILGE_ALLOW_FLOW_SCRIPTS=true` unless every YAML file in
   `DEVILGE_FLOWS_ROOT` is reviewed and trusted.** Maestro's `runScript:`
   blocks execute arbitrary JS.
4. Keep Maestro pinned to a known version (`DEVILGE_MAESTRO_BIN_PATH`).
5. Review `bootstrap.log` after autonomous sessions — it captures every
   tool invocation made through the server.
6. Treat screenshots (`.devilge-outputs/`) as untrusted artifacts — they may
   contain sensitive content from the running app.
