import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fieldApi, type LiveLocation, type LocationUpdate } from '@/lib/field.api';
import { connectFieldTracking, type FieldSocketStatus } from '@/lib/field-socket';

/** Polling cadence while the socket is down (the fallback). */
export const LIVE_POLL_MS = 30_000;
/**
 * Re-read cadence while the socket is up: the socket only adds and moves
 * reps; the poll drops reps silent for 2 h and refreshes "on a visit".
 */
export const LIVE_REFRESH_MS = 5 * 60_000;

export const LIVE_QUERY_KEY = ['field-live'] as const;

type LiveResponse = Awaited<ReturnType<typeof fieldApi.liveTracking>>;

/** Fold one socket update into the polled list (newer points win). */
export function mergeLocationUpdate(rows: LiveLocation[], u: LocationUpdate): LiveLocation[] {
  const i = rows.findIndex((r) => r.employeeId === u.employeeId);
  if (i === -1) {
    const added: LiveLocation = {
      employeeId: u.employeeId,
      name: u.name,
      avatar: u.avatar ?? null,
      lat: u.lat,
      lng: u.lng,
      accuracy: u.accuracy ?? null,
      recordedAt: u.recordedAt,
      onVisit: null,
    };
    return [...rows, added].sort((a, b) => a.name.localeCompare(b.name));
  }
  const old = rows[i];
  if (new Date(u.recordedAt).getTime() < new Date(old.recordedAt).getTime()) return rows;
  const next = rows.slice();
  next[i] = {
    ...old,
    name: u.name || old.name,
    avatar: u.avatar ?? old.avatar,
    lat: u.lat,
    lng: u.lng,
    accuracy: u.accuracy ?? null,
    recordedAt: u.recordedAt,
  };
  return next;
}

/**
 * Every visible rep's latest position: `GET /field/tracking/live`, kept
 * current by the `/field-tracking` socket, with a 30-second poll whenever the
 * socket is not connected.
 */
export function useLiveLocations() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<FieldSocketStatus>('connecting');
  const [reason, setReason] = useState<string | undefined>();

  useEffect(
    () =>
      connectFieldTracking({
        onStatus: (s, why) => {
          setStatus(s);
          setReason(why);
        },
        onUpdate: (u) => {
          qc.setQueryData<LiveResponse>(LIVE_QUERY_KEY, (old) => ({
            success: true,
            data: mergeLocationUpdate(old?.data ?? [], u),
          }));
        },
      }),
    [qc],
  );

  const query = useQuery({
    queryKey: LIVE_QUERY_KEY,
    queryFn: () => fieldApi.liveTracking(),
    refetchInterval: status === 'live' ? LIVE_REFRESH_MS : LIVE_POLL_MS,
    refetchIntervalInBackground: false,
  });

  return {
    ...query,
    reps: query.data?.data ?? [],
    /** `live` = socket connected; `polling` = fallback; `connecting` = first attempt. */
    status,
    reason,
  };
}
