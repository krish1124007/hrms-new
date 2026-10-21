import { AxiosError } from 'axios';

/**
 * Reading errors from the API's `{ success: false, error: { code, message } }`
 * envelope. One place, so a toast, a table's error state and a page's
 * "no employee profile" notice all say the same thing.
 */

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

function envelope(err: unknown): ErrorEnvelope | undefined {
  if (err instanceof AxiosError) return err.response?.data as ErrorEnvelope | undefined;
  // Duck-typed: tests and older call sites throw `{ response: { status, data } }`.
  const response = (err as { response?: { data?: unknown } } | null)?.response;
  return response?.data as ErrorEnvelope | undefined;
}

/** HTTP status of a failed request, if it got a response. */
export function apiErrorStatus(err: unknown): number | undefined {
  if (err instanceof AxiosError) return err.response?.status;
  return (err as { response?: { status?: number } } | null)?.response?.status;
}

/** The API's machine-readable error code (`NO_EMPLOYEE_PROFILE`, `FORBIDDEN`, …), if any. */
export function apiErrorCode(err: unknown): string | undefined {
  return envelope(err)?.error?.code;
}

/** A user-facing sentence for any error a request can throw. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const body = envelope(err);
  if (body?.error?.message) return body.error.message;
  if (err instanceof AxiosError) {
    if (err.code === 'ERR_NETWORK') return 'Network error — check your connection';
    const status = err.response?.status;
    if (status === 401) return 'Session expired — please sign in again';
    if (status === 403) return "You don't have permission to see this";
    if (status === 404) return 'Not found';
    if (status === 429) return 'Too many requests — please slow down';
    return err.message || fallback;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * The signed-in user has no employee record (e.g. the seeded admin), so a
 * self-service endpoint has nothing to show. `GET /employees/me` answers
 * 404 `NO_EMPLOYEE_PROFILE`; older self-service endpoints say it in words.
 */
export function isNoEmployeeProfileError(err: unknown): boolean {
  if (apiErrorCode(err) === 'NO_EMPLOYEE_PROFILE') return true;
  const status = apiErrorStatus(err);
  if (status !== 403 && status !== 404) return false;
  return /employee profile/i.test(envelope(err)?.error?.message ?? '');
}
