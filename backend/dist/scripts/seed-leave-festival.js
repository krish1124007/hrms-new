import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { LeaveType } from '../models/leave-type.model.js';
async function seed() {
    try {
        await connectDatabase();
        const festivalLeave = {
            name: 'Festival Leave',
            code: 'FESTIVAL',
            daysAllowed: 2,
            paidLeave: true,
            color: '#f59e0b', // Amber
            isActive: true,
        };
        const existing = await LeaveType.findOne({ code: 'FESTIVAL' }).exec();
        if (existing) {
            logger.info('Festival Leave already exists');
        }
        else {
            await LeaveType.create(festivalLeave);
            logger.info('Festival Leave category created successfully');
        }
        await disconnectDatabase();
        process.exit(0);
    }
    catch (err) {
        logger.error({ err }, 'Seed failed');
        process.exit(1);
    }
}
seed();
//# sourceMappingURL=seed-leave-festival.js.map