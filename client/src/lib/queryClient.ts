import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAuthToken } from "@/lib/auth";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

/** Thrown when an API response has status >= 400. Prefer `serverMessage` for user-facing text. */
export class ApiError extends Error {
  readonly status: number;
  readonly bodyText: string;
  readonly serverMessage?: string;

  constructor(
    status: number,
    bodyText: string,
    opts?: { serverMessage?: string; url?: string },
  ) {
    const trimmed = opts?.serverMessage?.trim();
    const msg = trimmed || `${status}: ${(bodyText || "").slice(0, 280)}`;
    super(msg);
    this.name = "ApiError";
    this.status = status;
    this.bodyText = bodyText;
    this.serverMessage = trimmed;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) return { Authorization: `Bearer ${token}` };
  return {};
}

function parseServerMessageJson(text: string): string | undefined {
  try {
    const j = JSON.parse(text) as { message?: unknown };
    if (typeof j?.message === "string" && j.message.trim()) return j.message.trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const serverMessage = parseServerMessageJson(text);
    throw new ApiError(res.status, text, { serverMessage });
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
  };
  if (data) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

export async function apiRequestForm(
  method: string,
  url: string,
  formData: FormData,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: {
      ...getAuthHeaders(),
    },
    body: formData,
  });

  await throwIfResNotOk(res);
  return res;
}

/**
 * Multipart POST with upload progress (fetch does not expose upload progress).
 * `onProgress(0–100)` when length is known; `onProgress(-1)` for indeterminate uploads.
 */
export function postFormDataWithProgress<T>(
  url: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}${url}`);
    const headers = getAuthHeaders();
    if (headers.Authorization) {
      xhr.setRequestHeader("Authorization", headers.Authorization);
    }
    xhr.upload.onprogress = (ev) => {
      if (!onProgress) return;
      if (ev.lengthComputable && ev.total > 0) {
        onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
      } else {
        onProgress(-1);
      }
    };
    xhr.onload = () => {
      const text = xhr.responseText ?? "";
      const start = text.trimStart();
      if (xhr.status < 200 || xhr.status >= 300) {
        const serverMessage = parseServerMessageJson(text);
        reject(new ApiError(xhr.status, text, { serverMessage }));
        return;
      }
      if (start.startsWith("<!") || start.toLowerCase().startsWith("<html")) {
        reject(
          new Error(
            "Server returned a web page instead of JSON. Ensure the app and API share the same origin in dev.",
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(text) as T);
      } catch {
        reject(new Error((text || "Empty body").slice(0, 280) || "Response was not valid JSON"));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.send(formData);
  });
}

/** Use after a successful (2xx) fetch when the body must be JSON — catches HTML error pages that slip through with 200. */
export async function readResponseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const start = text.trimStart();
  if (start.startsWith("<!") || start.toLowerCase().startsWith("<html")) {
    throw new Error(
      "Server returned a web page instead of JSON. Ensure the app and API share the same origin in dev, or redeploy so POST /api routes are not handled by the SPA fallback.",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error((text || "Empty body").slice(0, 280) || "Response was not valid JSON");
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(`${API_BASE}${queryKey.join("/")}`, {
      headers: getAuthHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
