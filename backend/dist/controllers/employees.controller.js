import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { DocumentModel } from '../models/document.model.js';
import { AppError, ConflictError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { containsInsensitive, escapeRegex } from '../lib/regex.js';
import { currentEmployeeId, hasPermission } from '../lib/access.js';
import { directReportIds } from '../lib/approvals.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { env } from '../config/env.js';
import { appBaseUrl } from '../lib/app-url.js';
import { assertCanAssignRole, canAssignRole } from '../lib/permission-grants.js';
import { fieldAccessFor } from '../lib/field-access.js';
import { logger } from '../config/logger.js';
import { leaveYear } from '../services/leave-attendance.service.js';
import { allocateForEmployee } from '../services/leave-year.service.js';
import { isExitStatus, notifyHrOfExit, releaseOnExit } from '../services/employee-exit.service.js';
import { startOfBusinessDay } from '../lib/business-day.js';
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
    /** Monthly TDS to deduct. */
    tdsMonthly: z.coerce.number().min(0).optional(),
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
    personalEmail: z.string().trim().toLowerCase().email().optional(),
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
    /** Force this employee to share location when clocking in / out. */
    requireLocation: z.boolean().optional(),
    /** Field staff — drives the expense-before-checkout rule. */
    isFieldStaff: z.boolean().optional(),
    /** Salary structure this employee's pay components come from. */
    salaryStructureId: z
        .string()
        .regex(/^[0-9a-f]{24}$/i)
        .optional()
        .nullable(),
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
    // `null` means "no date": coerced, it would be 1 Jan 1970 — an exit long
    // past, applied by the next nightly run. `.nullable()` keeps it null.
    exitDate: z.coerce.date().nullable().optional(),
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
    employees: z.array(z.record(z.any())).min(1),
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
    /** `1` / `true`: soft-deleted employees too — honoured for `employees.delete` holders only. */
    includeDeleted: z.string().optional(),
});
/**
 * Soft-deleted employees are shown (`?includeDeleted=1`) only to whoever can
 * delete — and so restore — them; for everyone else the flag is ignored.
 */
function includeDeletedFor(req, flag) {
    return (flag === '1' || flag === 'true') && hasPermission(req.user, 'employees.delete');
}
/*
 * Who sees which employee record, and how much of it.
 *
 *   • HR (`employees.update`) and payroll (`payroll.process`) — everybody,
 *     including pay: salary, bank details (account, IFSC, PAN), the statutory
 *     block and documents.
 *   • any other `employees.view` holder (a manager) — themselves and their
 *     direct reports only, and never those pay fields. Colleagues' work
 *     contact details are in the directory (`GET /employees/directory`).
 */
