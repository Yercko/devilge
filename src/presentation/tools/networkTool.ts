import { z } from 'zod';
import type { GetNetworkCallsUseCase } from '../../application/index.js';
import { toToolError } from '../toolError.js';

export const networkCallsToolName = 'devilge_get_network_calls';

export const networkCallsInputSchema = {
  serial: z
    .string()
    .min(1)
    .max(128)
    .optional()
    .describe('Device serial. Defaults to the only attached device or DEVILGE_DEFAULT_DEVICE_SERIAL.'),
  maxCalls: z
    .number()
    .int()
    .positive()
    .max(500)
    .optional()
    .describe('Maximum NetworkCall objects to return. Default 50.'),
  logcatLines: z
    .number()
    .int()
    .positive()
    .max(5000)
    .optional()
    .describe('How many recent logcat lines to scan for the parser. Default 2000.'),
  tag: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional()
    .describe('Logcat tag the HTTP-client logger writes under. "HttpClient" (Ktor default), "OkHttp" (Retrofit/OkHttp default), or your custom logger\'s tag.'),
  statusFilter: z
    .number()
    .int()
    .min(100)
    .max(599)
    .optional()
    .describe('Keep only calls whose response has this exact HTTP status code.'),
  methodFilter: z
    .string()
    .min(1)
    .max(16)
    .regex(/^[A-Za-z]+$/)
    .optional()
    .describe('Keep only calls with this HTTP method (case-insensitive).'),
  urlContains: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe('Keep only calls whose URL contains this substring (case-insensitive).'),
};

export const networkCallsToolDefinition = {
  title: 'Inspect HTTP traffic (Ktor + OkHttp/Retrofit, via logcat)',
  description:
    'Returns recent HTTP request/response pairs captured from the running Android app. ' +
    'Parses two formats from logcat: Ktor `Logging` plugin (tag "HttpClient" by default) and ' +
    'OkHttp `HttpLoggingInterceptor` (tag "OkHttp" by default — used by Retrofit). The format ' +
    'is auto-detected by content; configure via DEVILGE_HTTP_LOG_FORMAT if needed. Requires the ' +
    "app's HTTP logger to be active (Ktor LogLevel.HEADERS+ / OkHttp Level.HEADERS+; BODY/ALL " +
    'recommended to capture bodies). Sensitive headers (Authorization, Cookie, Set-Cookie, X-API-Key, ' +
    'etc.) are redacted automatically.',
  inputSchema: networkCallsInputSchema,
};

export function buildNetworkCallsHandler(useCase: GetNetworkCallsUseCase) {
  return async (args: {
    serial?: string;
    maxCalls?: number;
    logcatLines?: number;
    tag?: string;
    statusFilter?: number;
    methodFilter?: string;
    urlContains?: string;
  }) => {
    try {
      const calls = await useCase.execute({
        ...(args.serial ? { serial: args.serial } : {}),
        ...(args.maxCalls !== undefined ? { maxCalls: args.maxCalls } : {}),
        ...(args.logcatLines !== undefined ? { logcatLines: args.logcatLines } : {}),
        ...(args.tag ? { tag: args.tag } : {}),
        ...(args.statusFilter !== undefined ? { statusFilter: args.statusFilter } : {}),
        ...(args.methodFilter ? { methodFilter: args.methodFilter } : {}),
        ...(args.urlContains ? { urlContains: args.urlContains } : {}),
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ count: calls.length, calls }, null, 2),
          },
        ],
      };
    } catch (err) {
      return toToolError(err);
    }
  };
}
