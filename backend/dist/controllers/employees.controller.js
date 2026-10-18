import { randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Department } from '../models/department.model.js';
import { Designation } from '../models/designation.model.js';
import { DocumentModel } from '../models/document.model.js';
import { ConflictError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { sendMail } from '../services/email.service.js';
import { audit } from '../services/audit.service.js';
import { env } from '../config/env.js';
import { appBaseUrl } from '../lib/app-url.js';
import { assertCanAssignRole } from '../lib/permission-grants.js';
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
});
export async function listEmployees(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.status)
        filter.status = q.status;
    if (q.department)
        filter.department = q.department;
    if (q.designation)
        filter.designation = q.designation;
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
    const login = body.createUserAccount
        ? await provisionLogin(req.user, {
            email,
            firstName: body.firstName,
            lastName: body.lastName,
            password: body.password,
            roleId: body.roleId,
        })
        : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { createUserAccount, roleId, password: _pw, ...rest } = body;
    const employee = await createWithLogin(rest, login);
    void audit({ action: 'create', entity: 'Employee', entityId: String(employee._id) });
    res.status(201).json({ success: true, data: employee });
}
export async function getEmployee(req, res) {
    const employee = await Employee.findById(String(req.params.id))
        .populate('department', 'name code')
        .populate('designation', 'name level')
        .populate('shift', 'name color startTime endTime')
        .populate('reportingManager', 'firstName lastName employeeId profileImage')
        .populate('userId', 'email status lastLogin')
        .exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    res.json({ success: true, data: employee });
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
/** POST /employees/:id/restore — bring back a soft-deleted employee (and their login, if they are employed). */
export async function restoreEmployee(req, res) {
    const employee = await Employee.findById(String(req.params.id)).setOptions({ withDeleted: true }).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    if (!employee.isDeleted)
        throw new ConflictError('Employee is not deleted');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await employee.restore();
    if (employee.userId && (employee.status === 'active' || employee.status === 'onNotice')) {
        await User.updateOne({ _id: employee.userId }, { $set: { status: 'active' } }).exec();
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
    const id = String(req.params.id);
    const current = await Employee.findById(id).exec();
    if (!current)
        throw new NotFoundError('Employee not found');
    const today = startOfBusinessDay(new Date());
    const exitDay = body.exitDate ? startOfBusinessDay(body.exitDate) : null;
    const employed = current.status === 'active' || current.status === 'onNotice';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = {};
    const unset = {};
    if (body.reason && body.status !== 'active')
        set.exitReason = body.reason;
    let exitNow = false;
    if (body.status === 'active') {
        set.status = 'active';
        unset.exitDate = 1;
        unset.exitStatus = 1;
    }
    else if (body.status === 'onNotice') {
        set.status = 'onNotice';
        if (body.exitDate) {
            set.exitDate = body.exitDate;
            set.exitStatus = 'resigned';
        }
    }
    else if (isExitStatus(body.status) && exitDay && exitDay.getTime() > today.getTime() && employed) {
        // Scheduled: status (and login) stay until the exit day has passed.
        set.exitDate = body.exitDate;
        set.exitStatus = body.status;
    }
    else {
        exitNow = isExitStatus(body.status);
        set.status = body.status;
        if (body.exitDate)
            set.exitDate = body.exitDate;
        if (exitNow)
            set.exitStatus = body.status;
    }
    // Before the status flips, so a failure here leaves it unchanged to retry.
    if (exitNow)
        await releaseOnExit(current, today);
    const employee = await Employee.findByIdAndUpdate(id, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true }).exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    if (employee.userId && (body.status === 'active' || body.status === 'onNotice')) {
        await User.findByIdAndUpdate(employee.userId, { status: 'active' });
    }
    if (exitNow && isExitStatus(body.status)) {
        try {
            await notifyHrOfExit(employee, body.status, exitDay ?? today);
        }
        catch (err) {
            logger.warn({ err, employeeId: id }, 'employee exit: HR notification failed');
        }
    }
    void audit({
        action: 'update',
        entity: 'Employee',
        entityId: String(employee._id),
        after: { ...set, ...(Object.keys(unset).length ? { unset: Object.keys(unset) } : {}) },
    });
    res.json({ success: true, data: employee });
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
export async function exportEmployees(_req, res) {
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
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
            if (data.status && ['active', 'inactive', 'terminated', 'resigned', 'onnotice'].includes(String(data.status).toLowerCase())) {
                const st = String(data.status).toLowerCase();
                validData.status = st === 'onnotice' ? 'onNotice' : st;
                given.add('status');
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
                report('updated', 'Existing employee updated', email);
                continue;
            }
            const login = loginRole
                ? // eslint-disable-next-line no-await-in-loop
                    await provisionLogin(req.user, { email, firstName: validData.firstName, lastName: validData.lastName, password: password }, loginRole)
                : undefined;
            // eslint-disable-next-line no-await-in-loop
            await createWithLogin({ ...validData, email, ...(employeeId ? { employeeId } : {}) }, login);
            report('created', !login
                ? 'Employee created without a login: no employee role is set up'
                : login.invite
                    ? 'Employee created; invitation sent'
                    : login.createdUserId
                        ? 'Employee created with an active login'
                        : 'Employee created and linked to the existing login', email);
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