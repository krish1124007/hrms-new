/**
 * Seed / refresh employee salary records from
 *   `apps/api/data/salaries.json`  (exported from "DDOPC Employee - Employee Salary.numbers").
 *
 * Run:
 *   npx tsx apps/api/src/scripts/seed-salaries.ts
 *
 * Behaviour:
 *   • Looks up each employee by `employeeId` (e.g. EMP000001).
 *   • Writes basic / hra / specialAllowance (= "Other Allowance") / grossSalary.
 *   • Skips rows whose employeeId isn't found in MongoDB and reports them.
 *   • Idempotent — run as often as needed; the spreadsheet is the source of
 *     truth for these four fields.
 *
 * The payroll engine (`payroll.controller.ts → computeForEmployee`) reads
 * these stored values and applies the statutory rules (PF 12% / 13% capped
 * at ₹15,000 wage, ESIC 0.75% / 3.25% under ₹21,000, professional tax),
 * so the resulting payslip mirrors the "NET Pay" column from the sheet.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Employee } from '../models/employee.model.js';
/**
 * Resolve `data/salaries.json` relative to either the apps/api root or the
 * monorepo root, whichever the script is launched from.
 */
function resolveDataFile() {
    const candidates = [
        resolve(process.cwd(), 'data/salaries.json'),
        resolve(process.cwd(), 'apps/api/data/salaries.json'),
    ];
    for (const p of candidates)
        if (existsSync(p))
            return p;
    return candidates[0];
}
async function run() {
    await connectDatabase();
    const dataFile = resolveDataFile();
    let raw;
    try {
        raw = readFileSync(dataFile, 'utf8');
    }
    catch (err) {
        logger.error({ err, path: dataFile }, 'cannot read salaries.json');
        process.exit(1);
    }
    const DATA_FILE = dataFile; // for log message below
    const rows = JSON.parse(raw);
    logger.info(`Loaded ${rows.length} salary rows from ${DATA_FILE}`);
    let updated = 0;
    const missing = [];
    for (const r of rows) {
        const emp = await Employee.findOne({ employeeId: r.employeeId }).exec();
        if (!emp) {
            missing.push(`${r.employeeId} (${r.fullName})`);
            continue;
        }
        // Reset salary entirely — the spreadsheet is the source of truth for
        // these fields. We deliberately overwrite `otherAllowances` with `{}`
        // because previous imports stuffed derived figures (CTC, netPay, PF,
        // PT) in there, which the pre-save hook would then double-add to
        // `grossSalary`.
        emp.salary = {
            basic: r.basic,
            hra: r.hra,
            da: 0,
            specialAllowance: r.otherAllowance, // surfaced as "Other Allowance" on the payslip
            otherAllowances: {},
            grossSalary: r.gross,
        };
        await emp.save();
        updated += 1;
        logger.info(`  ${r.employeeId}  ${r.fullName.padEnd(28)} ` +
            `gross=₹${r.gross.toLocaleString('en-IN').padStart(7)}  ` +
            `(basic=₹${r.basic} HRA=₹${r.hra} Other=₹${r.otherAllowance})`);
    }
    logger.info({ total: rows.length, updated, missingCount: missing.length }, 'seed-salaries done');
    if (missing.length)
        logger.warn({ missing }, 'employees not found — skipped');
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'seed-salaries failed');
    process.exit(1);
});
//# sourceMappingURL=seed-salaries.js.map