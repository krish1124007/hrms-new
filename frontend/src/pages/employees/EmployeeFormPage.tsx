import { useEffect, useState, type ReactElement } from 'react';
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
import { cn } from '@/lib/utils';

const schema = z.object({
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  email: z.string().email(),
  phone: z.string().optional(),
  // Optional on edit; on create, if filled it must be ≥8 chars. We can't
  // express "required only on create" cleanly here — handled at submit time.
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length >= 8, { message: 'Password must be at least 8 characters' }),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  bloodGroup: z.string().optional(),

  department: z.string().optional(),
  designation: z.string().optional(),
  shift: z.string().optional(),
  reportingManager: z.string().optional(),
  joiningDate: z.string().min(1, 'Required'),
  employmentType: z.enum(['full-time', 'part-time', 'contract', 'intern']),
  workLocation: z.string().optional(),

  basic: z.coerce.number().min(0).default(0),
  hra: z.coerce.number().min(0).default(0),
  da: z.coerce.number().min(0).default(0),
  specialAllowance: z.coerce.number().min(0).default(0),

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

const STORAGE_KEY = 'opencore.employee.draft';

export default function EmployeeFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [step, setStep] = useState(1);

  const { data: existing } = useEmployee(id);
  const { data: deptData } = useDepartments({ limit: 100 });
  const { data: shiftData } = useShifts({ limit: 100 });

  const {
    register,
    handleSubmit,
    watch,
    reset,
    trigger,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      employmentType: 'full-time',
      basic: 0,
      hra: 0,
      da: 0,
      specialAllowance: 0,
    },
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
        dateOfBirth: e.dateOfBirth?.slice(0, 10),
        gender: e.gender,
        maritalStatus: e.maritalStatus,
        bloodGroup: e.bloodGroup,
        department: e.department?._id,
        designation: e.designation?._id,
        shift: e.shift?._id,
        reportingManager: e.reportingManager?._id,
        joiningDate: e.joiningDate?.slice(0, 10),
        employmentType: e.employmentType,
        workLocation: e.workLocation,
        basic: e.salary?.basic ?? 0,
        hra: e.salary?.hra ?? 0,
        da: e.salary?.da ?? 0,
        specialAllowance: e.salary?.specialAllowance ?? 0,
        bankName: e.bankDetails?.bankName,
        accountNumber: e.bankDetails?.accountNumber,
        ifscCode: e.bankDetails?.ifscCode,
        panNumber: e.bankDetails?.panNumber,
      });
    }
  }, [existing, reset]);

  // Auto-save draft (create only)
  useEffect(() => {
    if (isEdit) return;
    const sub = watch((vals) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(vals));
    });
    return () => sub.unsubscribe();
  }, [watch, isEdit]);

  // Restore draft (create only)
  useEffect(() => {
    if (isEdit) return;
    const draft = localStorage.getItem(STORAGE_KEY);
    if (draft) {
      try {
        reset(JSON.parse(draft));
      } catch {
        /* ignore */
      }
    }
  }, [isEdit, reset]);

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
      reportingManager: values.reportingManager || undefined,
      joiningDate: values.joiningDate,
      employmentType: values.employmentType,
      workLocation: values.workLocation,
      salary: {
        basic: values.basic,
        hra: values.hra,
        da: values.da,
        specialAllowance: values.specialAllowance,
      },
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
            localStorage.removeItem(STORAGE_KEY);
            navigate('/employees');
          },
        },
      );
    }
  };

  const next = async (): Promise<void> => {
    let fields: (keyof FormValues)[] = [];
    if (step === 1) fields = ['firstName', 'lastName', 'email'];
    if (step === 2) fields = ['joiningDate', 'employmentType'];
    const ok = await trigger(fields);
    if (ok) {
      setStep((s) => Math.min(STEPS.length, s + 1));
    } else {
      // Silent validation failures used to leave the user wondering why the
      // Next button "did nothing". Surface the first failing field so they
      // can fix it.
      const firstError = Object.keys(errors)[0] as keyof FormValues | undefined;
      if (firstError) {
        const el = document.getElementById(firstError);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          (el as HTMLElement).focus?.();
        }
      }
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
                  <Input id="lastName" {...register('lastName')} />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input id="email" type="email" {...register('email')} />
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
            <Button type="button" onClick={next}>
              Next <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button type="submit" loading={create.isPending || update.isPending}>
              <Save className="size-4" /> {isEdit ? 'Save changes' : 'Create employee'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
