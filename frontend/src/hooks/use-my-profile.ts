import { useQuery } from '@tanstack/react-query';
import { selfApi } from '@/lib/self.api';
import { isNoEmployeeProfileError } from '@/lib/api-error';

/**
 * The signed-in user's employee record (`GET /employees/me`).
 *
 * `noProfile` is true only when the API says the user has no employee record
 * (404 `NO_EMPLOYEE_PROFILE`) — any other failure leaves it false, so a page
 * falls back to rendering normally rather than hiding behind a wrong notice.
 */
export function useMyEmployeeProfile(opts: { enabled?: boolean } = {}) {
  const query = useQuery({
    queryKey: ['employees', 'me'],
    queryFn: () => selfApi.profile(),
    enabled: opts.enabled ?? true,
    staleTime: 5 * 60_000,
    retry: false,
    // The page renders the outcome; no toast.
    meta: { silent: true },
  });
  return {
    ...query,
    profile: query.data?.data,
    noProfile: isNoEmployeeProfileError(query.error),
  };
}
