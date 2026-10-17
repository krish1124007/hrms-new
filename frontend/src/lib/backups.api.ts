import { isAxiosError } from 'axios';
import { api } from './axios';

interface ApiOk<T> {
  success: true;
  data: T;
}

export interface BackupRow {
  _id: string;
  type: 'database' | 'files' | 'full';
  status: 'in_progress' | 'completed' | 'failed';
  trigger: 'manual' | 'scheduled';
  size?: number;
  /**
   * Authenticated download route (`/api/v1/backups/<id>/download`), or null
   * while the backup is not complete or its file is missing. Fetch it through
   * `backupsApi.download` — a plain link would not carry the auth header.
   */
  downloadUrl: string | null;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
}

export interface BackupSchedule {
  enabled: boolean;
  pattern: string;
  description: string;
  nextRun?: number;
}

export interface BackupDownload {
  blob: Blob;
  filename: string;
}

/**
 * Turn a server-supplied `downloadUrl` into something the axios instance can
 * request. The instance attaches the Bearer token, so only a relative path or
 * a URL on the API's own origin is followed — anything else throws before a
 * request is made. A path under the `baseURL` path (e.g. `/api/v1/...`) is
 * made relative to it so the `/api/v1` segment is not doubled.
 */
function toApiRequestUrl(downloadUrl: string): string {
  const base = new URL(api.defaults.baseURL ?? '/', window.location.origin);
  const target = new URL(downloadUrl, base);
  if (target.origin !== base.origin) {
    throw new Error('Refusing to download a backup from another origin');
  }
  const basePath = base.pathname.replace(/\/+$/, '');
  if (basePath && target.pathname.startsWith(`${basePath}/`)) {
    return target.pathname.slice(basePath.length) + target.search;
  }
  return target.toString();
}

interface ErrorEnvelope {
  error?: { message?: unknown };
}

/**
 * With `responseType: 'blob'` an error body arrives as a Blob, so the global
 * toast would only say "Request failed with status code 404". Read the JSON
 * envelope out of it and rethrow with the server's message (or the status text).
 */
async function withReadableBlobError(err: unknown): Promise<never> {
  if (!isAxiosError(err) || !(err.response?.data instanceof Blob)) throw err;
  const fallback = err.response.statusText || err.message;
  let message = fallback;
  try {
    const parsed = JSON.parse(await err.response.data.text()) as ErrorEnvelope;
    if (typeof parsed.error?.message === 'string' && parsed.error.message) {
      message = parsed.error.message;
    }
  } catch {
    // Not the JSON envelope (e.g. a proxy's HTML page) — keep the fallback.
  }
  throw new Error(message, { cause: err });
}

/** `attachment; filename="x.tar.gz"` → `x.tar.gz` (null if absent or unreadable). */
function filenameFromDisposition(header: unknown): string | null {
  if (typeof header !== 'string') return null;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1].trim());
  } catch {
    return match[1].trim();
  }
}

export const backupsApi = {
  list: async (): Promise<BackupRow[]> => {
    const { data } = await api.get<ApiOk<BackupRow[]>>('/backups');
    return data.data;
  },
  create: async (
    input: { type?: 'database' | 'files' | 'full' } = {},
  ): Promise<BackupRow> => {
    const { data } = await api.post<ApiOk<BackupRow>>('/backups', input);
    return data.data;
  },
  /** Restores into the scratch database configured on the server — never the live one. */
  restore: async (id: string): Promise<void> => {
    await api.post(`/backups/${id}/restore`, {});
  },
  delete: async (id: string): Promise<void> => {
    await api.delete(`/backups/${id}`);
  },
  getSchedule: async (): Promise<BackupSchedule> => {
    const { data } = await api.get<ApiOk<BackupSchedule>>('/backups/schedule');
    return data.data;
  },
  setSchedule: async (enabled: boolean): Promise<BackupSchedule> => {
    const { data } = await api.put<ApiOk<BackupSchedule>>('/backups/schedule', {
      enabled,
    });
    return data.data;
  },
  /** Fetch a backup archive with the caller's credentials. */
  download: async (backup: Pick<BackupRow, '_id' | 'downloadUrl'>): Promise<BackupDownload> => {
    if (!backup.downloadUrl) throw new Error('This backup has no downloadable file');
    const res = await api
      .get<Blob>(toApiRequestUrl(backup.downloadUrl), { responseType: 'blob' })
      .catch(withReadableBlobError);
    return {
      blob: res.data,
      filename:
        filenameFromDisposition(res.headers['content-disposition']) ?? `${backup._id}.tar.gz`,
    };
  },
};

/** Hand a downloaded blob to the browser as a file save. */
export function saveBlob({ blob, filename }: BackupDownload): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
