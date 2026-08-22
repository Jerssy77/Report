import type { PageCopy, PageId, Report, ReportListItem } from "../shared/report";

const basePath = import.meta.env.BASE_URL || "/";

function url(path: string) {
  return `${basePath}${path.replace(/^\//, "")}`;
}

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(body.message || response.statusText);
  }
  return response.json() as Promise<T>;
}

export async function listReports() {
  return parse<ReportListItem[]>(await fetch(url("/api/reports")));
}

export async function getReport(period: string) {
  return parse<Report>(await fetch(url(`/api/reports/${period}`)));
}

export async function bootstrapSample() {
  return parse<Report>(await fetch(url("/api/reports/bootstrap-sample"), { method: "POST" }));
}

export async function uploadReport(formData: FormData) {
  return parse<Report>(await fetch(url("/api/reports"), { method: "POST", body: formData }));
}

export async function saveCopy(period: string, pageId: PageId, copy: Partial<PageCopy>) {
  return parse<Report>(
    await fetch(url(`/api/reports/${period}/copy/${pageId}`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(copy)
    })
  );
}

export async function regenerateCopy(period: string, pageId: PageId) {
  return parse<Report>(await fetch(url(`/api/reports/${period}/regenerate/${pageId}`), { method: "POST" }));
}

export async function exportSnapshot(period: string) {
  return parse<Report>(await fetch(url(`/api/reports/${period}/export`), { method: "POST" }));
}

export function assetUrl(path: string) {
  return url(path);
}
