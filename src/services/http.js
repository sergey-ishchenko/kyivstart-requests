export class HttpError extends Error {
  constructor(status, body) {
    super(`HTTP ${status}: ${String(body).slice(0, 200)}`);
    this.status = status;
  }
}

export async function fetchJson(url, init = {}, timeoutMs = 8000) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => ""));
  return res.json();
}
