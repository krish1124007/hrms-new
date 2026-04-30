import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import * as api from '../lib/notifications.api';

const KEYS = {
  list: (unreadOnly?: boolean) => ['notifications', 'list', unreadOnly ?? false] as const,
  unread: ['notifications', 'unread'] as const,
};

/**
 * List the authenticated user's notifications. Auto-refreshes the unread
 * count every 30s (cheap single-field query). Real-time push via
 * Socket.io is expected to invalidate this cache directly — see
 * `useSocketNotifications`.
 */
export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: KEYS.list(unreadOnly),
    queryFn: () => api.listNotifications({ unreadOnly }),
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: KEYS.unread,
    queryFn: api.getUnreadCount,
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.markAllRead,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

/**
 * Bind to the chat-namespace socket to receive `notification:new` pushes
 * and invalidate the React-Query cache on arrival.
 *
 *   const socket = useSocket();  // your existing socket provider
 *   useSocketNotifications(socket);
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSocketNotifications(socket: any): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!socket) return undefined;
    const onNew = (): void => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
    };
    socket.on('notification:new', onNew);
    return () => {
      socket.off('notification:new', onNew);
    };
  }, [socket, qc]);
}
