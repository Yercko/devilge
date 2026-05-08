import { describe, it, expect } from 'vitest';
import { FlowYamlValidator } from '../src/infrastructure/maestro/FlowYamlValidator.js';

describe('FlowYamlValidator', () => {
  it('accepts a minimal valid flow', () => {
    const yaml = `appId: com.example.app
---
- launchApp
- tapOn: "Login"
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.hasRunScript).toBe(false);
  });

  it('rejects an empty file', () => {
    const v = FlowYamlValidator.validate('');
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/empty/i);
  });

  it('rejects a flow without appId', () => {
    const yaml = `---
- launchApp
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.valid).toBe(false);
    expect(v.errors.join('|')).toMatch(/appId/);
  });

  it('rejects a flow without --- separator', () => {
    const yaml = `appId: com.example
- launchApp
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.valid).toBe(false);
    expect(v.errors.join('|')).toMatch(/---/);
  });

  it('rejects a flow without steps', () => {
    const yaml = `appId: com.example.app
---
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.valid).toBe(false);
    expect(v.errors.join('|')).toMatch(/step/i);
  });

  it('flags runScript blocks', () => {
    const yaml = `appId: com.example
---
- launchApp
- runScript: ./script.js
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.hasRunScript).toBe(true);
    expect(v.warnings.join('|')).toMatch(/runScript/);
  });

  it('flags runScript even when nested differently', () => {
    const yaml = `appId: com.example
---
- launchApp
-     runScript:
        path: helper.js
`;
    const v = FlowYamlValidator.validate(yaml);
    expect(v.hasRunScript).toBe(true);
  });
});
