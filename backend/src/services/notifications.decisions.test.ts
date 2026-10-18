/**
 * Who hears about what, for expense claims, overtime and the payroll lock:
 *
 *   • a submitted expense claim / overtime request → the claimant's reporting
 *     manager (in-app);
 *   • an approval, rejection or reimbursement → the employee, in-app and by
 *     e-mail;
 *   • a locked payroll cycle → every employee with a login in it, "your
 *     payslip is ready", in-app and by e-mail.
 *
 * Telling people is a courtesy: a failing notification or mail never fails the
 * request. The SaaS mail templates this app never used are gone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { logger } from '../config/logger.js';
import { signFileUrl } from '../lib/file-urls.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { sendMail } from './email.service.js';
import * as emailTemplates from './email-templates.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { ExpenseCategory, type IExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { Notification } from '../models/notification.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { PayrollCycle } from '../models/payroll-cycle.model.js';
import { PayrollRecord } from '../models/payroll-record.model.js';
import type { IUser } from '../models/user.model.js';

vi.mock('./email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const mails = () => vi.mocked(sendMail).mock.calls.map(([m]) => m);
const notesOf = (user: IUser) => Notification.find({ userId: user._id }).lean().exec();

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(roleSlug: RoleSlug, fields: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  return { user, token, employee: await createEmployeeFor(user, fields) };
}

let app: Express;
let manager: Actor;
let ann: Actor;

beforeEach(async () => {
  vi.mocked(sendMail).mockReset();
  vi.mocked(sendMail).mockResolvedValue(true);
  app = createApp();
  manager = await actor('manager');
  ann = await actor('employee', { reportingManager: manager.employee._id });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ──────────────────────────────────────────────────────────── */

