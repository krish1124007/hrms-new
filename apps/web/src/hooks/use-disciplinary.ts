import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { disciplinaryApi, type DisciplinaryInput } from '@/lib/disciplinary.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

export function useDisciplinaryList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['disciplinary', params],
    queryFn: () => disciplinaryApi.list(params),
  });
}

export function useMyDisciplinary() {
  return useQuery({
    queryKey: ['disciplinary', 'me'],
    queryFn: () => disciplinaryApi.myList(),
  });
}

export function useDisciplinary(id: string | undefined) {
  return useQuery({
    queryKey: ['disciplinary', id],
    queryFn: () => disciplinaryApi.get(id as string),
    enabled: !!id,
  });
}

export function useDisciplinaryStats() {
  return useQuery({
    queryKey: ['disciplinary', 'stats'],
    queryFn: () => disciplinaryApi.stats(),
  });
}

export function useCreateDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DisciplinaryInput) => disciplinaryApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      toast.success('Case created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create case')),
  });
}

export function useUpdateDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<DisciplinaryInput> }) =>
      disciplinaryApi.update(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Case updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update case')),
  });
}

export function useDeleteDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => disciplinaryApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      toast.success('Case deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete case')),
  });
}

export function useAcknowledgeDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      disciplinaryApi.acknowledge(id, { notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Acknowledgement recorded');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to acknowledge')),
  });
}

export function useResolveDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      outcome,
      notes,
    }: {
      id: string;
      outcome: 'resolved' | 'failed';
      notes: string;
    }) => disciplinaryApi.resolve(id, { outcome, notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Case closed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to resolve')),
  });
}

export function useEscalateDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, escalatedTo, reason }: { id: string; escalatedTo: string; reason: string }) =>
      disciplinaryApi.escalate(id, { escalatedTo, reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Case escalated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to escalate')),
  });
}

export function useCancelDisciplinary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      disciplinaryApi.cancel(id, { reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary'] });
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Case cancelled');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to cancel')),
  });
}

export function useAddDisciplinaryComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) =>
      disciplinaryApi.addComment(id, { text }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['disciplinary', v.id] });
      toast.success('Comment added');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to add comment')),
  });
}
