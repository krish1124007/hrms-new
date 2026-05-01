import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { DocumentModel } from '../models/document.model.js';
import { ConflictError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { env } from '../config/env.js';

const addressSchema = z
  .object({
    line1: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    zip: z.string().optional(),
  })
  .partial();

const salarySchema = z
  .object({
    basic: z.coerce.number().min(0).default(0),
    hra: z.coerce.number().min(0).default(0),
    da: z.coerce.number().min(0).default(0),
    specialAllowance: z.coerce.number().min(0).default(0),
    otherAllowances: z.record(z.coerce.number()).default({}),
  })
  .partial();

const bankSchema = z
  .object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    ifscCode: z.string().optional(),
    panNumber: z.string().optional(),
  })
  .partial();

const emergencySchema = z
  .object({
    name: z.string().optional(),
    relation: z.string().optional(),
    phone: z.string().optional(),
  })
  .partial();

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  dateOfBirth: z.coerce.date().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  maritalStatus: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  bloodGroup: z.string().optional(),
  profileImage: z.string().url().optional(),
  address: z
    .object({
      current: addressSchema.optional(),
      permanent: addressSchema.optional(),
    })
    .optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  shift: z.string().optional(),
  reportingManager: z.string().optional(),
  joiningDate: z.coerce.date(),
  confirmationDate: z.coerce.date().optional(),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract', 'intern'])
    .default('full-time'),
  workLocation: z.string().optional(),
  salary: salarySchema.optional(),
  bankDetails: bankSchema.optional(),
  emergencyContact: emergencySchema.optional(),
  probationEndDate: z.coerce.date().optional(),
  noticePeriod: z.coerce.number().optional(),
  createUserAccount: z.boolean().default(true),
  roleId: z.string().optional(),
  // Optional admin-set password. If provided (min 8 chars) the user can sign in
  // with it immediately and we mark them active. If omitted, we fall back to
  // the legacy invite flow (random temp password + email link).
  password: z.string().min(8).max(128).optional(),
});

export const updateEmployeeSchema = createEmployeeSchema.partial().omit({
  createUserAccount: true,
  roleId: true,
});

export const updateStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'terminated', 'resigned', 'onNotice']),
  reason: z.string().optional(),
  exitDate: z.coerce.date().optional(),
});

export const addDocumentSchema = z.object({
  type: z.string().min(1),
  name: z.string().min(1),
  // Accept either a full URL (e.g. S3/CDN) or a relative storage path
  // (e.g. `/uploads/documents/2026/04/…`). The local-storage upload pipeline
  // returns the latter; portable enough that a future S3 migration can swap
  // the prefix without touching this schema.
  fileUrl: z
    .string()
    .min(1)
    .refine((v) => /^https?:\/\//.test(v) || v.startsWith('/'), {
      message: 'fileUrl must be a URL or a path starting with /',
    }),
});

export const importEmployeesSchema = z.object({
  employees: z.array(createEmployeeSchema.omit({ createUserAccount: true, roleId: true })).min(1),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
  status: z
    .enum(['active', 'inactive', 'terminated', 'resigned', 'onNotice'])
    .optional(),
  sort: z.string().optional(),
});

