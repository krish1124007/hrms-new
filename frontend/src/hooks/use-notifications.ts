import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as api from '../lib/notifications.api';

const KEYS = {
  list: (unreadOnly?: boolean) => ['notifications', 'list', unreadOnly ?? false] as const,
  unread: ['notifications', 'unread'] as const,
};

/**
 * List the authenticated user's notifications. The unread count polls
 * every 30s (cheap single-field query).
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
