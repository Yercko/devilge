# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[0.1.1]: https://github.com/yercko/devilge/releases/tag/v0.1.1
[0.1.0]: https://github.com/yercko/devilge/releases/tag/v0.1.0
