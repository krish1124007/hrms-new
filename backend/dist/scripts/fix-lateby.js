import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee } from '../models/employee.model.js';
import { Shift } from '../models/shift.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
async function run() {
    await connectDatabase();
    const cfg = await AttendanceConfig.findOne({}).exec();
    const toleranceMinutes = cfg?.settings?.lateMarkAfterMinutes ?? 15;
    const tz = process.env.TIMEZONE || 'Asia/Kolkata';
    logger.info(`Starting LateBy recalculation script...`);
    logger.info(`Using timezone: ${tz}, Tolerance: ${toleranceMinutes} mins`);
    const records = await Attendance.find({ "checkIn.time": { $exists: true } }).exec();
    logger.info(`Found ${records.length} total attendance records to review.`);
    let updatedCount = 0;
    for (const att of records) {
        if (!att.checkIn?.time)
            continue;
        const emp = await Employee.findById(att.employeeId).exec();
        if (!emp || !emp.shift)
            continue;
        const shift = await Shift.findById(emp.shift).exec();
        if (!shift || !shift.startTime)
            continue;
        const [h, m] = String(shift.startTime).split(':').map(Number);
        const shiftMinutes = (h || 0) * 60 + (m || 0);
        const nowTimeStr = att.checkIn.time.toLocaleTimeString('en-US', {
            timeZone: tz,
            hour12: false,
            hour: 'numeric',
            minute: 'numeric',
        });
        const [nowH, nowM] = nowTimeStr.split(':').map(Number);
        const nowMinutes = (nowH === 24 ? 0 : nowH) * 60 + nowM;
        let newLateBy = 0;
        if (nowMinutes > shiftMinutes + toleranceMinutes) {
            newLateBy = nowMinutes - shiftMinutes;
        }
        if (att.lateBy !== newLateBy) {
            logger.info(`Updating record ID ${att._id}: lateBy changing from ${att.lateBy} to ${newLateBy}`);
            att.lateBy = newLateBy;
            // Fix status if necessary
            if (newLateBy > 0 && att.status === 'present') {
                att.status = 'late';
            }
            else if (newLateBy === 0 && att.status === 'late') {
                att.status = 'present';
            }
            await att.save();
            updatedCount++;
        }
    }
    logger.info(`Successfully updated ${updatedCount} attendance records.`);
    await disconnectDatabase();
}
run().catch((err) => {
    logger.error({ err }, 'fix-lateby failed');
    process.exit(1);
});
//# sourceMappingURL=fix-lateby.js.map