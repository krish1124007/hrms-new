import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { locationsApi, type LocationInput } from '@/lib/locations.api';


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
  });
}
