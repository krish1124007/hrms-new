/**
 * Seed default expense categories. Idempotent — only inserts what's missing.
 *
 * Run:  cd apps/api && npx tsx src/scripts/seed-expense-categories.ts
 *
 * "Daily expense" exists specifically so the check-out-requires-expense
 * flow has a category to assign when an employee submits their day's
 * spend at end of shift.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
const DEFAULTS = [
    // "Daily expense" is the catch-all submitted at end-of-day check-out.
    // Receipts not required — it's a quick total, not a reimbursable claim.
    { name: 'Daily expense', code: 'DAILY', description: "Required for end-of-day checkout", requiresReceipt: false },
    { name: 'Travel', code: 'TRVL', description: 'Cabs, fuel, public transport', requiresReceipt: true },
    { name: 'Meals', code: 'MEAL', description: 'Food during work / client meetings', requiresReceipt: true },
    { name: 'Supplies', code: 'SUPP', description: 'Stationery, peripherals', requiresReceipt: true },
    { name: 'Client meeting', code: 'CLNT', description: 'Hospitality with external clients', requiresReceipt: true },
    { name: 'Internet & phone', code: 'COMM', description: 'Mobile / data top-ups', requiresReceipt: true },
    { name: 'Other', code: 'OTHER', description: 'Anything not listed above', requiresReceipt: false },
];
async function run() {
    await connectDatabase();
    let created = 0;
    let updated = 0;
    for (const cat of DEFAULTS) {
        const existing = await ExpenseCategory.findOne({ code: cat.code }).exec();
        if (existing) {
            // Refresh so requiresReceipt + description stay in sync with this
            // file across redeploys.
            existing.name = cat.name;
            existing.description = cat.description;
            existing.requiresReceipt = cat.requiresReceipt;
            await existing.save();
            updated += 1;
            continue;
        }
        await ExpenseCategory.create(cat);
        created += 1;
        logger.info(`Created expense category "${cat.name}" (${cat.code})`);
    }
    logger.info({ created, updated, total: DEFAULTS.length }, 'expense categories seeded');
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'seed-expense-categories failed');
    process.exit(1);
});
//# sourceMappingURL=seed-expense-categories.js.map