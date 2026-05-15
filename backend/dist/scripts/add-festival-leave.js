import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') });
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/TankarHRMS';
async function run() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');
        const LeaveType = mongoose.model('LeaveType', new mongoose.Schema({
            name: String,
            code: String,
            description: String,
            isPaid: Boolean,
            color: String,
            isActive: Boolean,
            deletedAt: Date,
        }));
        const existing = await LeaveType.findOne({ code: 'FESTIVAL' });
        if (existing) {
            console.log('Festival Leave already exists. Updating isActive...');
            existing.set('isActive', true);
            await existing.save();
        }
        else {
            await LeaveType.create({
                name: 'Festival Leave',
                code: 'FESTIVAL',
                description: 'Leave for religious or cultural festivals',
                isPaid: true,
                color: '#8b5cf6', // Purple
                isActive: true
            });
            console.log('Festival Leave created successfully.');
        }
        process.exit(0);
    }
    catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
}
run();
//# sourceMappingURL=add-festival-leave.js.map