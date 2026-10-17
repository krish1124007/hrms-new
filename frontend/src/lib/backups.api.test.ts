import {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './axios';
import { backupsApi } from './backups.api';

const BACKUP = { _id: 'b1', downloadUrl: '/api/v1/backups/b1/download' };

function failWith(status: number, statusText: string, data: unknown): AxiosAdapter {
  return async (config: InternalAxiosRequestConfig) => {
    const response = { status, statusText, data, headers: {}, config } as AxiosResponse;
    throw new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      response,
    );
  };
}

describe('backupsApi.download', () => {
  const originalAdapter = api.defaults.adapter;
  let adapter: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = vi.fn();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
  });

  it('requests the route relative to the API base and names the file from Content-Disposition', async () => {
    adapter.mockImplementation(async (config: InternalAxiosRequestConfig) => ({
      status: 200,
      statusText: 'OK',
      data: new Blob(['archive']),
      headers: new AxiosHeaders({ 'content-disposition': 'attachment; filename="db-2026-10.tar.gz"' }),
      config,
    }));
    api.defaults.adapter = adapter as unknown as AxiosAdapter;

    const file = await backupsApi.download(BACKUP);

    expect(file.filename).toBe('db-2026-10.tar.gz');
    const config = adapter.mock.calls[0][0] as InternalAxiosRequestConfig;
    expect(config.url).toBe('/backups/b1/download');
    expect(config.responseType).toBe('blob');
  });

  it('surfaces the server error message from a Blob error body', async () => {
    const body = { success: false, error: { code: 'NOT_FOUND', message: 'Backup file not found' } };
    api.defaults.adapter = failWith(
      404,
      'Not Found',
      new Blob([JSON.stringify(body)], { type: 'application/json' }),
    );

    await expect(backupsApi.download(BACKUP)).rejects.toThrow('Backup file not found');
  });

  it('falls back to the status text when the Blob error body is not the JSON envelope', async () => {
    api.defaults.adapter = failWith(502, 'Bad Gateway', new Blob(['<html>upstream down</html>']));

    await expect(backupsApi.download(BACKUP)).rejects.toThrow('Bad Gateway');
  });

  it.each([
    ['an absolute URL on another origin', 'https://elsewhere.example/api/v1/backups/b1/download'],
    ['a protocol-relative URL', '//elsewhere.example/api/v1/backups/b1/download'],
  ])('refuses %s without sending a request', async (_label, downloadUrl) => {
    api.defaults.adapter = adapter as unknown as AxiosAdapter;

    await expect(backupsApi.download({ _id: 'b1', downloadUrl })).rejects.toThrow(/origin/i);
    expect(adapter).not.toHaveBeenCalled();
  });
});
