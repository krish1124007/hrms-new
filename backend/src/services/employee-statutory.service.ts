/**
 * Saving an employee's statutory flags.
 */
import type { Types } from 'mongoose';
import { Employee, type IEmployeeStatutory } from '../models/employee.model.js';

/**
 * Saves the ESI decision for a contribution period on `employee.statutory`,
 * unless the stored decision is for a LATER period. The check is part of the
 * write (a filter on the stored `esiPeriodKey`, which orders correctly as a
 * string for `YYYY-H1` / `YYYY-H2`), so cycles processed at the same time can
 * never let an older period overwrite a newer one. Returns whether it wrote.
 */
export async function saveEsiDecision(
  employeeId: Types.ObjectId,
  statutory: Required<IEmployeeStatutory>,
): Promise<boolean> {
  const { matchedCount } = await Employee.updateOne(
    {
      _id: employeeId,
      $or: [
        // No key stored yet (absent or null).
        { 'statutory.esiPeriodKey': null },
        { 'statutory.esiPeriodKey': { $lte: statutory.esiPeriodKey } },
      ],
    },
    { $set: { statutory } },
  ).exec();
  return matchedCount > 0;
}
