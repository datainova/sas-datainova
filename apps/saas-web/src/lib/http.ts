import { config } from "../config";

export interface ProblemDetails {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  code?: string;
  correlation?: {
    request_id?: string;
    trace_id?: string;
  };
  context?: Record<string, unknown>;
}

export class ApiError extends Error {
  public readonly status: number;
  public readonly problem: ProblemDetails | undefined;

  constructor(message: string, status: number, problem?: ProblemDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export interface HttpOptions extends Omit<RequestInit, "body"> {
  token?: string;
  body?: unknown;
}

async function parseJson<T>(response: Response): Promise<T | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export async function http<T>(path: string, options: HttpOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  headers.set("x-request-id", crypto.randomUUID());

  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const method = options.method ?? "GET";
  const hasBody = options.body !== undefined && options.body !== null;

  if (hasBody) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;

  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...options,
      method,
      headers,
      body: hasBody ? JSON.stringify(options.body) : null,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }

  if (response.ok) {
    if (response.status === 204) {
      return undefined as T;
    }
    const data = await parseJson<T>(response);
    return data as T;
  }

  const problem = await parseJson<ProblemDetails>(response);
  const message =
    problem?.detail ??
    problem?.title ??
    `Erro ${response.status} ao chamar API (${response.statusText})`;

  throw new ApiError(message, response.status, problem);
}
