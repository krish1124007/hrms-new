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
 * `downloadUrl` is server-absolute (it starts with the API's own path, e.g.
 * `/api/v1/...`). Make it relative to the axios `baseURL` when it shares that
 * prefix, otherwise resolve it against the API origin, so the request never
 * doubles the `/api/v1` segment.
 */
function toApiRequestUrl(downloadUrl: string): string {
  if (/^https?:\/\//i.test(downloadUrl)) return downloadUrl;
  const base = new URL(api.defaults.baseURL ?? '/', window.location.origin);
  const basePath = base.pathname.replace(/\/+$/, '');
  if (basePath && downloadUrl.startsWith(`${basePath}/`)) {
    return downloadUrl.slice(basePath.length);
  }
  return new URL(downloadUrl, base.origin).toString();
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
    const res = await api.get<Blob>(toApiRequestUrl(backup.downloadUrl), {
      responseType: 'blob',
    });
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