/** Never shown without `employees.update` / `payroll.process`. */
const PAY_FIELDS = ['salary', 'bankDetails', 'statutory', 'documents'];
const WITHOUT_PAY_FIELDS = Object.fromEntries(PAY_FIELDS.map((f) => [f, 0]));
/** True for HR / payroll: every employee, pay fields included. */
function seesEveryEmployee(req) {
    return hasPermission(req.user, 'employees.update') || hasPermission(req.user, 'payroll.process');
}
/** The projection for the caller: everything for HR / payroll, else without the pay fields. */
function employeeProjection(req) {
    return seesEveryEmployee(req) ? {} : WITHOUT_PAY_FIELDS;
}
/** The employee filter for the caller: `{}` for HR / payroll, else themselves + their direct reports. */
async function employeeScope(req) {
    if (seesEveryEmployee(req))
        return {};
    const [me, reports] = await Promise.all([currentEmployeeId(req), directReportIds(req)]);
    return { _id: { $in: me ? [me, ...reports] : reports } };
}
export async function listEmployees(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const withDeleted = includeDeletedFor(req, q.includeDeleted);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = await employeeScope(req);
    if (q.status)
        filter.status = q.status;
    if (q.department)
        filter.department = q.department;
    if (q.designation)
        filter.designation = q.designation;
    if (q.search) {
        const rx = containsInsensitive(q.search);
        filter.$or = [{ firstName: rx }, { lastName: rx }, { email: rx }, { employeeId: rx }];
    }
    // `Employee.paginate`, with the soft-delete option passed through.
    const page = q.page;
    const limit = q.limit;
    const [data, total] = await Promise.all([
        Employee.find(filter)
            .setOptions({ withDeleted })
            .select(employeeProjection(req))
            .sort(q.sort ?? '-createdAt')
            .skip((page - 1) * limit)
            .limit(limit)
            .populate([
            { path: 'department', select: 'name code' },
            { path: 'designation', select: 'name level' },
            { path: 'shift', select: 'name color' },
        ])
            .exec(),
        Employee.countDocuments(filter).setOptions({ withDeleted }).exec(),
    ]);
    res.json({
        success: true,
        data,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) || 1 },
    });
}
export async function employeeStats(_req, res) {
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
/**
 * Give a brand-new employee this year's leave balances, pro-rated to their
 * joining date, so they need not wait for HR to open the year. Best effort:
 * a failure here is logged and never fails the employee's creation (the
 * balances are also allocated on first leave application, and by opening
 * the year).
 */
async function allocateNewJoinerLeave(employee) {
    try {
        await allocateForEmployee(employee, leaveYear(new Date()));
    }
    catch (err) {
        logger.warn({ err, employeeId: String(employee._id) }, 'leave allocation for a new employee failed');
    }
}
/**
 * The login for a new employee: an existing user with that e-mail that no
 * employee owns yet is linked; otherwise a user is created — `active` with an
 * admin-set password, else `invited` with an `emailVerificationToken` for the
 * accept-invite link. Used by `createEmployee` and, per row, `importEmployees`.
 */
/** The role a new employee's login gets when none is chosen: `employee`, else `member`. */
async function defaultEmployeeRole() {
    return (await Role.findOne({ slug: 'employee' }).exec()) ?? Role.findOne({ slug: 'member' }).exec();
}
/**
 * The role a new *field staff* login gets when none is chosen: the seeded
 * `field_employee` role (own field visits), so ticking "Field staff" is enough
 * to open Field Visits. Null when that role is missing or the caller could not
 * hand it out themselves — the login then gets the plain default role.
 */
async function defaultFieldRole(caller) {
    const role = await Role.findOne({ slug: 'field_employee' }).exec();
    return role && canAssignRole(caller, role) ? role : null;
}
async function provisionLogin(caller, input, defaultRole) {
    const role = input.roleId
        ? await Role.findById(input.roleId).exec()
        : defaultRole ?? (await defaultEmployeeRole());
    if (!role)
        throw new ValidationAppError('No employee role found; specify roleId');
    // An explicitly chosen role must not exceed what the caller holds (no
    // minting an admin login through employee onboarding).
    if (input.roleId)
        assertCanAssignRole(caller, role);
    const existingUser = await User.findOne({ email: input.email }).setOptions({ withDeleted: true }).exec();
    if (existingUser) {
        if (existingUser.isDeleted) {
            throw new ConflictError('A user with this email already exists in deleted records');
        }
        // Check if this user is already associated with an employee (active or deleted)
        const linkedEmployee = await Employee.findOne({ userId: existingUser._id })
            .setOptions({ withDeleted: true })
            .exec();
        if (linkedEmployee) {
            if (linkedEmployee.isDeleted) {
                throw new ConflictError('This email is linked to a deleted employee record. Please restore the employee instead of creating a new one.');
            }
            throw new ConflictError('An active employee is already using this user account/email');
        }
        // A user that no employee owns yet: link it.
        return { userId: existingUser._id };
    }
    const password = input.password ?? randomBytes(16).toString('hex');
    const verificationToken = input.password ? undefined : randomBytes(32).toString('hex');
    const user = await User.create({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        role: role._id,
        password,
        status: input.password ? 'active' : 'invited',
        emailVerified: Boolean(input.password),
        ...(verificationToken ? { emailVerificationToken: verificationToken } : {}),
    });
    const userId = user._id;
    return {
        userId,
        createdUserId: userId,
        ...(verificationToken ? { invite: { to: user.email, firstName: user.firstName, token: verificationToken } } : {}),
    };
}
/** Remove a login `provisionLogin` just created, when its employee could not be. */
async function discardLogin(login) {
    if (!login?.createdUserId)
        return;
    try {
        await User.deleteOne({ _id: login.createdUserId }).exec();
    }
    catch (err) {
        logger.error({ err, userId: String(login.createdUserId) }, 'employee create: could not discard the new login');
    }
}
function sendInvite(invite) {
    void sendMail({
        to: invite.to,
        subject: `Welcome to ${env.COMPANY_NAME}`,
        html: `<p>Hi ${invite.firstName},</p><p>Your employee account has been created. Set up your password to get started:</p><p><a href="${appBaseUrl()}/accept-invite?token=${invite.token}">Activate account</a></p>`,
    });
}
/**
 * Create the employee with its login (if one was provisioned); the login is
 * discarded if the employee cannot be created, and the invitation is only
 * mailed once it has been.
 */
async function createWithLogin(fields, login) {
    let employee;
    try {
        employee = await Employee.create({ ...fields, userId: login?.userId });
    }
    catch (err) {
        await discardLogin(login);
        throw err;
    }
    if (login?.invite)
        sendInvite(login.invite);
    await allocateNewJoinerLeave(employee);
    return employee;
}
export async function createEmployee(req, res) {
    const body = req.body;
    const email = body.email.trim().toLowerCase();
    const dup = await Employee.findOne({ email }).setOptions({ withDeleted: true }).exec();
    if (dup) {
        if (dup.isDeleted) {
            throw new ConflictError('An employee with this email already exists in deleted records');
        }
        throw new ConflictError('Employee with this email already exists');
    }
    // An explicit roleId wins; otherwise field staff get the Field Employee role.
    const login = body.createUserAccount
        ? await provisionLogin(req.user, {
            email,
            firstName: body.firstName,
            lastName: body.lastName,
            password: body.password,
            roleId: body.roleId,
        }, !body.roleId && body.isFieldStaff ? await defaultFieldRole(req.user) : undefined)
        : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { createUserAccount, roleId, password: _pw, ...rest } = body;
    const employee = await createWithLogin(rest, login);
    void audit({ action: 'create', entity: 'Employee', entityId: String(employee._id) });
    res.status(201).json({ success: true, data: employee });
}
export async function getEmployee(req, res) {
    const id = String(req.params.id);
    if (!seesEveryEmployee(req)) {
        const scope = (await employeeScope(req))._id;
        if (!scope.$in.some((own) => own.toHexString() === id)) {
            throw new AppError("You can only view your own and your direct reports' records", 403, 'NOT_YOUR_REPORT');
        }
    }
    const employee = await Employee.findById(id)
        .setOptions({ withDeleted: includeDeletedFor(req, req.query.includeDeleted) })
        .select(employeeProjection(req))
        .populate('department', 'name code')
        .populate('designation', 'name level')
        .populate('shift', 'name color startTime endTime')
        .populate('reportingManager', 'firstName lastName employeeId profileImage')
        // The login and its role (name only — never its permission list).
        .populate({
        path: 'userId',
        select: 'email status lastLogin role',
        populate: { path: 'role', select: 'name slug description' },
    })
        .exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    // Whether their login opens Field Visits (role + custom permissions), so the
    // profile can say why a field employee sees "No access".
    const fieldAccess = (await fieldAccessFor([employee._id])).get(String(employee._id)) === null;
    res.json({ success: true, data: { ...employee.toJSON(), fieldAccess } });
}
// ============================================================================
// SELF-SERVICE PROFILE — GET / PATCH /employees/me
// ============================================================================
/** A user with no employee record (the seeded admin): there is no profile to show. */
function noEmployeeProfile() {
    return new AppError('No employee profile is linked to this account', 404, 'NO_EMPLOYEE_PROFILE');
}
/** What the caller's own profile is built from — never salary, bank details or documents. */
const SELF_FIELDS = 'employeeId firstName lastName email personalEmail phone profileImage gender dateOfBirth joiningDate ' +
    'status isFieldStaff department designation shift reportingManager address emergencyContact';
/** `{ _id, ...picked }` of a populated reference, or null when unset or gone. */
function refOf(value, keys) {
    if (!value || typeof value !== 'object' || !('_id' in value))
        return null;
    const doc = value;
    const out = { _id: doc._id };
    for (const key of keys)
        out[key] = (doc[key] ?? null);
    return out;
}
/** The `/employees/me` shape — the contract the web and mobile profile screens read. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function selfProfile(emp) {
    return {
        _id: emp._id,
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        email: emp.email,
        personalEmail: emp.personalEmail ?? null,
        phone: emp.phone ?? null,
        avatar: emp.profileImage ?? null,
        gender: emp.gender ?? null,
        dateOfBirth: emp.dateOfBirth ?? null,
        joiningDate: emp.joiningDate ?? null,
        status: emp.status,
        isFieldStaff: Boolean(emp.isFieldStaff),
        department: refOf(emp.department, ['name']),
        designation: refOf(emp.designation, ['name']),
        shift: refOf(emp.shift, ['name', 'startTime', 'endTime']),
        reportingManager: refOf(emp.reportingManager, ['firstName', 'lastName']),
        address: emp.address ?? {},
        emergencyContact: emp.emergencyContact ?? {},
    };
}
/** The caller's own profile, or 404 NO_EMPLOYEE_PROFILE. */
async function loadSelfProfile(req) {
    const id = await currentEmployeeId(req);
    const employee = id
        ? await Employee.findById(id)
            .select(SELF_FIELDS)
            .populate('department', 'name')
            .populate('designation', 'name')
            .populate('shift', 'name startTime endTime')
            .populate('reportingManager', 'firstName lastName')
            .lean()
            .exec()
        : null;
    if (!employee)
        throw noEmployeeProfile();
    return selfProfile(employee);
}
/** GET /employees/me — any logged-in user's own employee profile. */
export async function getMyProfile(req, res) {
    res.json({ success: true, data: await loadSelfProfile(req) });
}
const selfText = z.string().trim().max(200);
const selfPhone = z.string().trim().max(30);
const selfAddressSchema = z
    .object({
    line1: selfText.optional(),
    line2: selfText.optional(),
    city: selfText.optional(),
    state: selfText.optional(),
    country: selfText.optional(),
    zip: z.string().trim().max(20).optional(),
})
    .strict();
/**
 * What an employee may change about themselves: contact details only. Strict —
 * any other key (salary, department, status…) is a 400, never silently dropped.
 * An empty string clears `phone`, `personalEmail` or `avatar`.
 */
export const updateSelfSchema = z
    .object({
    phone: selfPhone.optional(),
    personalEmail: z.union([z.literal(''), z.string().trim().toLowerCase().email()]).optional(),
    address: z
        .object({ current: selfAddressSchema.optional(), permanent: selfAddressSchema.optional() })
        .strict()
        .optional(),
    emergencyContact: z
        .object({ name: selfText.optional(), relation: selfText.optional(), phone: selfPhone.optional() })
        .strict()
        .optional(),
    // An image the caller uploaded (`POST /documents/upload`): its link as the
    // upload returned it (turned back into `/uploads/<key>` on the way in).
    // Checked against the caller's own uploads in the handler.
    avatar: z.union([z.literal(''), z.string().trim().max(2048)]).optional(),
})
    .strict();
/**
 * 400 unless `avatar` is an image the caller uploaded themselves: the stored
 * `/uploads/<key>` reference of one of their own (non-deleted) documents with
 * an `image/*` type. An external URL or anybody else's file is refused, so
 * nobody can point their photo at a tracking pixel or at a colleague's
 * private document. Re-sending the photo already set is always fine.
 */
async function assertOwnUploadedImage(req, avatar, current) {
    if (current && avatar === current)
        return;
    const refuse = () => {
        throw new ValidationAppError('avatar must be an image you uploaded', [
            { field: 'avatar', message: 'Upload the photo first (POST /documents/upload) and send the link it returned' },
        ]);
    };
    if (!avatar.startsWith('/uploads/') || !req.user?._id)
        refuse();
    const upload = await DocumentModel.findOne({ 'file.url': avatar, uploadedBy: req.user._id })
        .select('file.mimeType')
        .lean()
        .exec();
    if (!upload || !String(upload.file?.mimeType ?? '').toLowerCase().startsWith('image/'))
        refuse();
}
/** Plain copy of a stored sub-document (or `{}`), for a field-by-field merge. */
function plainObject(value) {
    if (!value || typeof value !== 'object')
        return {};
    const doc = value;
    return typeof doc.toObject === 'function' ? doc.toObject() : { ...value };
}
/**
 * PATCH /employees/me — the caller updates their own contact details. The
 * given part of the address / emergency contact is merged into what is
 * stored; a new avatar is mirrored to the login so the app header matches.
 */
export async function updateMyProfile(req, res) {
    const body = req.body;
    const id = await currentEmployeeId(req);
    const employee = id ? await Employee.findById(id).exec() : null;
    if (!employee)
        throw noEmployeeProfile();
    if (body.avatar)
        await assertOwnUploadedImage(req, body.avatar, employee.profileImage);
    if (body.phone !== undefined)
        employee.set('phone', body.phone || undefined);
    if (body.personalEmail !== undefined)
        employee.set('personalEmail', body.personalEmail || undefined);
    if (body.avatar !== undefined)
        employee.set('profileImage', body.avatar || undefined);
    for (const part of ['current', 'permanent']) {
        const patch = body.address?.[part];
        if (patch)
            employee.set(`address.${part}`, { ...plainObject(employee.address?.[part]), ...patch });
    }
    if (body.emergencyContact) {
        employee.set('emergencyContact', { ...plainObject(employee.emergencyContact), ...body.emergencyContact });
    }
    await employee.save();
    if (body.avatar !== undefined && employee.userId) {
        await User.updateOne({ _id: employee.userId }, body.avatar ? { $set: { avatar: body.avatar } } : { $unset: { avatar: 1 } }).exec();
    }
    void audit({
        action: 'update',
        entity: 'Employee',
        entityId: String(employee._id),
        after: body,
        metadata: { source: 'self-service' },
    });
    res.json({ success: true, data: await loadSelfProfile(req) });
}
// ============================================================================
// DIRECTORY — colleagues' work contact details, for every logged-in user
// ============================================================================
/** Still employed: serving notice counts, any exit does not. */
const EMPLOYED = { status: { $in: ['active', 'onNotice'] } };
// No phone numbers: the `phone` on an employee record is their personal
// mobile, and the directory is open to every logged-in user.
const DIRECTORY_FIELDS = 'employeeId firstName lastName profileImage email department designation';
const DIRECTORY_POPULATE = [
    { path: 'department', select: 'name' },
    { path: 'designation', select: 'name' },
];
const OBJECT_ID = /^[0-9a-f]{24}$/i;
export const directoryQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().max(100).optional(),
    department: z.string().regex(OBJECT_ID, 'Invalid department id').optional(),
});
/** One directory row — name, Employee ID, work e-mail, department, designation, photo. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function directoryRow(emp) {
    return {
        _id: emp._id,
        employeeId: emp.employeeId,
        firstName: emp.firstName,
        lastName: emp.lastName,
        avatar: emp.profileImage ?? null,
        email: emp.email,
        department: refOf(emp.department, ['name']),
        designation: refOf(emp.designation, ['name']),
    };
}
/** GET /employees/directory — employed colleagues, searchable by name, e-mail or Employee ID. */
export async function listDirectory(req, res) {
    const q = req.query;
    const filter = { ...EMPLOYED };
    if (q.department)
        filter.department = new Types.ObjectId(q.department);
    const words = (q.search ?? '').split(/\s+/).filter(Boolean).slice(0, 5);
    if (words.length) {
        // Every word must match one of the fields, so "asha pat" finds Asha Patel.
        filter.$and = words.map((word) => {
            const rx = new RegExp(escapeRegex(word), 'i');
            return { $or: [{ firstName: rx }, { lastName: rx }, { email: rx }, { employeeId: rx }] };
        });
    }
    const result = await Employee.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: 'firstName lastName',
        select: DIRECTORY_FIELDS,
        populate: DIRECTORY_POPULATE,
    });
    res.json({ success: true, data: result.data.map(directoryRow), pagination: result.pagination });
}
/** GET /employees/directory/stats — headcount of employed people, in total and per department. */
export async function directoryStats(_req, res) {
    const rows = await Employee.aggregate([
        // Aggregations skip the soft-delete query hook: exclude deleted employees here.
        { $match: { ...EMPLOYED, isDeleted: { $ne: true } } },
        { $group: { _id: '$department', count: { $sum: 1 } } },
        { $lookup: { from: 'departments', localField: '_id', foreignField: '_id', as: 'dept' } },
        { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        { $project: { _id: 0, departmentId: '$_id', name: '$dept.name', count: 1 } },
        { $sort: { count: -1, name: 1 } },
    ]);
    const byDepartment = rows.map((row) => ({
        departmentId: row.departmentId ? String(row.departmentId) : null,
        name: row.name ?? (row.departmentId ? 'Unknown department' : 'Unassigned'),
        count: row.count,
    }));
    const total = byDepartment.reduce((sum, row) => sum + row.count, 0);
    res.json({ success: true, data: { total, byDepartment } });
}
/** GET /employees/directory/:id — one employed colleague; 404 for anyone who has left or was deleted. */
export async function getDirectoryEntry(req, res) {
    const id = String(req.params.id);
    if (!OBJECT_ID.test(id))
        throw new NotFoundError('Employee not found');
    const employee = await Employee.findOne({ _id: new Types.ObjectId(id), ...EMPLOYED })
        .select(DIRECTORY_FIELDS)
        .populate(DIRECTORY_POPULATE)
        .lean()
        .exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    res.json({ success: true, data: directoryRow(employee) });
}
/** How far up a reporting chain the cycle check walks. */
const MAX_REPORTING_DEPTH = 50;
/**
 * `managerId` may become `employeeId`'s reporting manager: an existing
 * employee other than themselves, and not someone who already reports to
 * them, directly or further down (that would close a loop).
 */
async function assertValidManager(employeeId, managerId) {
    if (!Types.ObjectId.isValid(managerId))
        throw new ValidationAppError('reportingManager is not a valid id');
    if (String(managerId) === String(employeeId)) {
        throw new ValidationAppError('An employee cannot report to themselves');
    }
    const manager = await Employee.findById(managerId).select('_id reportingManager').lean().exec();
    if (!manager)
        throw new ValidationAppError('Reporting manager not found');
    const seen = new Set([String(manager._id)]);
    let cursor = manager.reportingManager;
    for (let depth = 0; cursor && depth < MAX_REPORTING_DEPTH; depth += 1) {
        if (String(cursor) === String(employeeId)) {
            throw new ValidationAppError('That manager already reports to this employee — it would make a reporting cycle');
        }
        if (seen.has(String(cursor)))
            break; // a loop further up that does not involve this employee
        seen.add(String(cursor));
        // eslint-disable-next-line no-await-in-loop
        const next = await Employee.findById(cursor)
            .setOptions({ withDeleted: true })
            .select('reportingManager')
            .lean()
            .exec();
        cursor = next?.reportingManager;
    }
}
/**
 * Apply an update to a loaded employee and save it: `salary` is merged into
 * the stored components (a partial salary no longer wipes the rest; the
 * gross is recomputed on save), a new `reportingManager` is checked by
 * `assertValidManager` (`''` clears it), and a new `email` moves the login's
 * e-mail with it — 409 when another employee or login already has it.
 */
async function applyEmployeeUpdate(employee, body) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { salary, email, reportingManager, password: _pw, ...rest } = body;
    employee.set(rest);
    if (salary) {
        const stored = employee.salary;
        const current = stored?.toObject ? stored.toObject() : { ...(stored ?? {}) };
        const patch = Object.fromEntries(Object.entries(salary).filter(([, v]) => v !== undefined));
        employee.set('salary', { ...current, ...patch });
    }
    if (reportingManager !== undefined) {
        if (reportingManager === '' || reportingManager === null) {
            employee.set('reportingManager', undefined);
        }
        else {
            await assertValidManager(employee._id, reportingManager);
            employee.set('reportingManager', reportingManager);
        }
    }
    let previousLoginEmail;
    if (email !== undefined) {
        const next = email.trim().toLowerCase();
        if (next !== employee.email) {
            const otherEmployee = await Employee.exists({ email: next, _id: { $ne: employee._id } }).setOptions({
                withDeleted: true,
            });
            if (otherEmployee)
                throw new ConflictError('Another employee already uses this e-mail');
            if (employee.userId) {
                const otherUser = await User.exists({ email: next, _id: { $ne: employee.userId } }).setOptions({
                    withDeleted: true,
                });
                if (otherUser)
                    throw new ConflictError('Another login already uses this e-mail');
                const login = await User.findById(employee.userId).select('email').lean().exec();
                if (login && login.email !== next) {
                    previousLoginEmail = login.email;
                    // The login first: its unique index settles a concurrent claim on the address.
                    await User.updateOne({ _id: employee.userId }, { $set: { email: next } }).exec();
                }
            }
            employee.email = next;
        }
    }
    try {
        await employee.save();
    }
    catch (err) {
        if (previousLoginEmail !== undefined) {
            await User.updateOne({ _id: employee.userId }, { $set: { email: previousLoginEmail } }).exec();
        }
        throw err;
    }
}
export async function updateEmployee(req, res) {
    const body = req.body;
    const employee = await Employee.findById(String(req.params.id)).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    await applyEmployeeUpdate(employee, body);
    void audit({
        action: 'update',
        entity: 'Employee',
        entityId: String(employee._id),
        after: body,
    });
    res.json({ success: true, data: employee });
}
export async function deleteEmployee(req, res) {
    const employee = await Employee.findById(String(req.params.id)).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await employee.softDelete();
    if (employee.userId) {
        await User.findByIdAndUpdate(employee.userId, { status: 'inactive' });
    }
    void audit({ action: 'delete', entity: 'Employee', entityId: String(employee._id) });
    res.json({ success: true, message: 'Employee deleted' });
}
/**
 * POST /employees/:id/restore — bring back a soft-deleted employee, and — if
 * they are employed — the login the delete deactivated. A login that was
 * still `invited` (never accepted) stays invited.
 */
