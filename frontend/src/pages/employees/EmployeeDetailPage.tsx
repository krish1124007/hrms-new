import { useRef, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Edit, FileText, KeyRound, Mail, MapPin, Phone, Trash2, Upload, UserMinus } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  useAddEmployeeDocument,
  useEmployee,
  useRemoveEmployeeDocument,
} from '@/hooks/use-systemcore';
import { documentsApi } from '@/lib/documents.api';
import { authApi } from '@/lib/auth.api';
import { usePermissions } from '@/hooks/use-permissions';
import { toast } from 'sonner';

function Field({ label, value }: { label: string; value?: string | number | null }): ReactElement {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value ?? '—'}</p>
    </div>
  );
}

export default function EmployeeDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useEmployee(id);
  const { has } = usePermissions();
  const [resetOpen, setResetOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const e = data?.data;
  if (!e) {
    return <EmptyState title="Employee not found" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${e.firstName} ${e.lastName}`}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Employees', to: '/employees' },
          { label: e.employeeId },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${e._id}/edit`)}>
              <Edit className="size-4" /> Edit
            </Button>
            {has('users.update') && e.userId && (
              <Button variant="outline" size="sm" onClick={() => setResetOpen(true)}>
                <KeyRound className="size-4" /> Reset password
              </Button>
            )}
            <Button variant="destructive" size="sm">
              <UserMinus className="size-4" /> Deactivate
            </Button>
          </>
        }
      />

      {has('users.update') && e.userId && (
        <ResetPasswordDialog
          open={resetOpen}
          onClose={() => setResetOpen(false)}
          userId={typeof e.userId === 'string' ? e.userId : e.userId._id}
          employeeName={`${e.firstName} ${e.lastName}`}
        />
      )}

      {/* Profile header */}
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-6 sm:flex-row sm:items-start">
          <Avatar name={`${e.firstName} ${e.lastName}`} src={e.profileImage} size="lg" />
          <div className="flex-1 text-center sm:text-left">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
              <h2 className="text-2xl font-bold text-foreground">
                {e.firstName} {e.lastName}
              </h2>
              <Badge variant={e.status === 'active' ? 'success' : 'secondary'}>{e.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {e.designation?.name ?? 'No designation'} · {e.department?.name ?? 'No department'}
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground">{e.employeeId}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground sm:justify-start">
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-4" /> {e.email}
              </span>
              {e.phone && (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="size-4" /> {e.phone}
                </span>
              )}
              {e.workLocation && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-4" /> {e.workLocation}
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="bank">Bank & Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Personal Information</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Date of Birth" value={e.dateOfBirth?.slice(0, 10)} />
                <Field label="Gender" value={e.gender} />
                <Field label="Marital Status" value={e.maritalStatus} />
                <Field label="Blood Group" value={e.bloodGroup} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Emergency Contact</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Name" value={e.emergencyContact?.name} />
                <Field label="Relation" value={e.emergencyContact?.relation} />
                <Field label="Phone" value={e.emergencyContact?.phone} />
              </CardContent>
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Address</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">Current</h4>
                  <p className="text-sm text-muted-foreground">
                    {[
                      e.address?.current?.line1,
                      e.address?.current?.line2,
                      e.address?.current?.city,
                      e.address?.current?.state,
                      e.address?.current?.country,
                      e.address?.current?.zip,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
                <div>
                  <h4 className="mb-3 text-sm font-semibold text-foreground">Permanent</h4>
                  <p className="text-sm text-muted-foreground">
                    {[
                      e.address?.permanent?.line1,
                      e.address?.permanent?.line2,
                      e.address?.permanent?.city,
                      e.address?.permanent?.state,
                      e.address?.permanent?.country,
                      e.address?.permanent?.zip,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="employment">
          <Card>
            <CardHeader>
              <CardTitle>Employment Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 lg:grid-cols-3">
              <Field label="Department" value={e.department?.name} />
              <Field label="Designation" value={e.designation?.name} />
              <Field label="Shift" value={e.shift?.name} />
              <Field label="Employment Type" value={e.employmentType} />
              <Field
                label="Reporting Manager"
                value={
                  e.reportingManager
                    ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}`
                    : undefined
                }
              />
              <Field label="Work Location" value={e.workLocation} />
              <Field
                label="Joining Date"
                value={e.joiningDate ? new Date(e.joiningDate).toLocaleDateString('en-IN') : undefined}
              />
              <Field
                label="Confirmation"
                value={e.confirmationDate ? new Date(e.confirmationDate).toLocaleDateString('en-IN') : undefined}
              />
              <Field label="Notice Period (days)" value={e.noticePeriod} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab employeeId={e._id} documents={e.documents ?? []} />
        </TabsContent>

        <TabsContent value="bank">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Bank Details</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Bank" value={e.bankDetails?.bankName} />
                <Field label="A/C Number" value={e.bankDetails?.accountNumber} />
                <Field label="IFSC" value={e.bankDetails?.ifscCode} />
                <Field label="PAN" value={e.bankDetails?.panNumber} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Salary Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-4">
                <Field label="Basic" value={e.salary?.basic ?? 0} />
                <Field label="HRA" value={e.salary?.hra ?? 0} />
                <Field label="DA" value={e.salary?.da ?? 0} />
                <Field label="Special" value={e.salary?.specialAllowance ?? 0} />
                <Field label="Gross (₹)" value={e.salary?.grossSalary ?? 0} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

    </div>
  );
}

/* ── Documents tab ────────────────────────────────────────────────────
 * Two-step upload:
 *   1. POST /documents/upload   (multipart) → returns { file: { url } }
 *   2. POST /employees/:id/documents { type, name, fileUrl }
 * Both are existing endpoints — no backend changes needed.
 */

const DOC_TYPES = [
  'Offer letter',
  'Appointment letter',
  'ID proof',
  'Address proof',
  'Education certificate',
  'Experience certificate',
  'PAN card',
  'Aadhaar',
  'Bank statement',
  'Resume',
  'Other',
] as const;

interface EmpDocument {
  _id?: string;
  name: string;
  type: string;
  fileUrl: string;
  uploadedAt?: string;
}

function DocumentsTab({
  employeeId,
  documents,
}: {
  employeeId: string;
  documents: EmpDocument[];
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [docType, setDocType] = useState<string>(DOC_TYPES[0]);
  const [docName, setDocName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addDoc = useAddEmployeeDocument();
  const removeDoc = useRemoveEmployeeDocument();

  const reset = (): void => {
    setDocType(DOC_TYPES[0]);
    setDocName('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !docName) setDocName(f.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async (): Promise<void> => {
    if (!file) {
      toast.error('Please choose a file to upload');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await documentsApi.upload(file, {
        folder: `/employees/${employeeId}`,
        category: docType,
      });
      const url = uploaded.data?.file?.url;
      if (!url) throw new Error('Upload succeeded but no file URL returned');
      await addDoc.mutateAsync({
        id: employeeId,
        body: { type: docType, name: docName.trim() || file.name, fileUrl: url },
      });
      setOpen(false);
      reset();
    } catch (err) {
      const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
      toast.error(
        e.response?.data?.error?.message ?? e.message ?? 'Failed to upload document',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Documents</CardTitle>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Upload className="size-4" /> Upload
        </Button>
      </CardHeader>
      <CardContent>
        {documents.length > 0 ? (
          <ul className="space-y-2">
            {documents.map((d, i) => (
              <li
                key={d._id ?? `${d.fileUrl}-${i}`}
                className="flex items-center justify-between rounded-md border border-border p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="shrink-0 rounded-md bg-muted p-2 text-muted-foreground">
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.type}
                      {d.uploadedAt ? ` · ${new Date(d.uploadedAt).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                </div>
                <div className="ml-3 flex items-center gap-1">
                  <a
                    href={d.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md px-2.5 py-1.5 text-sm font-medium text-primary hover:underline"
                  >
                    Open
                  </a>
                  {d._id && (
                    <button
                      onClick={() =>
                        removeDoc.mutate({ id: employeeId, docId: d._id as string })
                      }
                      disabled={removeDoc.isPending}
                      className="rounded-md p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-40"
                      title="Remove document"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={FileText}
            title="No documents uploaded"
            description='Click "Upload" to add offer letters, ID proofs, certificates and more'
          />
        )}
      </CardContent>

      <Dialog open={open} onClose={() => !uploading && setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Upload document</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="doc-type">Type *</Label>
            <Select id="doc-type" value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="doc-name">Display name *</Label>
            <Input
              id="doc-name"
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Aadhaar Card"
            />
          </div>
          <div>
            <Label htmlFor="doc-file">File *</Label>
            <input
              ref={fileInputRef}
              id="doc-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
            />
            {file && (
              <p className="mt-1 text-xs text-muted-foreground">
                {file.name} · {(file.size / 1024).toFixed(1)} KB
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, image (JPG/PNG/WebP), Word, or Excel — max 25 MB.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              reset();
            }}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button onClick={submit} loading={uploading} disabled={!file}>
            Upload
          </Button>
        </DialogFooter>
      </Dialog>
    </Card>
  );
}

interface ResetPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  employeeName: string;
}

function ResetPasswordDialog({
  open,
  onClose,
  userId,
  employeeName,
}: ResetPasswordDialogProps): ReactElement {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const reset = useMutation({
    mutationFn: () => authApi.adminSetUserPassword(userId, password),
    onSuccess: () => {
      toast.success(`Password for ${employeeName} updated. Their existing sessions are revoked.`);
      setPassword('');
      setConfirm('');
      onClose();
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) =>
      toast.error(err.response?.data?.error?.message ?? 'Failed to reset password'),
  });

  const submit = (): void => {
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match");
      return;
    }
    reset.mutate();
  };

  return (
    <Dialog open={open} onClose={() => !reset.isPending && onClose()} size="sm">
      <DialogHeader>
        <DialogTitle>Reset password — {employeeName}</DialogTitle>
      </DialogHeader>
      <DialogBody className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Set a new password for this user. They'll be signed out everywhere and will need to
          log in with the new password.
        </p>
        <div>
          <Label htmlFor="reset-password">New password *</Label>
          <div className="relative">
            <Input
              id="reset-password"
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              {show ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <div>
          <Label htmlFor="reset-confirm">Confirm password *</Label>
          <Input
            id="reset-confirm"
            type={show ? 'text' : 'password'}
            value={confirm}
            onChange={(ev) => setConfirm(ev.target.value)}
            autoComplete="new-password"
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={reset.isPending}>
          Cancel
        </Button>
        <Button onClick={submit} loading={reset.isPending}>
          <KeyRound className="size-4" /> Update password
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
