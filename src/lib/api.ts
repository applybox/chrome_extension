export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "https://api.applybox.co.uk/api";

export function getApiOrigin(): string {
  return API_BASE_URL.replace(/\/api$/, "");
}

function buildApiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function buildApiHeaders(
  extra: Record<string, string> = {},
  options: { token?: string; tenantId?: string; json?: boolean } = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...extra,
  };

  if (options.json) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.tenantId) headers["X-Tenant-ID"] = options.tenantId;

  return headers;
}

async function parseApiResponse(response: Response): Promise<Record<string, unknown>> {
  if (response.type === "opaqueredirect" || (response.status >= 300 && response.status < 400)) {
    throw new ApiError(
      `API redirected (${response.status}). Ensure the extension is rebuilt and the API is deployed.`,
      response.status,
      { redirect: true, url: response.url }
    );
  }

  return (await response.json().catch(() => ({}))) as Record<string, unknown>;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(message: string, status: number, data: Record<string, unknown>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function formatApiErrorMessage(data: Record<string, unknown>, fallback: string): string {
  const errors = data.errors as Record<string, string[] | string> | undefined;
  if (errors) {
    const first = Object.values(errors).flat()[0];
    if (typeof first === "string" && first.length > 0) return first;
  }
  const message = data.message as string | undefined;
  if (message) return message;
  const error = data.error as string | undefined;
  if (error) return error;
  return fallback;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string; tenantId?: string } = {}
): Promise<T> {
  const { token, tenantId, ...fetchOptions } = options;
  const headers = buildApiHeaders(fetchOptions.headers as Record<string, string>, {
    token,
    tenantId,
    json: true,
  });

  const response = await fetch(buildApiUrl(path), {
    ...fetchOptions,
    headers,
    redirect: "manual",
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const body = data as Record<string, unknown>;
    throw new ApiError(
      formatApiErrorMessage(body, "Request failed"),
      response.status,
      body
    );
  }

  return data as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: { token?: string; tenantId?: string } = {}
): Promise<T> {
  const { token, tenantId } = options;
  const headers = buildApiHeaders({}, { token, tenantId });

  const response = await fetch(buildApiUrl(path), {
    method: "POST",
    headers,
    body: formData,
    redirect: "manual",
  });

  const data = await parseApiResponse(response);

  if (!response.ok) {
    const body = data as Record<string, unknown>;
    throw new ApiError(
      formatApiErrorMessage(body, "Upload failed"),
      response.status,
      body
    );
  }

  return data as T;
}
