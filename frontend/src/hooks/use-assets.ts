import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  assetsApi,
  type AssetCondition,
  type AssetInput,
} from '@/lib/assets.api';


export function useAssets(params?: Record<string, unknown>) {
  return useQuery({ queryKey: ['assets', params], queryFn: () => assetsApi.list(params) });
}

export function useAsset(id: string | undefined) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => assetsApi.get(id as string),
    enabled: !!id,
  });
}

export function useAssetStats() {
  return useQuery({ queryKey: ['assets', 'stats'], queryFn: () => assetsApi.stats() });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssetInput) => assetsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset created');
    },
  });
}

export function useUpdateAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<AssetInput> }) =>
      assetsApi.update(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['assets', v.id] });
      toast.success('Asset updated');
    },
  });
}

export function useDeleteAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => assetsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success('Asset deleted');
    },
  });
}

export function useAssignAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, employee, notes }: { id: string; employee: string; notes?: string }) =>
      assetsApi.assign(id, { employee, notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['assets', v.id] });
      toast.success('Asset assigned');
    },
  });
}

export function useUnassignAsset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes, condition }: { id: string; notes?: string; condition?: AssetCondition }) =>
      assetsApi.unassign(id, { notes, condition }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['assets', v.id] });
      toast.success('Asset unassigned');
    },
  });
}

export function useImportAssets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileOrRows: File | Array<Record<string, unknown>>) =>
      assetsApi.importAssets(fileOrRows),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['assets'] });
      toast.success(res.message || 'Assets imported successfully');
    },
  });
}
