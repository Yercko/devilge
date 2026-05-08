# Examples

Reference Maestro flows you can copy into your project's `devilge-flows/`
directory (or wherever `DEVILGE_FLOWS_ROOT` points).

| File | Purpose |
| --- | --- |
| `flows/launch_settings.yaml` | Smoke test — opens the Android system Settings app. Works on any emulator without your app installed. Useful to validate Maestro integration after `brew install maestro`. |
| `flows/login_template.yaml` | Template for a parameterised login flow. Replace `appId` and the visible-text selectors with what your app actually shows; pass credentials via the tool's `params` argument. |

After copying, validate the YAML statically before running:

```json
devilge_validate_maestro_flow { "name": "launch_settings" }
```

Then execute:

```json
devilge_run_maestro_flow { "name": "launch_settings" }
```
