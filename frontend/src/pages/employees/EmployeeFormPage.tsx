import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, ArrowRight, Check, Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  useDepartments,
  useDesignations,
  useShifts,
  useEmployee,
  useCreateEmployee,
  useUpdateEmployee,
} from '@/hooks/use-systemcore';
import { useSalaryStructures } from '@/hooks/use-payroll';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveEmployees } from '@/hooks/use-employee-picker';
import { cn } from '@/lib/utils';
import { toISTDateKey } from '@/lib/format';
import { toast } from 'sonner';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email('Enter a valid e-mail address'),
  phone: z.string().optional(),
  // Optional on edit; on create, if filled it must be ≥8 chars. We can't
  // express "required only on create" cleanly here — handled at submit time.
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, { message: 'Password must be at least 8 characters' }),
  dateOfBirth: z.string().optional(),
  gender: z.union([z.enum(['male', 'female', 'other']), z.literal('')]).optional().transform(v => v === '' ? undefined : (v as 'male' | 'female' | 'other' | undefined)),
  maritalStatus: z.union([z.enum(['single', 'married', 'divorced', 'widowed']), z.literal('')]).optional().transform(v => v === '' ? undefined : (v as 'single' | 'married' | 'divorced' | 'widowed' | undefined)),
  bloodGroup: z.string().optional(),

  department: z.string().optional(),
  designation: z.string().optional(),
  shift: z.string().optional(),
  requireLocation: z.boolean().optional(),
  isFieldStaff: z.boolean().optional(),
  reportingManager: z.string().optional(),
  joiningDate: z.string().min(1, 'Required'),
  confirmationDate: z.string().optional(),
  probationEndDate: z.string().optional(),
  noticePeriod: z.coerce.number().min(0).optional(),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'intern']),
  workLocation: z.string().optional(),

  ecName: z.string().optional(),
  ecRelation: z.string().optional(),
  ecPhone: z.string().optional(),

  currentLine1: z.string().optional(),
  currentLine2: z.string().optional(),
  currentCity: z.string().optional(),
  currentState: z.string().optional(),
  currentCountry: z.string().optional(),
  currentZip: z.string().optional(),

  permanentLine1: z.string().optional(),
  permanentLine2: z.string().optional(),
  permanentCity: z.string().optional(),
  permanentState: z.string().optional(),
  permanentCountry: z.string().optional(),
  permanentZip: z.string().optional(),

  basic: z.coerce.number().min(0).default(0),
  hra: z.coerce.number().min(0).default(0),
  da: z.coerce.number().min(0).default(0),
  specialAllowance: z.coerce.number().min(0).default(0),
  tdsMonthly: z.coerce.number().min(0, 'Cannot be negative').default(0),
  /** '' = no structure (the salary breakdown above is used as-is). */
  salaryStructureId: z.string().optional(),

  bankName: z.string().optional(),
  accountNumber: z.string().optional(),
  ifscCode: z.string().optional(),
  panNumber: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const STEPS = [
  { id: 1, label: 'Personal' },
  { id: 2, label: 'Employment' },
  { id: 3, label: 'Salary & Bank' },
];

/**
 * The unsaved "Add employee" form survives a reload of the tab — but only in
 * this tab (`sessionStorage`), and never the secrets: no password, bank
 * details, PAN or salary figures are ever written to browser storage.
 */
const DRAFT_KEY = 'opencore.employee.draft';
/** Never persisted in a draft. */
const SENSITIVE_DRAFT_FIELDS = [
  'password',
  'bankName',
  'accountNumber',
  'ifscCode',
  'panNumber',
  'basic',
  'hra',
  'da',
  'specialAllowance',
  'tdsMonthly',
  'salaryStructureId',
] as const;

function draftOf(values: Record<string, unknown>): Record<string, unknown> {
  const draft = { ...values };
  for (const field of SENSITIVE_DRAFT_FIELDS) delete draft[field];
  return draft;
}

