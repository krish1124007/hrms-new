/**
 * Remove statutory figures parked in `salary.otherAllowances` and recompute
 * `salary.grossSalary`.
 *
 *   npm run salary:fix-stash                      dry run: prints what would change
 *   npm run salary:fix-stash -- --apply           writes the changes
 *   node dist/scripts/fix-salary-stash.js [--apply]   (from a built deploy)
 *
 * The CSV seed and the one-off import scripts stored PF, ESIC, Professional
 * Tax, net pay and CTC under named keys in `salary.otherAllowances`
 * (`STASHED_KEYS`), and the employee pre-save hook adds every allowance into
 * `grossSalary` — so those employees show an inflated gross. Payroll computes
 * from the salary components and ignores both, but the employee screens and
 * exports do not. For every employee (soft-deleted ones included) holding any
 * of those keys this drops them and sets
 *   grossSalary = basic + hra + da + specialAllowance + Σ(remaining otherAllowances)
 * — the pre-save hook's formula. Nothing else on the employee is touched.
 * Re-running is harmless: a clean employee is not listed.
 *
 * Reads MONGODB_URI (backend/.env or the shell) like the other scripts.
 */
/* eslint-disable no-console -- CLI script: its result must print regardless of LOG_LEVEL */
import 'dotenv/config';
import type { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { isMainModule } from '../lib/is-main-module.js';
import { Employee } from '../models/employee.model.js';

/** The keys the seed/import scripts parked in `salary.otherAllowances`. */
export const STASHED_KEYS = [
  'employeePf',
  'employeeEsic',
  'employerPf',
  'employerEsic',
  'pt',
  'professionalTax',
  'net',
  'netPay',
  'ctc',
] as const;

const STASHED = new Set<string>(STASHED_KEYS);

export interface SalaryStashChange {
  /** The employee's `_id`. */
  id: string;
  /** The employee code (EMP000123). */
  employeeId?: string;
  name: string;
  removed: Record<string, unknown>;
  otherAllowancesAfter: Record<string, unknown>;
  grossBefore: number;
  grossAfter: number;
}

export interface SalaryStashResult {
  applied: boolean;
  changes: SalaryStashChange[];
}

interface StashedSalary {
  basic?: number;
  hra?: number;
  da?: number;
  specialAllowance?: number;
  otherAllowances?: Record<string, unknown> | null;
  grossSalary?: number;
}

interface StashedEmployee {
  _id: Types.ObjectId;
  employeeId?: string;
  firstName?: string;
  lastName?: string;
  salary?: StashedSalary;
}

const num = (value: unknown): number => Number(value) || 0;

/** The employee pre-save hook's gross: the four components plus every other allowance. */
function grossOf(salary: StashedSalary, otherAllowances: Record<string, unknown>): number {
  const others = Object.values(otherAllowances).reduce<number>((sum, v) => sum + num(v), 0);
  return num(salary.basic) + num(salary.hra) + num(salary.da) + num(salary.specialAllowance) + others;
}

function parseArgs(argv: readonly string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else throw new Error(`Unknown argument "${arg}". Usage: fix-salary-stash [--apply]`);
  }
  return { apply };
}

const formatEntries = (entries: Record<string, unknown>): string =>
  Object.entries(entries)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(', ');

/**
 * Finds every employee with a stashed key and — with `--apply` — removes the
 * keys and recomputes the gross. Prints one line per employee through `print`.
 * Expects an open mongoose connection.
 */
export async function runFixSalaryStash(
  argv: readonly string[],
  print: (line: string) => void = console.log,
): Promise<SalaryStashResult> {
  const { apply } = parseArgs(argv);

  const employees = (await Employee.find({
    $or: STASHED_KEYS.map((key) => ({ [`salary.otherAllowances.${key}`]: { $exists: true } })),
  })
    .setOptions({ withDeleted: true })
    .select('employeeId firstName lastName salary')
    .sort({ employeeId: 1, _id: 1 })
    .lean()
    .exec()) as unknown as StashedEmployee[];

  print(
    apply
      ? 'Salary stash cleanup — applying changes'
      : 'Salary stash cleanup — dry run (nothing is written; re-run with --apply to write)',
  );

  const changes: SalaryStashChange[] = [];
  for (const emp of employees) {
    const salary = emp.salary ?? {};
    const removed: Record<string, unknown> = {};
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(salary.otherAllowances ?? {})) {
      if (STASHED.has(key)) removed[key] = value;
      else kept[key] = value;
    }
    const change: SalaryStashChange = {
      id: String(emp._id),
      employeeId: emp.employeeId,
      name: [emp.firstName, emp.lastName].filter(Boolean).join(' '),
      removed,
      otherAllowancesAfter: kept,
      grossBefore: num(salary.grossSalary),
      grossAfter: grossOf(salary, kept),
    };
    changes.push(change);

    print(
      `  ${change.employeeId ?? '(no code)'} ${change.name} [${change.id}]: removed ${formatEntries(removed)}; ` +
        `grossSalary ${change.grossBefore} → ${change.grossAfter}`,
    );

    if (apply) {
      // eslint-disable-next-line no-await-in-loop -- one small write per employee, in order
      await Employee.updateOne(
        { _id: emp._id },
        { $set: { 'salary.otherAllowances': kept, 'salary.grossSalary': change.grossAfter } },
      )
        .setOptions({ withDeleted: true })
        .exec();
    }
  }

  print(
    `Employees with stashed figures: ${changes.length}` +
      (apply ? ' — applied.' : changes.length > 0 ? ' — dry run, nothing written.' : '.'),
  );
  return { applied: apply, changes };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    await runFixSalaryStash(process.argv.slice(2));
  } finally {
    await disconnectDatabase();
  }
}

// Run only when executed (tsx / node), never when imported (tests).
if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('fix-salary-stash failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
