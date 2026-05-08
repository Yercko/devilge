/**
 * Domain-level errors. These are surfaced to MCP clients with safe messages —
 * never include raw stack traces or filesystem paths the user did not provide.
 */
export class DevilgeError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'DevilgeError';
    this.code = code;
  }
}

export class ConfigurationError extends DevilgeError {
  constructor(message: string) {
    super('CONFIGURATION_ERROR', message);
    this.name = 'ConfigurationError';
  }
}

export class SecurityError extends DevilgeError {
  constructor(message: string) {
    super('SECURITY_ERROR', message);
    this.name = 'SecurityError';
  }
}

export class AdbError extends DevilgeError {
  constructor(message: string) {
    super('ADB_ERROR', message);
    this.name = 'AdbError';
  }
}

export class NotFoundError extends DevilgeError {
  constructor(message: string) {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}