export async function restoreEmployee(req, res) {
    const employee = await Employee.findById(String(req.params.id)).setOptions({ withDeleted: true }).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    if (!employee.isDeleted)
        throw new ConflictError('Employee is not deleted');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await employee.restore();
    if (employee.userId && (employee.status === 'active' || employee.status === 'onNotice')) {
        await User.updateOne({ _id: employee.userId, status: 'inactive' }, { $set: { status: 'active' } }).exec();
    }
    void audit({ action: 'update', entity: 'Employee', entityId: String(employee._id), after: { restored: true } });
    res.json({ success: true, data: employee });
}
/**
 * Change an employee's employment status.
 *
 *   • `active` — employed again; any scheduled exit is dropped and the login
 *     reactivated.
 *   • `onNotice` — serving notice; with an `exitDate` the exit is scheduled
 *     for it (`resigned`), applied by the day-close after that day.
 *   • `resigned` / `terminated` / `inactive` with an `exitDate` after today
 *     (business day) — only scheduled: the employee stays as they are, login
 *     included, until the day-close after `exitDate` applies it
 *     (`applyScheduledExits`). Otherwise — no date, or today or earlier — it
 *     applies now: approved leave starting after today is cancelled and
 *     refunded, the login deactivated, and HR told what to recover.
 */
