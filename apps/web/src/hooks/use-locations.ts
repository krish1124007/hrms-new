import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { locationsApi, type LocationInput } from '@/lib/locations.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

export function useLocations(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['locations', params],
    queryFn: () => locationsApi.list(params),
  });
}

export function useCreateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LocationInput) => locationsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location added');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to add location')),
  });
}

export function useUpdateLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LocationInput> }) =>
      locationsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update location')),
  });
}

export function useDeleteLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => locationsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['locations'] });
      toast.success('Location deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete location')),
  });
}
