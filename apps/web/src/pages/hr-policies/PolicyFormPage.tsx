import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, FileText, Loader2, Paperclip, Star, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  useCreatePolicy,
  usePolicy,
  useUpdatePolicy,
  useUploadPolicyAttachment,
} from '@/hooks/use-hr-policies';
import { POLICY_CATEGORIES, type PolicyInput } from '@/lib/hr-policies.api';

const schema = z.object({
  policyCode: z.string().max(64).optional(),
  title: z.string().min(1, 'Title is required').max(200),
  category: z.enum([
    'general',
    'code_of_conduct',
    'leave',
    'attendance',
    'compensation',
    'benefits',
    'safety',
    'security',
    'data_privacy',
    'remote_work',
    'travel',
    'expenses',
    'harassment',
    'grievance',
    'it',
    'other',
  ]),
  summary: z.string().max(1000).optional(),
  content: z.string().min(1, 'Content is required'),
  effectiveDate: z.string().optional(),
  reviewDueDate: z.string().optional(),
  mandatory: z.boolean(),
  tagsInput: z.string().optional(),
  changeNotes: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export default function PolicyFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data: existing, isLoading: loadingPolicy } = usePolicy(id);
  const create = useCreatePolicy();
  const update = useUpdatePolicy();
  const uploadAttachment = useUploadPolicyAttachment();
  const [wasPublished, setWasPublished] = useState(false);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const onPickAttachment = (): void => attachmentInputRef.current?.click();
  const onAttachmentSelected = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.type !== 'application/pdf' && !/\.pdf$/i.test(f.name)) {
      toast.error('Only PDF files are allowed');
      e.target.value = '';
      return;
    }
    setAttachmentFile(f);
  };
  const clearAttachment = (): void => {
    setAttachmentFile(null);
    if (attachmentInputRef.current) attachmentInputRef.current.value = '';
  };

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      category: 'general',
      content: '',
      mandatory: false,
    },
  });

  useEffect(() => {
    if (isEdit && existing?.data) {
      const p = existing.data;
      setWasPublished(p.status === 'published');
      reset({
        policyCode: p.policyCode,
        title: p.title,
        category: p.category,
        summary: p.summary ?? '',
        content: p.content ?? '',
        effectiveDate: p.effectiveDate ? p.effectiveDate.slice(0, 10) : '',
        reviewDueDate: p.reviewDueDate ? p.reviewDueDate.slice(0, 10) : '',
        mandatory: p.mandatory,
        tagsInput: (p.tags ?? []).join(', '),
        changeNotes: '',
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = async (values: FormValues): Promise<void> => {
    const payload: PolicyInput = {
      policyCode: values.policyCode?.trim() || undefined,
      title: values.title,
      category: values.category,
      summary: values.summary || undefined,
      content: values.content,
      effectiveDate: values.effectiveDate || undefined,
      reviewDueDate: values.reviewDueDate || undefined,
      mandatory: values.mandatory,
      tags: values.tagsInput
        ? values.tagsInput
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      changeNotes: values.changeNotes || undefined,
    };

    try {
      const policyId = isEdit && id
        ? (await update.mutateAsync({ id, input: payload })).data._id
        : (await create.mutateAsync(payload)).data._id;

      // Chained PDF upload — happens only if the user picked a file. The
      // separate API call keeps the policy create/update endpoint pure JSON
      // and reuses the same attachment route the detail page uses.
      if (attachmentFile) {
        await uploadAttachment.mutateAsync({ id: policyId, file: attachmentFile });
      }

      navigate(`/hr-policies/${policyId}`);
    } catch {
      // mutateAsync surfaces toasts via the hooks' onError handlers — no extra noise here
    }
  };

  if (isEdit && loadingPolicy) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit policy' : 'New policy'}
        description={
          isEdit ? 'Update policy details and content' : 'Draft a new HR policy'
        }
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'HR Policies', to: '/hr-policies' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/hr-policies')}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      {wasPublished && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          This policy is currently <strong>published</strong>. Editing the content will fork
          a new draft version (v{(existing?.data.currentVersion ?? 0) + 1}). The published
          version stays live until you publish the new draft.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Metadata</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="p-title">Title *</Label>
              <Input
                id="p-title"
                placeholder="e.g., Code of Conduct"
                {...register('title')}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="p-code">Policy code</Label>
              <Input
                id="p-code"
                placeholder="Auto-generated if blank"
                {...register('policyCode')}
              />
            </div>
            <div>
              <Label htmlFor="p-cat">Category *</Label>
              <Select id="p-cat" {...register('category')}>
                {POLICY_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="p-summary">Summary</Label>
              <Textarea
                id="p-summary"
                rows={2}
                placeholder="One- or two-line description shown in the policy list"
                {...register('summary')}
              />
            </div>
            <div>
              <Label htmlFor="p-eff">Effective date</Label>
              <Input id="p-eff" type="date" {...register('effectiveDate')} />
            </div>
            <div>
              <Label htmlFor="p-review">Review due date</Label>
              <Input id="p-review" type="date" {...register('reviewDueDate')} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="p-tags">Tags</Label>
              <Input
                id="p-tags"
                placeholder="comma, separated, tags"
                {...register('tagsInput')}
              />
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" {...register('mandatory')} />
              <Star className="size-4 text-warning" />
              Mandatory — every employee must acknowledge this policy
            </label>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Content</h2>
          <Label htmlFor="p-content">Body *</Label>
          <Textarea
            id="p-content"
            rows={18}
            placeholder="Write the policy content here. Markdown is supported."
            className="font-mono text-sm"
            {...register('content')}
          />
          {errors.content && (
            <p className="mt-1 text-xs text-destructive">{errors.content.message}</p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Markdown formatting supported. Headings, bullet points, links, and emphasis will
            render properly on the detail view.
          </p>
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 text-base font-semibold">
            <Paperclip className="size-4 text-muted-foreground" /> Attachment (optional)
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Upload a PDF (e.g. signed policy document) — employees will be able to download
            it from the policy page. You can also add or remove attachments later.
          </p>
          <input
            ref={attachmentInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={onAttachmentSelected}
          />
          {attachmentFile ? (
            <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-red-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={attachmentFile.name}>
                    {attachmentFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(attachmentFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={clearAttachment}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Remove"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={onPickAttachment}>
              <Upload className="size-4" /> Choose PDF
            </Button>
          )}
        </Card>

        {wasPublished && (
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold">Change notes</h2>
            <Label htmlFor="p-cn">What changed in this version?</Label>
            <Textarea
              id="p-cn"
              rows={3}
              placeholder="Summarise the changes — shown in the version history"
              {...register('changeNotes')}
            />
          </Card>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/hr-policies')}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={create.isPending || update.isPending || uploadAttachment.isPending}
          >
            {isEdit ? 'Save changes' : 'Create policy'}
          </Button>
        </div>
      </form>
    </div>
  );
}