export async function listEmployees(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.status) filter.status = q.status;
  if (q.department) filter.department = q.department;
  if (q.designation) filter.designation = q.designation;
  if (q.search) {
    filter.$or = [
      { firstName: { $regex: q.search, $options: 'i' } },
      { lastName: { $regex: q.search, $options: 'i' } },
      { email: { $regex: q.search, $options: 'i' } },
      { employeeId: { $regex: q.search, $options: 'i' } },
    ];
  }
  const result = await Employee.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: [
      { path: 'department', select: 'name code' },
      { path: 'designation', select: 'name level' },
      { path: 'shift', select: 'name color' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function employeeStats(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [total, active, byDept, byType, joiningsThisMonth, exitsThisMonth] = await Promise.all([
    Employee.countDocuments({}),
    Employee.countDocuments({ status: 'active' }),
    Employee.aggregate([{ $group: { _id: '$department', n: { $sum: 1 } } }]),
    Employee.aggregate([{ $group: { _id: '$employmentType', n: { $sum: 1 } } }]),
    Employee.countDocuments({ joiningDate: { $gte: startOfMonth, $lt: endOfMonth } }),
    Employee.countDocuments({ exitDate: { $gte: startOfMonth, $lt: endOfMonth } }),
  ]);

  res.json({
    success: true,
    data: { total, active, byDepartment: byDept, byType, joiningsThisMonth, exitsThisMonth },
  });
}

export async function createEmployee(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createEmployeeSchema>;
  const dup = await Employee.findOne({ email: body.email.toLowerCase() }).exec();
  if (dup) throw new ConflictError('Employee with this email already exists');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let userId: any;
  if (body.createUserAccount) {
    let role;
    if (body.roleId) {
      role = await Role.findById(body.roleId).exec();
    } else {
      role = await Role.findOne({ slug: 'employee' }).exec();
      if (!role) role = await Role.findOne({ slug: 'member' }).exec();
    }
    if (!role) throw new ValidationAppError('No employee role found; specify roleId');

    const adminSetPassword = body.password;
    const password = adminSetPassword ?? randomBytes(16).toString('hex');
    const verificationToken = adminSetPassword ? undefined : randomBytes(32).toString('hex');
    const existingUser = await User.findOne({ email: body.email.toLowerCase() }).exec();
    if (existingUser) throw new ConflictError('User with this email already exists');

    const user = await User.create({
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: role._id,
      password,
      status: adminSetPassword ? 'active' : 'invited',
      emailVerified: adminSetPassword ? true : false,
      ...(verificationToken ? { emailVerificationToken: verificationToken } : {}),
    });
    userId = user._id;

    if (verificationToken) {
      void sendMail({
        to: user.email,
        subject: 'Welcome to DD HRMS',
        html: `<p>Hi ${user.firstName},</p><p>Your employee account has been created. Set up your password to get started:</p><p><a href="${env.CORS_ORIGIN}/accept-invite/${verificationToken}">Activate account</a></p>`,
      });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { createUserAccount, roleId, password: _pw, ...rest } = body;
  const employee = await Employee.create({ ...rest, userId });

  void audit({ action: 'create', entity: 'Employee', entityId: String(employee._id) });
  res.status(201).json({ success: true, data: employee });
}

export async function getEmployee(req: Request, res: Response): Promise<void> {
  const employee = await Employee.findById(String(req.params.id))
    .populate('department', 'name code')
    .populate('designation', 'name level')
    .populate('shift', 'name color startTime endTime')
    .populate('reportingManager', 'firstName lastName employeeId profileImage')
    .populate('userId', 'email status lastLogin')
    .exec();
  if (!employee) throw new NotFoundError('Employee not found');
  res.json({ success: true, data: employee });
}

export async function updateEmployee(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateEmployeeSchema>;
  const employee = await Employee.findByIdAndUpdate(String(req.params.id), body, {
    new: true,
    runValidators: true,
  }).exec();
  if (!employee) throw new NotFoundError('Employee not found');
  void audit({
    action: 'update',
    entity: 'Employee',
    entityId: String(employee._id),
    after: body,
  });
  res.json({ success: true, data: employee });
}

export async function deleteEmployee(req: Request, res: Response): Promise<void> {
  const employee = await Employee.findById(String(req.params.id)).exec();
  if (!employee) throw new NotFoundError('Employee not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (employee as any).softDelete();
  if (employee.userId) {
    await User.findByIdAndUpdate(employee.userId, { status: 'inactive' });
  }
  void audit({ action: 'delete', entity: 'Employee', entityId: String(employee._id) });
  res.json({ success: true, message: 'Employee deleted' });
}

export async function updateEmployeeStatus(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateStatusSchema>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status: body.status };
  if (body.exitDate) update.exitDate = body.exitDate;
  if (body.reason) update.exitReason = body.reason;

  const employee = await Employee.findByIdAndUpdate(String(req.params.id), update, {
    new: true,
  }).exec();
  if (!employee) throw new NotFoundError('Employee not found');

  if (employee.userId && (body.status === 'terminated' || body.status === 'resigned')) {
    await User.findByIdAndUpdate(employee.userId, { status: 'inactive' });
  }

  void audit({
    action: 'update',
    entity: 'Employee',
    entityId: String(employee._id),
    after: update,
  });
  res.json({ success: true, data: employee });
}

export async function addEmployeeDocument(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof addDocumentSchema>;
  const employee = await Employee.findById(String(req.params.id)).exec();
  if (!employee) throw new NotFoundError('Employee not found');
  employee.documents.push({
    type: body.type,
    name: body.name,
    fileUrl: body.fileUrl,
    uploadedAt: new Date(),
  });
  await employee.save();

  // Mirror the upload into the general /documents view for the target employee:
  // find the Document row that owns this fileUrl and add the employee's userId
  // to `sharedWith` so the visibility filter lets them download it from
  // /documents (offer letters, ID proofs, etc. — their own personnel file).
  if (employee.userId) {
    await DocumentModel.updateOne(
      { 'file.url': body.fileUrl, 'sharedWith.userId': { $ne: employee.userId } },
      { $push: { sharedWith: { userId: employee.userId } } },
    ).exec();
  }

  res.status(201).json({ success: true, data: employee.documents });
}

export async function deleteEmployeeDocument(req: Request, res: Response): Promise<void> {
  const employee = await Employee.findById(String(req.params.id)).exec();
  if (!employee) throw new NotFoundError('Employee not found');
  const docId = String(req.params.docId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const removed = employee.documents.find((d: any) => String(d._id) === docId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee.documents = employee.documents.filter((d: any) => String(d._id) !== docId);
  await employee.save();

  // Symmetric cleanup — pull the employee's userId out of sharedWith on the
  // underlying Document so they no longer see it on /documents. The blob and
  // the Document row itself remain (HR may still want them in records).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fileUrl = (removed as any)?.fileUrl as string | undefined;
  if (fileUrl && employee.userId) {
    await DocumentModel.updateOne(
      { 'file.url': fileUrl },
      { $pull: { sharedWith: { userId: employee.userId } } },
    ).exec();
  }

  res.json({ success: true, data: employee.documents });
}

export async function exportEmployees(_req: Request, res: Response): Promise<void> {
  const employees = await Employee.find({})
    .populate('department', 'name')
    .populate('designation', 'name')
    .lean()
    .exec();
  const headers = [
    'Employee ID',
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Department',
    'Designation',
    'Status',
    'Joining Date',
  ];
  const rows = employees.map((e) => [
    e.employeeId,
    e.firstName,
    e.lastName,
    e.email,
    e.phone ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e.department as any)?.name ?? '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (e.designation as any)?.name ?? '',
    e.status,
    e.joiningDate ? new Date(e.joiningDate).toISOString().slice(0, 10) : '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  res.send(csv);
}

export async function importEmployees(req: Request, res: Response): Promise<void> {
  const { employees } = req.body as z.infer<typeof importEmployeesSchema>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const created: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failed: any[] = [];
  for (const data of employees) {
    try {
      const dup = await Employee.findOne({ email: data.email.toLowerCase() }).exec();
      if (dup) {
        failed.push({ email: data.email, reason: 'duplicate' });
        continue;
      }
      const e = await Employee.create(data);
      created.push(e);
    } catch (err) {
      failed.push({ email: data.email, reason: (err as Error).message });
    }
  }
  res.status(201).json({ success: true, data: { created: created.length, failed } });
}

export async function upcomingBirthdays(_req: Request, res: Response): Promise<void> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const employees = await Employee.find({
    status: 'active',
    dateOfBirth: { $exists: true, $ne: null },
  })
    .select('firstName lastName employeeId profileImage dateOfBirth')
    .lean()
    .exec();
  const upcoming = employees
    .filter((e) => e.dateOfBirth && new Date(e.dateOfBirth).getMonth() + 1 === month)
    .sort(
      (a, b) =>
        new Date(a.dateOfBirth as Date).getDate() - new Date(b.dateOfBirth as Date).getDate(),
    );
  res.json({ success: true, data: upcoming });
}

