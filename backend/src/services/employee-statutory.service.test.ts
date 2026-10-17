/**
 * Saving an ESI period decision on `employee.statutory` — the write itself
 * refuses to move the stored period backwards, so two cycles processed at the
 * same time cannot let an older period overwrite a newer one.
 */
import { describe, it, expect } from 'vitest';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { saveEsiDecision } from './employee-statutory.service.js';

async function employee(statutory?: { esiEligible?: boolean; esiPeriodKey?: string | null }): Promise<IEmployee> {
  const { user } = await createUser({ roleSlug: 'employee' });
  const emp = await createEmployeeFor(user);
  if (statutory) await Employee.collection.updateOne({ _id: emp._id }, { $set: { statutory } });
  return emp;
}

const stored = async (emp: IEmployee) => (await Employee.findById(emp._id).lean())!.statutory;

describe('saveEsiDecision', () => {
  it('writes the first decision', async () => {
    const emp = await employee();

    expect(await saveEsiDecision(emp._id, { esiEligible: true, esiPeriodKey: '2026-H2' })).toBe(true);

    expect(await stored(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });
  });

  it('writes over a stored decision with no period key (or a null one)', async () => {
    const noKey = await employee({ esiEligible: true });
    const nullKey = await employee({ esiEligible: true, esiPeriodKey: null });

    expect(await saveEsiDecision(noKey._id, { esiEligible: false, esiPeriodKey: '2026-H2' })).toBe(true);
    expect(await saveEsiDecision(nullKey._id, { esiEligible: false, esiPeriodKey: '2026-H2' })).toBe(true);

    expect(await stored(noKey)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });
    expect(await stored(nullKey)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });
  });

  it('writes a later period, and the same period again', async () => {
    const emp = await employee({ esiEligible: true, esiPeriodKey: '2026-H1' });

    expect(await saveEsiDecision(emp._id, { esiEligible: false, esiPeriodKey: '2026-H2' })).toBe(true);
    expect(await stored(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2026-H2' });

    expect(await saveEsiDecision(emp._id, { esiEligible: true, esiPeriodKey: '2026-H2' })).toBe(true);
    expect(await stored(emp)).toMatchObject({ esiEligible: true, esiPeriodKey: '2026-H2' });

    expect(await saveEsiDecision(emp._id, { esiEligible: false, esiPeriodKey: '2027-H1' })).toBe(true);
    expect(await stored(emp)).toMatchObject({ esiEligible: false, esiPeriodKey: '2027-H1' });
  });

  it('never writes an older period over a newer one: nothing matches, the stored decision is untouched', async () => {
    const emp = await employee({ esiEligible: true, esiPeriodKey: '2026-H2' });
    const before = await stored(emp);

    expect(await saveEsiDecision(emp._id, { esiEligible: false, esiPeriodKey: '2026-H1' })).toBe(false);
    expect(await saveEsiDecision(emp._id, { esiEligible: false, esiPeriodKey: '2025-H2' })).toBe(false);

    expect(await stored(emp)).toEqual(before);
  });
});
