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

interface RequestOptions extends RequestInit {
  requesterId?: number | null;
}

/**
 * Shared fetch wrapper for the TokTickIT API.
 *
 * When `requesterId` is provided, attaches the temporary Lab 2 `x-requester-id`
 * header (see api-spec.md §0). This header is a TESTING MECHANISM ONLY.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { requesterId, headers, ...rest } = options;

  const finalHeaders: Record<string, string> = {
    ...(headers as Record<string, string>),
  };

  if (requesterId != null) {
    finalHeaders['x-requester-id'] = String(requesterId);
  }

  if (rest.body && !(rest.body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
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
