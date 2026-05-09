# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-05-09

### Fixed

- Use exact GitHub username casing (`io.github.Yercko/devilge`) in `mcpName`
  and `server.json#name`. The MCP Registry requires the namespace prefix to
  match the authenticated GitHub user's literal handle (case-sensitive);
  lowercase versions are rejected with `403 Forbidden`. Republished to npm so
  the verification marker on the package matches the registry submission.
- Shortened `server.json#description` to ≤100 characters to satisfy the
  registry's validation limit (the previous longer description was rejected
  with `422 Unprocessable Entity`).

## [0.2.1] - 2026-05-09

### Changed

- Added `mcpName: "io.github.yercko/devilge"` to `package.json` and a top-level
  `server.json` describing the package for the
  [MCP Registry](https://registry.modelcontextprotocol.io/). This is the
  ownership-verification marker the registry uses to confirm the npm package
  belongs to the listed server. No functional change.

## [0.2.0] - 2026-05-08

### Added

- **`devilge_batch`** — new tool that executes a sequence of devilge tools in a
  single MCP round trip. Sub-actions run sequentially and stop on the first
  error. Designed to reduce permission-prompt fatigue in host UIs that confirm
  each tool call: chain `tap_text → wait_for_idle → take_screenshot` with one
  approval. Capped at 20 actions per call. Cannot be nested. Refuses to include
  destructive sub-tools (`devilge_clear_app_data`, `devilge_install_apk`) — the
  user always sees a dedicated prompt for those.
- **MCP tool annotations** on all 32 tools (`readOnlyHint`, `idempotentHint`,
  `destructiveHint`, `openWorldHint`). Hosts that respect MCP annotation
  metadata can auto-approve safe reads, prompt only on state-changing tools,
  and always confirm destructive ones. Distribution: 16 read-only, 14 state-
  changing reversible, 2 destructive.

### Changed

- Tool count is now **33** (32 + `devilge_batch`). The server registration
  order in `server.ts` has been refactored to populate a registry consumed by
  the batch tool — same MCP wire protocol, no behavioral change for clients
  that don't use batching.

### Tests

- 13 new unit tests for `devilge_batch`: schema bounds, sequential execution,
  stop-on-error (throws and isError paths), recursion guard, destructive-tool
  guard, unknown tool, invalid input, image content placement.

## [0.1.1] - 2026-05-08

### Fixed

- `dist/index.js` is now made executable during build (`chmod +x`). Without this,
  `npx -y devilge` from a clean install failed with `Permission denied` because
  TypeScript's compiler does not preserve the executable bit.

## [0.1.0] - 2026-05-08

Initial public release.

### Tools (32)

- **App lifecycle**: `launch_app`, `stop_app`, `clear_app_data`, `restart_app`,
  `open_deeplink`, `inspect_packages`, `app_info`.
- **Logs & errors**: `read_logcat`, `tail_logcat`, `get_app_errors`,
  `group_stack_traces`.
- **Network**: `get_network_calls` with auto-detection of Ktor `Logging` and
  OkHttp `HttpLoggingInterceptor` formats. Default tag list `HttpClient,OkHttp`
  works out of the box for both Ktor and Retrofit projects.
- **UI inspection**: `dump_ui_hierarchy`, `find_ui_node`, `tap_ui_node`,
  `input_text`, `take_screenshot`.
- **Compose**: `list_compose_previews`, `get_compose_previews_tree`.
- **Project structure**: `scan_project`, `list_modules`, `read_gradle_task`.
- **Build & install**: `gradle_build`, `gradle_run_task`, `install_apk`,
  `parse_compile_errors`, `parse_junit_report`.
- **Maestro (optional)**: `run_maestro_flow`, `validate_flow_yaml` — graceful
  degradation when `maestro` binary is absent.
- **Sanitizers & validators**: input/path/header/command sanitizer modules
  applied across all adapters.

### Security

- `shell: false` on every spawn; argv arrays only.
- Path traversal prevention via `realpath` resolution in `PathValidator`.
- HTTP header redaction (`Authorization`, `Cookie`, etc.) in network output.
- Maestro flow scripts disabled by default (`DEVILGE_ALLOW_FLOW_SCRIPTS=false`).

### Tests

- 202 unit tests covering parsers, sanitizers, use cases, and adapters.

[0.2.2]: https://github.com/Yercko/devilge/releases/tag/v0.2.2
[0.2.1]: https://github.com/yercko/devilge/releases/tag/v0.2.1
[0.2.0]: https://github.com/yercko/devilge/releases/tag/v0.2.0
[0.1.1]: https://github.com/yercko/devilge/releases/tag/v0.1.1
[0.1.0]: https://github.com/yercko/devilge/releases/tag/v0.1.0
