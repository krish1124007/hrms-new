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
export {};
//# sourceMappingURL=seed-salaries.d.ts.map