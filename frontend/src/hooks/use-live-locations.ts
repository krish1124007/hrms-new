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
 * Fold a fresh poll into what is shown. The poll decides who is listed (it
 * drops reps silent for 2 h) and carries the details (on a visit, battery),
 * but a rep the socket has meanwhile moved keeps the newer position — a poll
 * that was in flight must not jump a marker back. A rep the socket added
 * after the poll started stays too.
 */
export function mergePolledLocations(
  shown: LiveLocation[],
  polled: LiveLocation[],
  pollStartedAt: number,
): LiveLocation[] {
  const byId = new Map(shown.map((r) => [r.employeeId, r]));
  const at = (r: LiveLocation): number => new Date(r.recordedAt).getTime();
  const merged = polled.map((p) => {
    const s = byId.get(p.employeeId);
    if (!s || at(s) <= at(p)) return p;
    return { ...p, lat: s.lat, lng: s.lng, accuracy: s.accuracy, recordedAt: s.recordedAt };
  });
  const listed = new Set(polled.map((p) => p.employeeId));
  const addedSince = shown.filter((s) => !listed.has(s.employeeId) && at(s) >= pollStartedAt);
  if (addedSince.length === 0) return merged;
  return [...merged, ...addedSince].sort((a, b) => a.name.localeCompare(b.name));
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
    queryFn: async (): Promise<LiveResponse> => {
      const startedAt = Date.now();
      const res = await fieldApi.liveTracking();
      const shown = qc.getQueryData<LiveResponse>(LIVE_QUERY_KEY)?.data ?? [];
      return { ...res, data: mergePolledLocations(shown, res.data ?? [], startedAt) };
    },
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
