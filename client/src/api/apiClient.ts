const API_BASE_URL = 'http://localhost:3000/api';

export class ApiError extends Error {
  status: number;
  code: string;
  fields?: Record<string, string>;

  constructor(status: number, code: string, message: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/**
 * Shared fetch wrapper for the TokTickIT API.
 *
 * `credentials: 'include'` is required for every request: the client and
 * server run on different ports, and without it the browser will not send
 * the `sid` session cookie set by POST /api/auth/login (api-spec.md sec 0).
 */
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  if (rest.body && !(rest.body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      credentials: 'include',
      headers: finalHeaders,
    });
  } catch (networkError) {
    throw new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the TokTickIT API.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let body: any = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON response (e.g. file download) is handled by the caller.
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? 'UNKNOWN_ERROR',
      body?.message ?? 'An unexpected error occurred.',
      body?.fields
    );
  }

  return body as T;
}
