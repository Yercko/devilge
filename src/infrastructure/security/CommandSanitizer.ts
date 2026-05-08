import { SecurityError } from '../../config/errors.js';

/**
 * Validates inputs that flow into shell-adjacent command-line arguments.
 * Even though we always invoke binaries with an argv array (no shell), we still
 * defend against argument-smuggling and footguns from upstream operators.
 */
export class CommandSanitizer {
  /**
   * Allowed device serials per ADB conventions:
   *   transport-ids, "emulator-5554", IP:PORT, USB serials.
   * We deliberately disallow shell metacharacters and whitespace.
   */
  static readonly DEVICE_SERIAL = /^[A-Za-z0-9._:-]{1,128}$/;

  /** Logcat tags: alphanumerics, dot, dash, underscore. */
  static readonly LOGCAT_TAG = /^[A-Za-z0-9._-]{1,64}$/;

  /** Android system properties: lowercase + dots + digits. */
  static readonly SYSTEM_PROP = /^[a-zA-Z0-9._-]{1,128}$/;

  /** Java/Kotlin package name: a.b.c style, optional process suffix `:tag` (e.g. `:remote`). */
  static readonly PACKAGE_NAME = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+(:[a-zA-Z0-9._-]+)?$/;

  static deviceSerial(value: string): string {
    return this.assertMatch(value, this.DEVICE_SERIAL, 'device serial');
  }

  static logcatTag(value: string): string {
    return this.assertMatch(value, this.LOGCAT_TAG, 'logcat tag');
  }

  static systemProperty(value: string): string {
    return this.assertMatch(value, this.SYSTEM_PROP, 'system property');
  }

  static packageName(value: string): string {
    return this.assertMatch(value, this.PACKAGE_NAME, 'package name');
  }

  /** Looser package-name *substring* for filters (e.g. "myapp"). */
  static readonly PACKAGE_FILTER = /^[a-zA-Z0-9._-]{1,128}$/;

  static packageFilter(value: string): string {
    return this.assertMatch(value, this.PACKAGE_FILTER, 'package filter');
  }

  /** Allowed characters in `adb shell input text "..."`. */
  static readonly INPUT_TEXT_MAX_LEN = 1024;

  static inputText(value: unknown): string {
    if (typeof value !== 'string') {
      throw new SecurityError('input text must be a string.');
    }
    if (value.length === 0) {
      throw new SecurityError('input text must not be empty.');
    }
    if (value.length > this.INPUT_TEXT_MAX_LEN) {
      throw new SecurityError(
        `input text exceeds the ${this.INPUT_TEXT_MAX_LEN}-char limit.`,
      );
    }
    if (value.includes('\0')) {
      throw new SecurityError('input text contains a NUL byte.');
    }
    if (/[\r\n]/.test(value)) {
      throw new SecurityError(
        'input text must not contain newlines (use input_key=ENTER instead).',
      );
    }
    return value;
  }

  /** Validate integer screen coordinate within 0..MAX. */
  static readonly COORD_MAX = 10_000;