describe('expense claims', () => {
  let category: IExpenseCategory;

  beforeEach(async () => {
    category = await ExpenseCategory.create({ name: 'Travel', code: 'TRV', requiresReceipt: false });
  });

  const claimBody = (fields: Record<string, unknown> = {}) => ({
    category: String(category._id),
    amount: 1200,
    date: '2026-10-10',
    receiptUrls: [{ name: 'bill.jpg', fileUrl: signFileUrl('/uploads/documents/bill.jpg') }],
    ...fields,
  });

  function pendingClaim(fields: Record<string, unknown> = {}) {
    return ExpenseClaim.create({
      employeeId: ann.employee._id,
      category: category._id,
      amount: 1200,
      date: new Date('2026-10-10'),
      status: 'pending',
      ...fields,
    });
  }

  const decide = (who: Actor, id: unknown, action: 'approve' | 'reject' | 'reimburse', body: object = {}) =>
    request(app).patch(`/api/v1/expense-claims/requests/${String(id)}/${action}`).set(auth(who.token)).send(body);

  it("a claim submitted by an employee notifies the employee's reporting manager, not the employee", async () => {
    const res = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(ann.token))
      .send(claimBody());

    expect(res.status).toBe(201);
    const notes = await notesOf(manager.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('expense_request');
    expect(notes[0]!.link).toBe('/expense-claims/requests');
    expect(notes[0]!.message).toContain(`${ann.employee.firstName} ${ann.employee.lastName}`);
    expect(notes[0]!.message).toMatch(/1,200/);
    expect(notes[0]!.metadata).toMatchObject({ claimId: res.body.data._id });
    expect(await Notification.countDocuments({ userId: ann.user._id })).toBe(0);
  });

  it('nobody is told about a draft, or when the claimant has no reporting manager', async () => {
    const draft = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(ann.token))
      .send(claimBody({ status: 'draft' }));
    expect(draft.status).toBe(201);

    const lone = await actor('employee');
    const unmanaged = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(lone.token))
      .send(claimBody());
    expect(unmanaged.status).toBe(201);

    expect(await Notification.countDocuments()).toBe(0);
  });

  it('a draft that is later submitted notifies the manager then, once', async () => {
    const draft = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(ann.token))
      .send(claimBody({ status: 'draft' }));
    expect(draft.status).toBe(201);
    expect(await Notification.countDocuments()).toBe(0);

    const submit = await request(app)
      .patch(`/api/v1/expense-claims/requests/${String(draft.body.data._id)}`)
      .set(auth(ann.token))
      .send({ status: 'pending' });
    expect(submit.status).toBe(200);
    const edit = await request(app)
      .patch(`/api/v1/expense-claims/requests/${String(draft.body.data._id)}`)
      .set(auth(ann.token))
      .send({ description: 'Client visit' });
    expect(edit.status).toBe(200);

    const notes = await notesOf(manager.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('expense_request');
    expect(notes[0]!.metadata).toMatchObject({ claimId: draft.body.data._id });
  });

  it("the manager is told when HR files on the employee's behalf, but not about a claim they filed themselves", async () => {
    const hr = await actor('hr_manager');

    const res = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(hr.token))
      .send(claimBody({ employeeId: String(ann.employee._id) }));
    expect(res.status).toBe(201);
    expect(await Notification.countDocuments({ userId: manager.user._id })).toBe(1);

    const own = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(manager.token))
      .send(claimBody({ employeeId: String(ann.employee._id) }));
    expect(own.status).toBe(201);
    // The manager filed it themselves: still only the one from HR's filing.
    expect(await Notification.countDocuments({ userId: manager.user._id })).toBe(1);
  });

  it('approving notifies the employee in-app and by e-mail', async () => {
    const claim = await pendingClaim();

    const res = await decide(manager, claim._id, 'approve');

    expect(res.status).toBe(200);
    const notes = await notesOf(ann.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('decision');
    expect(notes[0]!.title).toBe('Expense claim approved');
    expect(notes[0]!.link).toBe('/expense-claims');
    expect(notes[0]!.message).toMatch(/approved/);
    expect(notes[0]!.metadata).toMatchObject({ module: 'expense', status: 'approved', claimId: String(claim._id) });
    expect(await Notification.countDocuments({ userId: manager.user._id })).toBe(0);
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.to).toBe(ann.user.email);
    expect(mails()[0]!.subject).toBe('Expense claim approved');
    expect(mails()[0]!.html).toContain('/expense-claims');
  });

  it('an approval for a lesser amount says so', async () => {
    const claim = await pendingClaim();

    await decide(manager, claim._id, 'approve', { acceptedAmount: 1000 });

    const notes = await notesOf(ann.user);
    expect(notes[0]!.message).toMatch(/1,200/);
    expect(notes[0]!.message).toMatch(/1,000/);
  });

  it('rejecting carries the reason to the employee in-app and by e-mail', async () => {
    const claim = await pendingClaim();

    const res = await decide(manager, claim._id, 'reject', { reason: 'Receipt is unreadable' });

    expect(res.status).toBe(200);
    const notes = await notesOf(ann.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe('Expense claim rejected');
    expect(notes[0]!.message).toContain('Receipt is unreadable');
    expect(notes[0]!.metadata).toMatchObject({ module: 'expense', status: 'rejected' });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.to).toBe(ann.user.email);
    expect(mails()[0]!.html).toContain('Receipt is unreadable');
  });

  it('reimbursing notifies the employee', async () => {
    const claim = await pendingClaim({ status: 'approved' });

    const res = await decide(manager, claim._id, 'reimburse', { reimbursementRef: 'UTR-77' });

    expect(res.status).toBe(200);
    const notes = await notesOf(ann.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe('Expense claim reimbursed');
    expect(notes[0]!.metadata).toMatchObject({ module: 'expense', status: 'reimbursed' });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.to).toBe(ann.user.email);
  });

  it('a failing notification or mail never fails the decision', async () => {
    const claim = await pendingClaim();
    vi.spyOn(Notification, 'create').mockRejectedValue(new Error('db down'));
    vi.mocked(sendMail).mockRejectedValue(new Error('smtp down'));

    const res = await decide(manager, claim._id, 'approve');

    expect(res.status).toBe(200);
    expect((await ExpenseClaim.findById(claim._id).lean())!.status).toBe('approved');
  });

  it('an employee without a login is simply not told', async () => {
    const claim = await pendingClaim();
    await Employee.updateOne({ _id: ann.employee._id }, { $unset: { userId: 1 } });

    const res = await decide(manager, claim._id, 'approve');

    expect(res.status).toBe(200);
    expect(await Notification.countDocuments()).toBe(0);
    expect(mails()).toHaveLength(0);
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('overtime', () => {
  const create = (who: Actor, body: Record<string, unknown> = {}) =>
    request(app)
      .post('/api/v1/overtime')
      .set(auth(who.token))
      .send({ date: '2026-10-12', hours: 2.5, reason: 'Month-end close', ...body });

  const pendingRequest = () =>
    OvertimeRequest.create({
      employee: ann.employee._id,
      date: new Date('2026-10-12'),
      hours: 2.5,
      reason: 'Month-end close',
      status: 'pending',
    });

  it("a request notifies the employee's reporting manager, not the employee", async () => {
    const res = await create(ann);

    expect(res.status).toBe(201);
    const notes = await notesOf(manager.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('approval_request');
    expect(notes[0]!.link).toBe('/overtime');
    expect(notes[0]!.message).toContain(`${ann.employee.firstName} ${ann.employee.lastName}`);
    expect(notes[0]!.message).toMatch(/2\.5/);
    expect(notes[0]!.metadata).toMatchObject({ overtimeId: res.body.data._id });
    expect(await Notification.countDocuments({ userId: ann.user._id })).toBe(0);
  });

  it('no reporting manager, nobody told, request still created', async () => {
    const lone = await actor('employee');

    const res = await create(lone);

    expect(res.status).toBe(201);
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('approving notifies the employee in-app and by e-mail', async () => {
    const ot = await pendingRequest();

    const res = await request(app).post(`/api/v1/overtime/${String(ot._id)}/approve`).set(auth(manager.token)).send({});

    expect(res.status).toBe(200);
    const notes = await notesOf(ann.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('decision');
    expect(notes[0]!.title).toBe('Overtime approved');
    expect(notes[0]!.link).toBe('/overtime');
    expect(notes[0]!.metadata).toMatchObject({ module: 'overtime', status: 'approved', overtimeId: String(ot._id) });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.to).toBe(ann.user.email);
    expect(mails()[0]!.subject).toBe('Overtime approved');
  });

  it('rejecting carries the reason to the employee', async () => {
    const ot = await pendingRequest();

    const res = await request(app)
      .post(`/api/v1/overtime/${String(ot._id)}/reject`)
      .set(auth(manager.token))
      .send({ reason: 'Not pre-approved' });

    expect(res.status).toBe(200);
    const notes = await notesOf(ann.user);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.title).toBe('Overtime rejected');
    expect(notes[0]!.message).toContain('Not pre-approved');
    expect(notes[0]!.metadata).toMatchObject({ module: 'overtime', status: 'rejected' });
    expect(mails()).toHaveLength(1);
    expect(mails()[0]!.html).toContain('Not pre-approved');
  });

  it('a failing notification or mail never fails the decision', async () => {
    const ot = await pendingRequest();
    vi.spyOn(Notification, 'create').mockRejectedValue(new Error('db down'));
    vi.mocked(sendMail).mockRejectedValue(new Error('smtp down'));

    const res = await request(app)
      .post(`/api/v1/overtime/${String(ot._id)}/reject`)
      .set(auth(manager.token))
      .send({ reason: 'Not pre-approved' });

    expect(res.status).toBe(200);
    expect((await OvertimeRequest.findById(ot._id).lean())!.status).toBe('rejected');
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('locking a payroll cycle', () => {
  const lock = (who: Actor, cycleId: unknown) =>
    request(app).post(`/api/v1/payroll/cycles/${String(cycleId)}/lock`).set(auth(who.token));

  const recordFor = (cycleId: unknown, employeeId: unknown) =>
    PayrollRecord.create({
      cycleId,
      employeeId,
      earnings: [{ name: 'Basic', amount: 30000 }],
      deductions: [],
      grossSalary: 30000,
      totalDeductions: 0,
      netSalary: 30000,
    });

  it('tells every employee with a login that the payslip is ready, in-app and by e-mail', async () => {
    const hr = await actor('hr_manager');
    const bob = await actor('employee');
    // On the payroll but without a login: nobody to tell.
    const noLogin = await Employee.create({
      firstName: 'No',
      lastName: 'Login',
      email: 'no.login@test.local',
      joiningDate: new Date('2024-01-15'),
    });
    const cycle = await PayrollCycle.create({ month: 10, year: 2026, status: 'processed' });
    await Promise.all([ann, bob].map((a) => recordFor(cycle._id, a.employee._id)));
    await recordFor(cycle._id, noLogin._id);
    // Another cycle's staff are not in this one.
    const other = await actor('employee');
    const elsewhere = await PayrollCycle.create({ month: 9, year: 2026, status: 'paid' });
    await recordFor(elsewhere._id, other.employee._id);

    const res = await lock(hr, cycle._id);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('locked');
    await vi.waitFor(
      async () => {
        expect(await Notification.countDocuments({ type: 'payslip_ready' })).toBe(2);
        expect(mails()).toHaveLength(2);
      },
      { timeout: 10_000 },
    );
    for (const a of [ann, bob]) {
      const notes = await notesOf(a.user);
      expect(notes).toHaveLength(1);
      expect(notes[0]!.type).toBe('payslip_ready');
      expect(notes[0]!.title).toBe('Payslip ready');
      expect(notes[0]!.message).toContain('October 2026');
      expect(notes[0]!.link).toBe('/payroll/my-payslips');
      expect(notes[0]!.metadata).toMatchObject({ module: 'payroll', month: 10, year: 2026 });
    }
    expect(mails().map((m) => m.to).sort()).toEqual([ann.user.email, bob.user.email].sort());
    for (const m of mails()) {
      expect(m.subject).toContain('October 2026');
      expect(m.html).toContain('/payroll/my-payslips');
    }
    expect(await Notification.countDocuments({ userId: hr.user._id })).toBe(0);
  });

  it('a refused lock tells nobody', async () => {
    const hr = await actor('hr_manager');
    const cycle = await PayrollCycle.create({ month: 10, year: 2026, status: 'draft' });
    await recordFor(cycle._id, ann.employee._id);

    const res = await lock(hr, cycle._id);

    expect(res.status).toBe(409);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await Notification.countDocuments()).toBe(0);
    expect(mails()).toHaveLength(0);
  });

  it('a failure while telling people never fails the lock', async () => {
    const hr = await actor('hr_manager');
    const cycle = await PayrollCycle.create({ month: 10, year: 2026, status: 'processed' });
    await recordFor(cycle._id, ann.employee._id);
    const warn = vi.spyOn(logger, 'warn');
    vi.spyOn(Notification, 'create').mockRejectedValue(new Error('db down'));
    vi.mocked(sendMail).mockRejectedValue(new Error('smtp down'));
    vi.spyOn(Employee, 'find').mockImplementationOnce(() => {
      throw new Error('employees unavailable');
    });

    const res = await lock(hr, cycle._id);

    expect(res.status).toBe(200);
    expect((await PayrollCycle.findById(cycle._id).lean())!.status).toBe('locked');
    await vi.waitFor(
      () =>
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ cycleId: String(cycle._id) }),
          expect.stringMatching(/payslip/i),
        ),
      { timeout: 10_000 },
    );
  });
});

/* ──────────────────────────────────────────────────────────── */

describe('mail templates', () => {
  const SAAS_TEMPLATES = [
    'sendWelcomeEmail',
    'sendTrialExpiringEmail',
    'sendPaymentFailedEmail',
    'sendInvoiceEmail',
    'sendPasswordResetEmail',
    'sendTicketUpdateEmail',
    'sendAnnouncementEmail',
  ];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith('.ts') ? [full] : [];
    });
  }

  it('the SaaS templates (trial, invoice, payment-failed, ...) are gone and nothing refers to them', () => {
    const self = fileURLToPath(import.meta.url);
    const srcDir = path.resolve(path.dirname(self), '..');
    for (const name of SAAS_TEMPLATES) expect(Object.keys(emailTemplates)).not.toContain(name);
    const mentions = sourceFiles(srcDir)
      .filter((file) => file !== self)
      .filter((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return SAAS_TEMPLATES.some((name) => text.includes(name));
      });
    expect(mentions).toEqual([]);
  });

  it('decisionEmail renders a subject, an escaped body and an absolute link', () => {
    const mail = emailTemplates.decisionEmail({
      title: 'Overtime rejected',
      body: 'Your overtime was rejected. Reason: <b>no</b> & done',
      link: '/overtime',
    });

    expect(mail.subject).toBe('Overtime rejected');
    expect(mail.html).toContain('&lt;b&gt;no&lt;/b&gt; &amp; done');
    expect(mail.html).not.toContain('<b>no</b>');
    expect(mail.html).toContain('http://localhost:5173/overtime');
    expect(mail.text).toContain('Reason: <b>no</b> & done');
    expect(mail.text).toContain('http://localhost:5173/overtime');
  });

  it('payslipReadyEmail names the month and links to the payslips', () => {
    const mail = emailTemplates.payslipReadyEmail({ month: 3, year: 2027, link: '/payroll/my-payslips' });

    expect(mail.subject).toBe('Your payslip for March 2027 is ready');
    expect(mail.html).toContain('http://localhost:5173/payroll/my-payslips');
    expect(mail.text).toContain('http://localhost:5173/payroll/my-payslips');
  });
});
