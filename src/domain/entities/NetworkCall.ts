/**
 * A single HTTP exchange captured from the running app.
 * Source-agnostic: the `source` field tells you which adapter produced it
 * (Ktor logcat parser today, OkHttp / interceptor library / proxy in future).
 */
export interface NetworkCall {
  readonly id: string;
  readonly source: NetworkCaptureSource;
  readonly request: NetworkRequest;
  readonly response?: NetworkResponse;
  readonly durationMs?: number;
}

export type NetworkCaptureSource =
  | 'ktor-logcat'
  | 'okhttp-logcat'
  | 'devilge-android'
  | 'mitmproxy';

export interface NetworkRequest {
  readonly timestamp?: string;
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyContentType?: string;
  readonly body?: string;
  readonly bodyBytes?: number;
}

export interface NetworkResponse {
  readonly timestamp?: string;
  readonly statusCode: number;
  readonly statusText?: string;
  readonly fromUrl?: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyContentType?: string;
  readonly body?: string;
  readonly bodyBytes?: number;
}
