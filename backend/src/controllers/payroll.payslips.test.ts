import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { uploadRoot, deleteFile } from '../lib/local-storage.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { PayrollCycle } from '../models/payroll-cycle.model.js';
import { PayrollRecord } from '../models/payroll-record.model.js';

describe('POST /payroll/cycles/:id/generate-payslips', () => {
  it('replaces the payslip under a random key and deletes the superseded file', async () => {
    const { token, user } = await createUser({ roleSlug: 'admin' });
    const employee = await createEmployeeFor(user);
    const cycle = await PayrollCycle.create({ month: 5, year: 2026, status: 'processed' });

    // A payslip from before keys were randomised, still on disk and on the record.
    const legacyKey = `payslips/2026-05/${employee.employeeId}.pdf`;
    const legacyPath = path.join(uploadRoot(), legacyKey);
    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, '%PDF-1.4 old');
    const record = await PayrollRecord.create({
      cycleId: cycle._id,
      employeeId: employee._id,
      payslipUrl: `/uploads/${legacyKey}`,
    });

    const res = await request(createApp())
      .post(`/api/v1/payroll/cycles/${String(cycle._id)}/generate-payslips`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ generated: 1, total: 1 });

    const updated = await PayrollRecord.findById(record._id).lean();
    const newUrl = updated!.payslipUrl!;
    expect(newUrl).toMatch(new RegExp(`^/uploads/payslips/2026-05/${employee.employeeId}-[0-9a-f]{12}\\.pdf$`));
    const newKey = newUrl.replace(/^\/uploads\//, '');
    expect(fs.existsSync(path.join(uploadRoot(), newKey))).toBe(true);
    expect(fs.existsSync(legacyPath)).toBe(false);

    await deleteFile(newKey);
  });
});