function readDraft(): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? draftOf(JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function clearDraft(): void {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
    // Older builds kept the whole form — passwords and bank details included —
    // in localStorage; make sure that copy is gone.
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** A day label (`2026-10-15T00:00:00Z` or IST midnight) as an `<input type="date">` value. */
function dateInput(d: string | undefined | null): string | undefined {
  return d ? toISTDateKey(d) : undefined;
}

const FORM_DEFAULTS: Partial<FormValues> = {
  employmentType: 'full-time',
  basic: 0,
  hra: 0,
  da: 0,
  specialAllowance: 0,
  tdsMonthly: 0,
  isFieldStaff: false,
  salaryStructureId: '',
};

function FieldError({ message }: { message?: string }): ReactElement | null {
  return message ? <p className="mt-1 text-xs text-destructive">{message}</p> : null;
}

/** A reference as an id, whether the API sent the id or the populated document. */
function refId(ref: string | { _id: string } | null | undefined): string {
  if (!ref) return '';
  return typeof ref === 'string' ? ref : ref._id;
}

export default function EmployeeFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const { data: existing } = useEmployee(id);
  const { data: deptData } = useDepartments({ limit: 100 });
  const { data: shiftData } = useShifts({ limit: 100 });
  // A manager is somebody who still works here — plus, on edit, the current
  // manager even if they have left, so an unrelated edit never clears them.
  const { data: currentEmployees = [] } = useActiveEmployees();
  const currentManager = existing?.data?.reportingManager;
  const managerOptions = [
    ...currentEmployees.filter((e) => e._id !== id),
    ...(currentManager && !currentEmployees.some((e) => e._id === currentManager._id)
      ? [{ ...currentManager, former: true }]
      : []),
  ];
  // Listing structures needs payroll.process; without it the field is not shown (or sent).
  const { has } = usePermissions();
  const canPickStructure = has('payroll.process');
  const { data: structuresData } = useSalaryStructures({ enabled: canPickStructure });
  const currentStructureId = refId(existing?.data?.salaryStructureId);
  // Inactive structures are not offered — except the one already assigned, so
  // an unrelated edit never silently clears it.
  const structures = (structuresData?.data ?? []).filter(
    (st) => st.isActive || st._id === currentStructureId,
  );

  const {
    register,
    handleSubmit,
    watch,
    reset,
    trigger,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: FORM_DEFAULTS,
  });

  const department = watch('department');
  const { data: desigData } = useDesignations({ department: department || undefined, limit: 100 });

  const create = useCreateEmployee();
  const update = useUpdateEmployee();

  // Hydrate when editing
  useEffect(() => {
    if (existing?.data) {
      const e = existing.data;
      reset({
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        phone: e.phone,
        dateOfBirth: dateInput(e.dateOfBirth),
        gender: e.gender,
        maritalStatus: e.maritalStatus,
        bloodGroup: e.bloodGroup,
        department: e.department?._id,
        designation: e.designation?._id,
        shift: e.shift?._id,
        requireLocation: e.requireLocation ?? false,
        isFieldStaff: e.isFieldStaff ?? false,
        reportingManager: e.reportingManager?._id,
        joiningDate: dateInput(e.joiningDate),
        confirmationDate: dateInput(e.confirmationDate),
        probationEndDate: dateInput(e.probationEndDate),
        noticePeriod: e.noticePeriod,
        employmentType: e.employmentType,
        workLocation: e.workLocation,
        ecName: e.emergencyContact?.name,
        ecRelation: e.emergencyContact?.relation,
        ecPhone: e.emergencyContact?.phone,
        currentLine1: e.address?.current?.line1,
        currentLine2: e.address?.current?.line2,
        currentCity: e.address?.current?.city,
        currentState: e.address?.current?.state,
        currentCountry: e.address?.current?.country,
        currentZip: e.address?.current?.zip,
        permanentLine1: e.address?.permanent?.line1,
        permanentLine2: e.address?.permanent?.line2,
        permanentCity: e.address?.permanent?.city,
        permanentState: e.address?.permanent?.state,
        permanentCountry: e.address?.permanent?.country,
        permanentZip: e.address?.permanent?.zip,
        basic: e.salary?.basic ?? 0,
        hra: e.salary?.hra ?? 0,
        da: e.salary?.da ?? 0,
        specialAllowance: e.salary?.specialAllowance ?? 0,
        tdsMonthly: e.salary?.tdsMonthly ?? 0,
        salaryStructureId: refId(e.salaryStructureId),
        bankName: e.bankDetails?.bankName,
        accountNumber: e.bankDetails?.accountNumber,
        ifscCode: e.bankDetails?.ifscCode,
        panNumber: e.bankDetails?.panNumber,
      });
    }
  }, [existing, reset]);

  // The structure list can arrive after the form was filled: show the assigned one once it does.
  useEffect(() => {
    if (structuresData && currentStructureId) setValue('salaryStructureId', currentStructureId);
  }, [structuresData, currentStructureId, setValue]);

  // Auto-save draft (create only) — without the sensitive fields.
  const submitted = useRef(false);
  useEffect(() => {
    if (isEdit) return;
    const sub = watch((vals) => {
      if (submitted.current) return;
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draftOf(vals as Record<string, unknown>)));
      } catch {
        /* storage unavailable or full — the draft is a convenience */
      }
    });
    return () => sub.unsubscribe();
  }, [watch, isEdit]);

  // Restore draft (create only)
  const [draftRestored, setDraftRestored] = useState(false);
  useEffect(() => {
    if (isEdit) return;
    // Drop any full-form draft an older build left in localStorage.
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* storage unavailable */
    }
    const draft = readDraft();
    if (draft) {
      reset({ ...FORM_DEFAULTS, ...(draft as Partial<FormValues>) });
      setDraftRestored(true);
    }
  }, [isEdit, reset]);

  const discardDraft = (): void => {
    clearDraft();
    reset();
    setDraftRestored(false);
    setStep(1);
  };

  const totals = (() => {
    const v = watch();
    return (
      Number(v.basic ?? 0) +
      Number(v.hra ?? 0) +
      Number(v.da ?? 0) +
      Number(v.specialAllowance ?? 0)
    );
  })();

  const onSubmit = (values: FormValues): void => {
    // Safety check: ensure we only submit the form to the API if the user
    // is actually on the final step. This prevents accidental submissions
    // if the "Next" button transition is too fast or triggered by "Enter".
    if (step < STEPS.length) {
      void next();
      return;
    }

    const payload = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      phone: values.phone,
      dateOfBirth: values.dateOfBirth || undefined,
      gender: values.gender,
      maritalStatus: values.maritalStatus,
      bloodGroup: values.bloodGroup,
      department: values.department || undefined,
      designation: values.designation || undefined,
      shift: values.shift || undefined,
      requireLocation: values.requireLocation ?? false,
      isFieldStaff: values.isFieldStaff ?? false,
      reportingManager: values.reportingManager || undefined,
      joiningDate: values.joiningDate,
      confirmationDate: values.confirmationDate || undefined,
      probationEndDate: values.probationEndDate || undefined,
      noticePeriod: values.noticePeriod,
      employmentType: values.employmentType,
      workLocation: values.workLocation,
      emergencyContact: {
        name: values.ecName,
        relation: values.ecRelation,
        phone: values.ecPhone,
      },
      address: {
        current: {
          line1: values.currentLine1,
          line2: values.currentLine2,
          city: values.currentCity,
          state: values.currentState,
          country: values.currentCountry,
          zip: values.currentZip,
        },
        permanent: {
          line1: values.permanentLine1,
          line2: values.permanentLine2,
          city: values.permanentCity,
          state: values.permanentState,
          country: values.permanentCountry,
          zip: values.permanentZip,
        }
      },
      salary: {
        basic: values.basic,
        hra: values.hra,
        da: values.da,
        specialAllowance: values.specialAllowance,
        tdsMonthly: values.tdsMonthly,
      },
      // Only someone who could see the list may change it; '' clears it on edit.
      ...(canPickStructure
        ? { salaryStructureId: values.salaryStructureId || (isEdit ? null : undefined) }
        : {}),
      bankDetails: {
        bankName: values.bankName,
        accountNumber: values.accountNumber,
        ifscCode: values.ifscCode,
        panNumber: values.panNumber,
      },
    };

    if (isEdit && id) {
      update.mutate(
        { id, input: payload },
        {
          onSuccess: () => navigate(`/employees/${id}`),
        },
      );
    } else {
      const password = values.password?.trim() || undefined;
      create.mutate(
        { ...payload, createUserAccount: true, password },
        {
          onSuccess: () => {
            submitted.current = true;
            clearDraft();
            navigate('/employees');
          },
        },
      );
    }
  };

  const next = async (): Promise<void> => {
    let fields: (keyof FormValues)[] = [];
    if (step === 1) {
      fields = [
        'firstName', 'lastName', 'email', 'phone', 'password', 'dateOfBirth', 'gender', 'maritalStatus', 'bloodGroup',
        'ecName', 'ecRelation', 'ecPhone',
        'currentLine1', 'currentLine2', 'currentCity', 'currentState', 'currentCountry', 'currentZip',
        'permanentLine1', 'permanentLine2', 'permanentCity', 'permanentState', 'permanentCountry', 'permanentZip'
      ];
    }
    if (step === 2) {
      fields = [
        'department', 'designation', 'shift', 'requireLocation', 'isFieldStaff', 'reportingManager', 'joiningDate',
        'confirmationDate', 'probationEndDate', 'noticePeriod', 'employmentType', 'workLocation'
      ];
    }
    const ok = await trigger(fields);
    if (ok) {
      setStep((s) => Math.min(STEPS.length, s + 1));
    } else {
      // Never a silent no-op: say why "Next" did not move on.
      toast.error('Fix the highlighted fields to continue');
      setTimeout(() => {
        const firstError = document.querySelector('[aria-invalid="true"], .text-destructive');
        firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit Employee' : 'Add Employee'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Employees', to: '/employees' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
      />

      {/* Stepper */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                  step > s.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : step === s.id
                      ? 'border-primary bg-card text-primary'
                      : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {step > s.id ? <Check className="size-4" /> : s.id}
              </div>
              <span
                className={cn(
                  'hidden text-sm font-medium sm:inline',
                  step >= s.id ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-3 h-0.5 flex-1 rounded-full',
                  step > s.id ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        ))}
      </div>

      {draftRestored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-4 py-2 text-sm">
          <span className="text-muted-foreground">
            Restored your unsaved form. Passwords, bank and salary details are never saved — enter them again.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={discardDraft}>
            Discard draft
          </Button>
        </div>
      )}

      <form
        onSubmit={handleSubmit(onSubmit)}
        // Multi-step forms: Enter inside any field would otherwise submit the
        // whole form and skip steps 2 and 3. Trap Enter on intermediate steps
        // and route it to `next()` (which validates the current step's fields
        // before advancing). Textareas keep their normal newline behaviour.
        onKeyDown={(e) => {
          const target = e.target as HTMLElement;
          if (
            e.key === 'Enter' &&
            target.tagName !== 'TEXTAREA' &&
            step < STEPS.length
          ) {
            e.preventDefault();
            void next();
          }
        }}
      >
        <Card>
          <CardContent className="p-6">
            {step === 1 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">First name *</Label>
                  <Input id="firstName" {...register('firstName')} />
                  {errors.firstName && (
                    <p className="mt-1 text-xs text-destructive">{errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="lastName">Last name *</Label>
                  <Input id="lastName" aria-invalid={!!errors.lastName} {...register('lastName')} />
                  <FieldError message={errors.lastName?.message} />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" aria-invalid={!!errors.email} {...register('email')} />
                  <FieldError message={errors.email?.message} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" {...register('phone')} />
                </div>
                {!isEdit && (
                  <div className="sm:col-span-2">
                    <Label htmlFor="password">Login password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="At least 8 characters — leave blank to email an invite link instead"
                      autoComplete="new-password"
                      {...register('password')}
                    />
                    {errors.password && (
                      <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Set a password if you want this employee to be able to sign in immediately.
                      You can change it later from their profile.
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
                </div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <Select id="gender" {...register('gender')}>
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="maritalStatus">Marital status</Label>
                  <Select id="maritalStatus" {...register('maritalStatus')}>
                    <option value="">Select…</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="bloodGroup">Blood group</Label>
                  <Input id="bloodGroup" {...register('bloodGroup')} />
                </div>

                <div className="sm:col-span-2 mt-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">Emergency Contact</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="ecName">Name</Label>
                      <Input id="ecName" {...register('ecName')} />
                    </div>
                    <div>
                      <Label htmlFor="ecRelation">Relation</Label>
                      <Input id="ecRelation" {...register('ecRelation')} />
                    </div>
                    <div>
                      <Label htmlFor="ecPhone">Phone</Label>
                      <Input id="ecPhone" {...register('ecPhone')} />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 mt-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">Current Address</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="currentLine1">Line 1</Label>
                      <Input id="currentLine1" {...register('currentLine1')} />
                    </div>
                    <div>
                      <Label htmlFor="currentLine2">Line 2</Label>
                      <Input id="currentLine2" {...register('currentLine2')} />
                    </div>
                    <div>
                      <Label htmlFor="currentCity">City</Label>
                      <Input id="currentCity" {...register('currentCity')} />
                    </div>
                    <div>
                      <Label htmlFor="currentState">State</Label>
                      <Input id="currentState" {...register('currentState')} />
                    </div>
                    <div>
                      <Label htmlFor="currentCountry">Country</Label>
                      <Input id="currentCountry" {...register('currentCountry')} />
                    </div>
                    <div>
                      <Label htmlFor="currentZip">Zip</Label>
                      <Input id="currentZip" {...register('currentZip')} />
                    </div>
                  </div>
                </div>

                <div className="sm:col-span-2 mt-4">
                  <h3 className="mb-3 text-sm font-semibold text-foreground border-b border-border pb-2">Permanent Address</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <Label htmlFor="permanentLine1">Line 1</Label>
                      <Input id="permanentLine1" {...register('permanentLine1')} />
                    </div>
                    <div>
                      <Label htmlFor="permanentLine2">Line 2</Label>
                      <Input id="permanentLine2" {...register('permanentLine2')} />
                    </div>
                    <div>
                      <Label htmlFor="permanentCity">City</Label>
                      <Input id="permanentCity" {...register('permanentCity')} />
                    </div>
                    <div>
                      <Label htmlFor="permanentState">State</Label>
                      <Input id="permanentState" {...register('permanentState')} />
                    </div>
                    <div>
                      <Label htmlFor="permanentCountry">Country</Label>
                      <Input id="permanentCountry" {...register('permanentCountry')} />
                    </div>
                    <div>
                      <Label htmlFor="permanentZip">Zip</Label>
                      <Input id="permanentZip" {...register('permanentZip')} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="department">Department</Label>
                  <Select id="department" {...register('department')}>
                    <option value="">Select…</option>
                    {deptData?.data.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="designation">Designation</Label>
                  <Select id="designation" {...register('designation')}>
                    <option value="">Select…</option>
                    {desigData?.data.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      {...register('requireLocation')}
                    />
                    <span>
                      <span className="text-sm font-medium">Location required to clock in / out</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        This employee must share their location when checking in and checking
                        out. Punches without a location are rejected. Leave off for staff who
                        do not need location tracking.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3">
                    <input type="checkbox" className="mt-0.5" {...register('isFieldStaff')} />
                    <span>
                      <span className="text-sm font-medium">Field staff</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        Works away from the office. Attendance settings can require field staff to
                        file the day's expenses before checking out.
                      </span>
                    </span>
                  </label>
                </div>
                <div>
                  <Label htmlFor="shift">Shift</Label>
                  <Select id="shift" {...register('shift')}>
                    <option value="">Select…</option>
                    {shiftData?.data.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="employmentType">Employment type *</Label>
                  <Select id="employmentType" {...register('employmentType')}>
                    <option value="full-time">Full Time</option>
                    <option value="part-time">Part Time</option>
                    <option value="contract">Contract</option>
                    <option value="intern">Intern</option>
                  </Select>
                  {errors.employmentType && (
                    <p className="mt-1 text-xs text-destructive">
                      {errors.employmentType.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="joiningDate">Joining date *</Label>
                  <Input id="joiningDate" type="date" {...register('joiningDate')} />
                  {errors.joiningDate && (
                    <p className="mt-1 text-xs text-destructive">{errors.joiningDate.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="workLocation">Work location</Label>
                  <Input id="workLocation" {...register('workLocation')} />
                </div>
                <div>
                  <Label htmlFor="reportingManager">Reporting Manager</Label>
                  <Select id="reportingManager" {...register('reportingManager')}>
                    <option value="">Select…</option>
                    {managerOptions.map((e) => (
                      <option key={e._id} value={e._id}>
                        {e.firstName} {e.lastName}
                        {'former' in e ? ' (no longer active)' : ''}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="probationEndDate">Probation End Date</Label>
                  <Input id="probationEndDate" type="date" {...register('probationEndDate')} />
                </div>
                <div>
                  <Label htmlFor="confirmationDate">Confirmation Date</Label>
                  <Input id="confirmationDate" type="date" {...register('confirmationDate')} />
                </div>
                <div>
                  <Label htmlFor="noticePeriod">Notice Period (Days)</Label>
                  <Input id="noticePeriod" type="number" {...register('noticePeriod')} />
                  <FieldError message={errors.noticePeriod?.message} />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Salary breakdown</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <Label htmlFor="basic">Basic</Label>
                      <Input id="basic" type="number" {...register('basic')} />
                    </div>
                    <div>
                      <Label htmlFor="hra">HRA</Label>
                      <Input id="hra" type="number" {...register('hra')} />
                    </div>
                    <div>
                      <Label htmlFor="da">DA</Label>
                      <Input id="da" type="number" {...register('da')} />
                    </div>
                    <div>
                      <Label htmlFor="specialAllowance">Special</Label>
                      <Input
                        id="specialAllowance"
                        type="number"
                        {...register('specialAllowance')}
                      />
                    </div>
                  </div>
                  <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                    <span className="text-muted-foreground">Gross salary: </span>
                    <span className="font-semibold text-foreground">
                      ₹{totals.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {canPickStructure && (
                      <div>
                        <Label htmlFor="salaryStructureId">Salary structure</Label>
                        <Select id="salaryStructureId" {...register('salaryStructureId')}>
                          <option value="">None — use the breakdown above</option>
                          {structures.map((st) => (
                            <option key={st._id} value={st._id}>
                              {st.name}
                              {st.isDefault ? ' (default)' : ''}
                            </option>
                          ))}
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Payroll takes this employee's earning and deduction components from it.
                        </p>
                      </div>
                    )}
                    <div>
                      <Label htmlFor="tdsMonthly">Monthly TDS</Label>
                      <Input id="tdsMonthly" type="number" min={0} step="0.01" {...register('tdsMonthly')} />
                      {errors.tdsMonthly ? (
                        <p className="mt-1 text-xs text-destructive">{errors.tdsMonthly.message}</p>
                      ) : (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Deducted every month as a TDS line; HR can override it per payslip.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Bank details</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <Label htmlFor="bankName">Bank name</Label>
                      <Input id="bankName" {...register('bankName')} />
                    </div>
                    <div>
                      <Label htmlFor="accountNumber">Account number</Label>
                      <Input id="accountNumber" {...register('accountNumber')} />
                    </div>
                    <div>
                      <Label htmlFor="ifscCode">IFSC code</Label>
                      <Input id="ifscCode" {...register('ifscCode')} />
                    </div>
                    <div>
                      <Label htmlFor="panNumber">PAN number</Label>
                      <Input id="panNumber" {...register('panNumber')} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-4 flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            disabled={step === 1}
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          {step < STEPS.length ? (
            <Button type="button" onClick={next} key="next-button">
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button
              type="submit"
              loading={create.isPending || update.isPending}
              key="submit-button"
            >
              <Save className="size-4" /> {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
