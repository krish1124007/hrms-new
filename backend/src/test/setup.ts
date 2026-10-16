/**
 * Vitest setup — runs before every test file.
 *
 *  - Pins a deterministic, valid environment BEFORE any app module is loaded
 *    (config/env.ts parses process.env at import time and exits on failure).
 *  - Replaces Redis with ioredis-mock and stubs the BullMQ backup jobs, so no
 *    test ever needs a Redis server or opens a queue connection.
 *  - Boots an in-memory MongoDB and connects mongoose to it for the file's
 *    lifetime, wiping every collection (and the fake Redis) after each test.
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// vi.hoisted runs ahead of the (hoisted) static imports below, which is the
// only place env can be set early enough for config/env.ts.
vi.hoisted(async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');

  const uploadDir = path.join(os.tmpdir(), 'hrms-test-uploads');
  fs.mkdirSync(uploadDir, { recursive: true });

  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789abcdef',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789ab',
    ENCRYPTION_KEY: 'test-encryption-key-0123456789abcdef0123456789ab',
    UPLOAD_DIR: uploadDir,
    CORS_ORIGIN: 'http://localhost:5173',
    // Never let a test reach a developer's real Redis or Meilisearch.
    REDIS_URL: 'redis://127.0.0.1:1',
    MEILISEARCH_HOST: 'http://127.0.0.1:1',
  });
});

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { redis } from '../config/redis.js';
// Imported for its side effect: registers the global schemaVersion plugin.
// It must run before any model is compiled, exactly as in production where
// index.ts imports it ahead of the routes.
import '../config/database.js';

vi.mock('../config/redis.js', async () => {
  const { default: RedisMock } = await import('ioredis-mock');
  return {
    redis: new RedisMock(),
    disconnectRedis: vi.fn(async () => undefined),
  };
});

vi.mock('../jobs/backup.jobs.js', () => ({
  backupQueue: {},
  enqueueBackupCreate: vi.fn(),
  enqueueBackupRestore: vi.fn(),
  getMonthlyBackupSchedule: vi.fn(),
  setMonthlyBackupSchedule: vi.fn(),
  startBackupWorker: vi.fn(),
}));

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  mongoose.set('strictQuery', true);
  await mongoose.connect(mongod.getUri(), { autoIndex: true });
  // Build every registered model's indexes up front so unique-index behaviour
  // (duplicate email, employeeId, ...) is already in force when a test starts.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
});

afterEach(async () => {
  const collections = Object.values(mongoose.connection.collections);
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
  await redis.flushall();
  vi.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
