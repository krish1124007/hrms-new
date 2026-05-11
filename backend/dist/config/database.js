import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';
import { schemaVersionPlugin } from '../lib/mongoose-plugins.js';
// Apply schemaVersion globally so every model carries a version field.
// Bump the default here (and add a migration) when an online schema
// migration is in flight — workers target `{ schemaVersion: { $lt: N } }`.
mongoose.plugin(schemaVersionPlugin, { version: 1 });
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;
export async function connectDatabase() {
    mongoose.set('strictQuery', true);
    let attempt = 0;
    while (attempt < MAX_RETRIES) {
        try {
            const conn = await mongoose.connect(env.MONGODB_URI, {
                // Skip auto-indexing in prod — indexes should be pre-created (CI migration)
                autoIndex: env.NODE_ENV !== 'production',
                // Connection pool — tuned for a typical 2-vCPU API node
                minPoolSize: env.NODE_ENV === 'production' ? 10 : 2,
                maxPoolSize: env.NODE_ENV === 'production' ? 50 : 10,
                maxIdleTimeMS: 60_000,
                waitQueueTimeoutMS: 10_000,
                // Fail fast on bad hosts instead of hanging
                serverSelectionTimeoutMS: 10_000,
                socketTimeoutMS: 45_000,
                connectTimeoutMS: 10_000,
                heartbeatFrequencyMS: 10_000,
                // Safer defaults
                retryWrites: true,
                retryReads: true,
                // Compression disabled to avoid missing dependency issues on VPS
                compressors: ['none'],
            });
            logger.info({ host: conn.connection.host }, '✅ MongoDB connected');
            return conn;
        }
        catch (err) {
            attempt += 1;
            logger.error({ err, attempt, maxRetries: MAX_RETRIES }, 'MongoDB connection failed, retrying…');
            if (attempt >= MAX_RETRIES) {
                throw err;
            }
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
    }
    // Unreachable, but satisfies TS
    throw new Error('Unable to connect to MongoDB');
}
export async function disconnectDatabase() {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
}
//# sourceMappingURL=database.js.map