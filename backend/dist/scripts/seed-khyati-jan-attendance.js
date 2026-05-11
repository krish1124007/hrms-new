/**
 * Seed Khyati's Jan-2026 attendance to match the reference payslip:
 *   Days Paid 29 / Present 20 (incl. 2 late) / W.Off 5 / Paid Leave 2 / Unpaid 2.
 *
 * Used purely to verify the calculator produces the expected numbers.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee } from '../models/employee.model.js';
async function run() {
    await connectDatabase();
    const emp = await Employee.findOne({ email: 'khyatitrivediddopc@gmail.com' }).exec();
    if (!emp)
        throw new Error('Khyati not found');
    // Wipe any existing Jan rows (idempotent re-runs)
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 31, 23, 59, 59);
    await Attendance.deleteMany({
        employeeId: emp._id,
        date: { $gte: start, $lte: end },
    });
    // Plan: distribute the 31 January days across statuses to match reference.
    // Sundays (4 of them) + 1 holiday = 5 weekly_off days.
    // First 2 working days = unpaid absences (Jan 1-2, Thu-Fri but Jan 1 is holiday → use 2 weekday absences)
    // Next 2 working days = paid leave (on_leave)
    // 2 late, 18 present (= 20 present total)
    const jan2026 = (d) => new Date(2026, 0, d);
    // Sundays in Jan 2026: 4, 11, 18, 25
    const sundays = [4, 11, 18, 25];
    // Add Jan 26 (Republic Day) for the 5th W.Off
    const holidays = [26];
    const status = {};
    for (const d of sundays)
        status[d] = 'weekend';
    for (const d of holidays)
        status[d] = 'holiday';
    // Pick 2 unpaid + 2 paid leave + 2 late from the remaining weekdays
    const remainingDays = Array.from({ length: 31 }, (_, i) => i + 1).filter((d) => !status[d]);
    const unpaid = remainingDays.slice(0, 2);
    const paidLeave = remainingDays.slice(2, 4);
    const late = remainingDays.slice(4, 6);
    const present = remainingDays.slice(6);
    for (const d of unpaid)
        status[d] = 'absent';
    for (const d of paidLeave)
        status[d] = 'on_leave';
    for (const d of late)
        status[d] = 'late';
    for (const d of present)
        status[d] = 'present';
    let count = 0;
    for (let d = 1; d <= 31; d++) {
        await Attendance.create({
            employeeId: emp._id,
            date: jan2026(d),
            status: status[d],
            lateBy: status[d] === 'late' ? 30 : 0,
            totalWorkingHours: status[d] === 'present' || status[d] === 'late' ? 8.5 : 0,
        });
        count++;
    }
    const summary = {};
    for (let d = 1; d <= 31; d++) {
        summary[status[d]] = (summary[status[d]] ?? 0) + 1;
    }
    logger.info(`Seeded ${count} attendance rows for ${emp.firstName} (Jan 2026)`);
    logger.info(`  by status: ${JSON.stringify(summary)}`);
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'seed-khyati failed');
    process.exit(1);
});
//# sourceMappingURL=seed-khyati-jan-attendance.js.map