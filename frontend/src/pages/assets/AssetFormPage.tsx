import { useEffect, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useAsset, useCreateAsset, useUpdateAsset } from '@/hooks/use-assets';
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  type AssetInput,
} from '@/lib/assets.api';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  assetCode: z.string().max(64).optional(),
  category: z.enum([
    'laptop',
    'desktop',
    'mobile',
    'tablet',
    'monitor',
    'peripheral',
    'furniture',
    'vehicle',
    'tool',
    'other',
  ]),
  status: z.enum(['available', 'assigned', 'maintenance', 'retired', 'lost']),
  condition: z.enum(['new', 'good', 'fair', 'poor', 'damaged']),
  serialNumber: z.string().optional(),
  manufacturer: z.string().optional(),
  modelNumber: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.coerce.number().min(0).optional().or(z.nan().transform(() => undefined)),
  currentValue: z.coerce.number().min(0).optional().or(z.nan().transform(() => undefined)),
  warrantyExpiresAt: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export default function AssetFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data: existing, isLoading: loadingAsset } = useAsset(id);
  const create = useCreateAsset();
  const update = useUpdateAsset();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      category: 'laptop',
      status: 'available',
      condition: 'good',
    },
  });

  useEffect(() => {
    if (isEdit && existing?.data) {
      const a = existing.data;
      reset({
        name: a.name,
        assetCode: a.assetCode,
        category: a.category,
        status: a.status,
        condition: a.condition,
        serialNumber: a.serialNumber ?? '',
        manufacturer: a.manufacturer ?? '',
        modelNumber: a.modelNumber ?? '',
        purchaseDate: a.purchaseDate ? a.purchaseDate.slice(0, 10) : '',
        purchasePrice: a.purchasePrice,
        currentValue: a.currentValue,
        warrantyExpiresAt: a.warrantyExpiresAt ? a.warrantyExpiresAt.slice(0, 10) : '',
        location: a.location ?? '',
        notes: a.notes ?? '',
        imageUrl: a.imageUrl ?? '',
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = (values: FormValues): void => {
    const payload: AssetInput = {
      ...values,
      assetCode: values.assetCode?.trim() || undefined,
      purchaseDate: values.purchaseDate || undefined,
      warrantyExpiresAt: values.warrantyExpiresAt || undefined,
      imageUrl: values.imageUrl || undefined,
      serialNumber: values.serialNumber || undefined,
      manufacturer: values.manufacturer || undefined,
      modelNumber: values.modelNumber || undefined,
      location: values.location || undefined,
      notes: values.notes || undefined,
    };

    if (isEdit && id) {
      update.mutate(
        { id, input: payload },
        { onSuccess: () => navigate(`/assets/${id}`) },
      );
    } else {
      create.mutate(payload, {
        onSuccess: (res) => navigate(`/assets/${res.data._id}`),
      });
    }
  };

  if (isEdit && loadingAsset) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit asset' : 'New asset'}
        description={isEdit ? 'Update asset information' : 'Add a new asset to the catalog'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Assets', to: '/assets' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/assets')}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Basic information</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="a-name">Asset name *</Label>
              <Input id="a-name" placeholder="e.g., Dell Latitude 7440" {...register('name')} />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="a-code">Asset code</Label>
              <Input
                id="a-code"
                placeholder="Auto-generated if empty"
                {...register('assetCode')}
              />
            </div>
            <div>
              <Label htmlFor="a-category">Category *</Label>
              <Select id="a-category" {...register('category')}>
                {ASSET_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="a-status">Status *</Label>
              <Select id="a-status" {...register('status')}>
                {ASSET_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="a-condition">Condition *</Label>
              <Select id="a-condition" {...register('condition')}>
                {ASSET_CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Hardware details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="a-serial">Serial number</Label>
              <Input id="a-serial" {...register('serialNumber')} />
            </div>
            <div>
              <Label htmlFor="a-mfr">Manufacturer</Label>
              <Input id="a-mfr" placeholder="e.g., Dell, Apple, Samsung" {...register('manufacturer')} />
            </div>
            <div>
              <Label htmlFor="a-model">Model</Label>
              <Input id="a-model" {...register('modelNumber')} />
            </div>
            <div>
              <Label htmlFor="a-loc">Location</Label>
              <Input id="a-loc" placeholder="e.g., HQ Floor 3" {...register('location')} />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Purchase &amp; warranty</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="a-pdate">Purchase date</Label>
              <Input id="a-pdate" type="date" {...register('purchaseDate')} />
            </div>
            <div>
              <Label htmlFor="a-warr">Warranty expires</Label>
              <Input id="a-warr" type="date" {...register('warrantyExpiresAt')} />
            </div>
            <div>
              <Label htmlFor="a-price">Purchase price (₹)</Label>
              <Input
                id="a-price"
                type="number"
                step="0.01"
                {...register('purchasePrice')}
              />
            </div>
            <div>
              <Label htmlFor="a-cval">Current value (₹)</Label>
              <Input
                id="a-cval"
                type="number"
                step="0.01"
                {...register('currentValue')}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Additional</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="a-img">Image URL</Label>
              <Input id="a-img" type="url" placeholder="https://..." {...register('imageUrl')} />
              {errors.imageUrl && (
                <p className="mt-1 text-xs text-destructive">{errors.imageUrl.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="a-notes">Notes</Label>
              <Textarea id="a-notes" rows={3} {...register('notes')} />
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/assets')}>
            Cancel
          </Button>
          <Button type="submit" loading={create.isPending || update.isPending}>
            {isEdit ? 'Save changes' : 'Create asset'}
          </Button>
        </div>
      </form>
    </div>
  );
}
