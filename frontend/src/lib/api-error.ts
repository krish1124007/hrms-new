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

/**
 * Plain-English sentences for API error codes whose own message is terse or
 * technical. Any other error shows the server's message as it is.
 */
export const API_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  // Travel allowance — POST /field/travel/claims
  UNKNOWN_VEHICLE: 'That vehicle is no longer in the field settings. Reload the page and pick another vehicle.',
  VEHICLE_RATE_NOT_SET:
    'No rate per km is set for this vehicle yet, so the claim would come to ₹0. Ask HR to set the vehicle rate in Field settings, then claim again.',
  NOTHING_TO_CLAIM: 'Nothing to claim: the kilometres for this day come to ₹0.',
  TA_ALREADY_CLAIMED: 'Travel allowance has already been claimed for this day. Only one travel claim is allowed per day.',
  REASON_REQUIRED:
    'The kilometres differ from the calculated distance by more than 5 %. Add a reason for your approver.',
  NO_FIELD_WORK: 'There is no completed site visit on this day, so there is no travel to claim.',
  // Expense claims
  TRAVEL_CLAIM_LOCKED:
    'A travel allowance claim cannot be edited (only its description can). Withdraw it and claim the day again from Travel allowance.',
  INVALID_VISIT: "The linked visit isn't one of the claimant's own field visits.",
  // Field reports
  RANGE_TOO_LONG: 'A field report can cover at most 92 days. Choose a shorter date range.',
};

/** The plain-English sentence for an API error code, if it has one. */
export function apiErrorCodeMessage(code: string | undefined): string | undefined {
  return code && Object.hasOwn(API_ERROR_MESSAGES, code) ? API_ERROR_MESSAGES[code] : undefined;
}

/** A user-facing sentence for any error a request can throw. */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const body = envelope(err);
  const known = apiErrorCodeMessage(body?.error?.code);
  if (known) return known;
  if (body?.error?.message) return body.error.message;
  if (err instanceof AxiosError) {
    if (err.code === 'ERR_NETWORK') return 'Network error — check your connection';
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return 'The server took too long to answer — check the list before trying again';
    }
    const status = err.response?.status;
    if (status === 413) return 'File is too large for the server to accept';
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