export async function updateEmployeeStatus(req, res) {
    const body = req.body;
    const current = await Employee.findById(String(req.params.id)).exec();
    if (!current)
        throw new NotFoundError('Employee not found');
    const { employee, written } = await changeEmployeeStatus(current, body);
    void audit({ action: 'update', entity: 'Employee', entityId: String(employee._id), after: written });
    res.json({ success: true, data: employee });
}
/**
 * The one way an employee's status changes — the status endpoint and the
 * import both go through it (rules above `updateEmployeeStatus`). Returns the
 * updated employee and what was written, for the caller's audit entry.
 */
async function changeEmployeeStatus(current, change) {
    const id = String(current._id);
    const today = startOfBusinessDay(new Date());
    const exitDay = change.exitDate ? startOfBusinessDay(change.exitDate) : null;
    const employed = current.status === 'active' || current.status === 'onNotice';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = {};
    const unset = {};
    if (change.reason && change.status !== 'active')
        set.exitReason = change.reason;
    let exitNow = false;
    if (change.status === 'active') {
        set.status = 'active';
        unset.exitDate = 1;
        unset.exitStatus = 1;
    }
    else if (change.status === 'onNotice') {
        set.status = 'onNotice';
        if (change.exitDate) {
            set.exitDate = change.exitDate;
            set.exitStatus = 'resigned';
        }
    }
    else if (isExitStatus(change.status) && exitDay && exitDay.getTime() > today.getTime() && employed) {
        // Scheduled: status (and login) stay until the exit day has passed.
        set.exitDate = change.exitDate;
        set.exitStatus = change.status;
    }
    else {
        exitNow = isExitStatus(change.status);
        set.status = change.status;
        if (change.exitDate)
            set.exitDate = change.exitDate;
        if (exitNow)
            set.exitStatus = change.status;
    }
    // Before the status flips, so a failure here leaves it unchanged to retry.
    if (exitNow)
        await releaseOnExit(current, today);
    const employee = await Employee.findByIdAndUpdate(id, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true }).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    if (employee.userId && (change.status === 'active' || change.status === 'onNotice')) {
        await User.findByIdAndUpdate(employee.userId, { status: 'active' });
    }
    if (exitNow && isExitStatus(change.status)) {
        try {
            await notifyHrOfExit(employee, change.status, exitDay ?? today);
        }
        catch (err) {
            logger.warn({ err, employeeId: id }, 'employee exit: HR notification failed');
        }
    }
    return { employee, written: { ...set, ...(Object.keys(unset).length ? { unset: Object.keys(unset) } : {}) } };
}
export async function addEmployeeDocument(req, res) {
    const body = req.body;
    const employee = await Employee.findById(String(req.params.id)).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
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
        await DocumentModel.updateOne({ 'file.url': body.fileUrl, 'sharedWith.userId': { $ne: employee.userId } }, { $push: { sharedWith: { userId: employee.userId } } }).exec();
    }
    res.status(201).json({ success: true, data: employee.documents });
}
export async function deleteEmployeeDocument(req, res) {
    const employee = await Employee.findById(String(req.params.id)).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    const docId = String(req.params.docId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const removed = employee.documents.find((d) => String(d._id) === docId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    employee.documents = employee.documents.filter((d) => String(d._id) !== docId);
    await employee.save();
    // Symmetric cleanup — pull the employee's userId out of sharedWith on the
    // underlying Document so they no longer see it on /documents. The blob and
    // the Document row itself remain (HR may still want them in records).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fileUrl = removed?.fileUrl;
    if (fileUrl && employee.userId) {
        await DocumentModel.updateOne({ 'file.url': fileUrl }, { $pull: { sharedWith: { userId: employee.userId } } }).exec();
    }
    res.json({ success: true, data: employee.documents });
}
/** CSV of work details (no pay fields) — of everybody for HR / payroll, else of the caller and their reports. */
export async function exportEmployees(req, res) {
    const employees = await Employee.find(await employeeScope(req))
        .select('employeeId firstName lastName email phone department designation status joiningDate')
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
        e.department?.name ?? '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        e.designation?.name ?? '',
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
/** A date cell of an import row, or undefined when blank / null / not a date. */
function importedDate(value) {
    if (value === undefined || value === null || value === '')
        return undefined;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? undefined : date;
}
/** How a row's exit was recorded (`written` by `changeEmployeeStatus`), for its report line. */
function exitOutcome(exit, written) {
    if (!exit || !written)
        return '';
    const day = startOfBusinessDay(exit.exitDate).toISOString().slice(0, 10);
    return written.status ? `; ${exit.status} as of ${day}` : `; ${exit.status} scheduled for ${day}`;
}
/** The Employee ID a row carries (`employeeId`, or the export's "Employee ID" column), if any. */
function importedEmployeeId(data) {
    const raw = data.employeeId ?? data['Employee ID'];
    const id = raw === undefined || raw === null ? '' : String(raw).trim();
    return id || undefined;
}
/**
 * POST /employees/import — one row per employee. A new e-mail creates the
 * employee with a login exactly as `createEmployee` does (an `invited` user
 * and the accept-invite mail, unless the row sets a password), keeping the
 * row's Employee ID when it has one; a known e-mail updates that employee
 * through the same safe update as PATCH. Every row is reported as `created`,
 * `updated`, `skipped` (a deleted employee has that e-mail) or `error`;
 * `failed` lists the last two the way older clients read it.
 */
export async function importEmployees(req, res) {
    const { employees } = req.body;
    const rows = [];
    const rowSchema = createEmployeeSchema.omit({ createUserAccount: true, roleId: true });
    // Resolved once. Without one (a workspace whose roles were never seeded)
    // employees are still imported, each row saying it got no login.
    const loginRole = await defaultEmployeeRole();
    // Rows marked field staff get the Field Employee role, as on the form.
    const fieldLoginRole = loginRole ? await defaultFieldRole(req.user) : null;
    for (const [index, data] of employees.entries()) {
        const row = index + 1;
        const rawEmail = typeof data.email === 'string' ? data.email.trim().toLowerCase() : undefined;
        const employeeId = importedEmployeeId(data);
        const report = (status, message, email = rawEmail) => {
            rows.push({ row, ...(email ? { email } : {}), ...(employeeId ? { employeeId } : {}), status, message });
        };
        try {
            const parsed = rowSchema.safeParse(data);
            if (!parsed.success) {
                report('error', parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', '));
                continue;
            }
            const { password, ...validData } = parsed.data;
            // Fields the row actually carries: an update must not reset the rest to schema defaults.
            const given = new Set(Object.keys(data));
            // An exit (resigned / terminated / inactive) is never written as a bare
            // status: it goes through the status endpoint's path (scheduled or
            // applied, leave released, login off, HR told) once the row is saved,
            // and needs the row's exitDate. Without one the status is left alone.
            let exit;
            let exitNote = '';
            if (data.status && ['active', 'inactive', 'terminated', 'resigned', 'onnotice'].includes(String(data.status).toLowerCase())) {
                const st = String(data.status).toLowerCase();
                if (isExitStatus(st)) {
                    const exitDate = importedDate(data.exitDate);
                    if (exitDate) {
                        exit = { status: st, exitDate, ...(data.exitReason ? { reason: String(data.exitReason) } : {}) };
                    }
                    else {
                        exitNote = ` — status not changed to ${st}: an exit needs an exitDate`;
                    }
                }
                else {
                    validData.status = st === 'onnotice' ? 'onNotice' : st;
                    given.add('status');
                }
            }
            if (data.departmentName) {
                const name = String(data.departmentName);
                // eslint-disable-next-line no-await-in-loop
                let dept = await Department.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
                if (!dept) {
                    const code = name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase() + Math.floor(100 + Math.random() * 900);
                    // eslint-disable-next-line no-await-in-loop
                    dept = await Department.create({ name, code });
                }
                validData.department = dept._id.toString();
                given.add('department');
            }
            if (data.designationName) {
                const name = String(data.designationName);
                // eslint-disable-next-line no-await-in-loop
                let desig = await Designation.findOne({ name: { $regex: new RegExp(`^${escapeRegex(name)}$`, 'i') } });
                // eslint-disable-next-line no-await-in-loop
                if (!desig)
                    desig = await Designation.create({ name });
                validData.designation = desig._id.toString();
                given.add('designation');
            }
            const email = validData.email.trim().toLowerCase();
            // eslint-disable-next-line no-await-in-loop
            const dup = await Employee.findOne({ email }).setOptions({ withDeleted: true }).exec();
            if (dup?.isDeleted) {
                report('skipped', 'A deleted employee has this e-mail — restore them instead', email);
                continue;
            }
            if (employeeId) {
                // eslint-disable-next-line no-await-in-loop
                const holder = await Employee.findOne({ employeeId }).setOptions({ withDeleted: true }).select('_id').lean().exec();
                if (holder && (!dup || String(holder._id) !== String(dup._id))) {
                    report('error', `Employee ID ${employeeId} is already used by another employee`, email);
                    continue;
                }
            }
            if (dup) {
                const update = Object.fromEntries(Object.entries(validData).filter(([k]) => given.has(k)));
                if (employeeId)
                    update.employeeId = employeeId;
                // eslint-disable-next-line no-await-in-loop
                await applyEmployeeUpdate(dup, update);
                // eslint-disable-next-line no-await-in-loop
                const exited = exit ? (await changeEmployeeStatus(dup, exit)).written : undefined;
                void audit({
                    action: 'update',
                    entity: 'Employee',
                    entityId: String(dup._id),
                    after: { ...update, ...(exited ? { exit: exited } : {}) },
                    metadata: { source: 'import', row },
                });
                report('updated', `Existing employee updated${exitOutcome(exit, exited)}${exitNote}`, email);
                continue;
            }
            const login = loginRole
                ? // eslint-disable-next-line no-await-in-loop
                    await provisionLogin(req.user, { email, firstName: validData.firstName, lastName: validData.lastName, password: password }, validData.isFieldStaff && fieldLoginRole ? fieldLoginRole : loginRole)
                : undefined;
            // eslint-disable-next-line no-await-in-loop
            const created = await createWithLogin({ ...validData, email, ...(employeeId ? { employeeId } : {}) }, login);
            // eslint-disable-next-line no-await-in-loop
            const exited = exit ? (await changeEmployeeStatus(created, exit)).written : undefined;
            void audit({
                action: 'create',
                entity: 'Employee',
                entityId: String(created._id),
                after: { email, employeeId: created.employeeId, ...(exited ? { exit: exited } : {}) },
                metadata: { source: 'import', row },
            });
            report('created', (!login
                ? 'Employee created without a login: no employee role is set up'
                : login.invite
                    ? 'Employee created; invitation sent'
                    : login.createdUserId
                        ? 'Employee created with an active login'
                        : 'Employee created and linked to the existing login') +
                exitOutcome(exit, exited) +
                exitNote, email);
        }
        catch (err) {
            report('error', err.message);
        }
    }
    const count = (status) => rows.filter((r) => r.status === status).length;
    const failed = rows
        .filter((r) => r.status === 'error' || r.status === 'skipped')
        .map((r) => ({ email: r.email ?? `row ${r.row}`, reason: r.message }));
    res.status(201).json({
        success: true,
        data: {
            created: count('created'),
            updated: count('updated'),
            skipped: count('skipped'),
            errors: count('error'),
            failed,
            rows,
        },
    });
}
export async function upcomingBirthdays(_req, res) {
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
        .sort((a, b) => new Date(a.dateOfBirth).getDate() - new Date(b.dateOfBirth).getDate());
    res.json({ success: true, data: upcoming });
}
//# sourceMappingURL=employees.controller.js.map