  static coordinate(value: unknown, label: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new SecurityError(`${label} must be an integer.`);
    }
    if (value < 0 || value > this.COORD_MAX) {
      throw new SecurityError(
        `${label} must be between 0 and ${this.COORD_MAX} (got ${value}).`,
      );
    }
    return value;
  }

  /**
   * Activity name: short (`.MainActivity`) or fully-qualified
   * (`com.example.app.MainActivity`). `$` allowed for inner classes.
   */
  static readonly ACTIVITY_NAME = /^\.?[a-zA-Z][\w$]*(\.[a-zA-Z][\w$]*)*$/;

  static activityName(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
      throw new SecurityError('activity must be a 1..256 char string.');
    }
    if (!this.ACTIVITY_NAME.test(value)) {
      throw new SecurityError(
        'activity must look like ".MainActivity" or "com.foo.MainActivity" (letters/digits/dots/$/_ only).',
      );
    }
    return value;
  }

  /**
   * Deep link / URI. We allow common schemes (http, https, custom) and a
   * conservative character class. NUL bytes, whitespace, shell metacharacters
   * and quotes are rejected.
   */
  static readonly DEEP_LINK_MAX_LEN = 1024;
  // Require the first char after `://` to NOT be `/`, to reject `http:///x`
  // and similar empty-host inputs that some shells handle ambiguously.
  static readonly DEEP_LINK =
    /^[a-z][a-z0-9+.-]*:\/\/[A-Za-z0-9._~:?#[\]@!$&'()*+,;=%-][A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/;

  static deepLink(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > this.DEEP_LINK_MAX_LEN) {
      throw new SecurityError(
        `deep link must be a 1..${this.DEEP_LINK_MAX_LEN} char string.`,
      );
    }
    if (!this.DEEP_LINK.test(value)) {
      throw new SecurityError(
        'deep link must be a URI like "scheme://path"; whitespace, NUL bytes and shell metacharacters are rejected.',
      );
    }
    return value;
  }

  /** FQ test class name: `com.example.LoginInstrumentedTest`. */
  static readonly TEST_CLASS = /^[a-zA-Z_][\w$]*(\.[a-zA-Z_][\w$]*)+$/;

  static testClassFqn(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 256) {
      throw new SecurityError('testClass must be a 1..256 char string.');
    }
    if (!this.TEST_CLASS.test(value)) {
      throw new SecurityError(
        'testClass must be a fully-qualified class name (e.g. "com.foo.LoginInstrumentedTest").',
      );
    }
    return value;
  }

  static readonly TEST_METHOD = /^[a-zA-Z_][\w$]*$/;

  static testMethodName(value: string): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > 128) {
      throw new SecurityError('testMethod must be a 1..128 char string.');
    }
    if (!this.TEST_METHOD.test(value)) {
      throw new SecurityError('testMethod must be a Kotlin/Java identifier.');
    }
    return value;
  }

  static positiveInt(value: number, label: string, max: number): number {
    if (!Number.isInteger(value) || value <= 0 || value > max) {
      throw new SecurityError(
        `${label} must be an integer between 1 and ${max} (got ${value}).`,
      );
    }
    return value;
  }

  private static assertMatch(value: unknown, pattern: RegExp, label: string): string {
    if (typeof value !== 'string') {
      throw new SecurityError(`${label} must be a string.`);
    }
    if (!pattern.test(value)) {
      throw new SecurityError(`${label} contains invalid characters.`);
    }
    return value;
  }

  /** Maestro flow basename (no extension, no slashes). */
  static readonly FLOW_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,127}$/;

  static flowName(value: string): string {
    if (typeof value !== 'string') {
      throw new SecurityError('flow name must be a string.');
    }
    if (!this.FLOW_NAME.test(value)) {
      throw new SecurityError(
        'flow name may only contain letters, digits, dash, underscore (must start with a letter, ≤128 chars).',
      );
    }
    return value;
  }

  /** Maestro env var key passed via `-e KEY=VALUE`. */
  static readonly FLOW_ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

  static flowEnvKey(value: string): string {
    if (typeof value !== 'string') {
      throw new SecurityError('flow env key must be a string.');
    }
    if (!this.FLOW_ENV_KEY.test(value)) {
      throw new SecurityError(
        'flow env key must be a UPPER_SNAKE / camelCase identifier (≤64 chars).',
      );
    }
    return value;
  }

  /**
   * Maestro env var value. Reject NUL bytes / newlines / excessive length so
   * the value can never break out of the `-e KEY=VALUE` argv slot.
   */
  static readonly FLOW_ENV_VALUE_MAX_LEN = 1024;

  static flowEnvValue(value: unknown): string {
    if (typeof value !== 'string') {
      throw new SecurityError('flow env value must be a string.');
    }
    if (value.length > this.FLOW_ENV_VALUE_MAX_LEN) {
      throw new SecurityError(
        `flow env value exceeds the ${this.FLOW_ENV_VALUE_MAX_LEN}-char limit.`,
      );
    }
    if (value.includes('\0') || /[\r\n]/.test(value)) {
      throw new SecurityError('flow env value contains NUL bytes or newlines.');
    }
    return value;
  }
}
