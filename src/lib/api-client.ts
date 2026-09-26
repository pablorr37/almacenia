export class ApiError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    const { code, message, details } = body.error ?? {
      code: "ERROR_DESCONOCIDO",
      message: "Ocurrió un error inesperado.",
    };
    throw new ApiError(code, message, details);
  }
  return body.data as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path);
  return parse<T>(res);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return parse<T>(res);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  return parse<T>(res);
}

// Multipart, para /api/archivos/upload (08-archivos.md) — sin Content-Type manual,
// el navegador arma el boundary del form-data solo.
export async function apiUpload<T>(path: string, archivo: File): Promise<T> {
  const form = new FormData();
  form.set("archivo", archivo);
  const res = await fetch(path, { method: "POST", body: form });
  return parse<T>(res);
}
