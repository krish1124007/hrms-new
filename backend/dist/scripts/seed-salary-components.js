/**
 * Seed canonical salary components matching the DDOPC payslip layout.
 *
 *   npx tsx apps/api/src/scripts/seed-salary-components.ts
 *
 * Components are designed so the calculator and PDF renderer reference them
 * by `code`. Idempotent: re-running upserts each component.
 *
 * Reference payslip: Khyati_Jan, gross ₹41,550, net ₹36,963.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { SalaryComponent } from '../models/salary-component.model.js';
import { SalaryStructure } from '../models/salary-structure.model.js';
const COMPONENTS = [
    // ── Earnings ──────────────────────────────────────────
    { code: 'BASIC', name: 'Basic', type: 'earning', calculationType: 'percentage_of_gross', defaultValue: 50, order: 1 },
    { code: 'HRA', name: 'HRA', type: 'earning', calculationType: 'percentage_of_gross', defaultValue: 30, order: 2 },
    { code: 'OTHER_ALL', name: 'Other Allowance', type: 'earning', calculationType: 'percentage_of_gross', defaultValue: 20, order: 3 },
    { code: 'OVERTIME', name: 'Over Time', type: 'earning', calculationType: 'fixed', defaultValue: 0, order: 4 },
    { code: 'EXPENSE', name: 'Expense', type: 'earning', calculationType: 'fixed', defaultValue: 0, order: 5 },
    // ── Deductions ────────────────────────────────────────
    { code: 'PT', name: 'Professional Tax', type: 'deduction', calculationType: 'fixed', defaultValue: 200, isStatutory: true, statutoryType: 'professional_tax', order: 10 },
    { code: 'EMP_PF', name: 'Employee PF', type: 'deduction', calculationType: 'percentage_of_basic', defaultValue: 12, isStatutory: true, statutoryType: 'pf_employee', order: 11 },
    { code: 'EMP_ESI', name: 'ESI Employee', type: 'deduction', calculationType: 'percentage_of_gross', defaultValue: 0.75, isStatutory: true, statutoryType: 'esic_employee', order: 12 },
    { code: 'ADVANCE', name: 'Advance', type: 'deduction', calculationType: 'fixed', defaultValue: 0, order: 13 },
    { code: 'LATE_DED', name: 'Late Deduction', type: 'deduction', calculationType: 'fixed', defaultValue: 0, order: 14 },
    // ── Employer Contributions ────────────────────────────
    { code: 'EMPR_PF', name: 'Employer PF', type: 'employer_contribution', calculationType: 'percentage_of_basic', defaultValue: 13, isStatutory: true, statutoryType: 'pf_employer', order: 20 },
    { code: 'EMPR_ESI', name: 'ESI Employer', type: 'employer_contribution', calculationType: 'percentage_of_gross', defaultValue: 3.25, isStatutory: true, statutoryType: 'esic_employer', order: 21 },
];
async function run() {
    await connectDatabase();
    logger.info('Seeding salary components...');
    const ids = {};
    for (const c of COMPONENTS) {
        const updated = await SalaryComponent.findOneAndUpdate({ code: c.code }, {
            ...c,
            isTaxable: false,
            isActive: true,
        }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
        ids[c.code] = String(updated._id);
        logger.info(`  ✓ ${c.code.padEnd(12)} ${c.name.padEnd(20)} ${c.type.padEnd(22)} ${c.calculationType} ${c.defaultValue}`);
    }
    // Default Standard structure that references the components.
    // For a CTC-driven hire flow, the structure tells the system how to split
    // a gross figure: 50/30/20 across Basic/HRA/Other.
    logger.info('Seeding "Standard" salary structure...');
    const structureName = 'Standard';
    const components = [
        { componentId: ids.BASIC, calculationType: 'percentage_of_gross', value: 50 },
        { componentId: ids.HRA, calculationType: 'percentage_of_gross', value: 30 },
        { componentId: ids.OTHER_ALL, calculationType: 'percentage_of_gross', value: 20 },
        { componentId: ids.EMP_PF, calculationType: 'percentage_of_basic', value: 12 },
        { componentId: ids.PT, calculationType: 'fixed', value: 200 },
        { componentId: ids.EMPR_PF, calculationType: 'percentage_of_basic', value: 13 },
    ];
    await SalaryStructure.findOneAndUpdate({ name: structureName }, {
        name: structureName,
        components,
        isDefault: true,
        isActive: true,
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    logger.info(`  ✓ Structure "${structureName}" with ${components.length} components`);
    logger.info('Done.');
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'seed-salary-components failed');
    process.exit(1);
});
//# sourceMappingURL=seed-salary-components.js.map