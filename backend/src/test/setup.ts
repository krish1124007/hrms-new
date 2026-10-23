/**
 * Vitest setup — runs before every test file.
 *
 *  - Pins a deterministic, valid environment BEFORE any app module is loaded
 *    (config/env.ts parses process.env at import time and exits on failure).
 *  - Replaces Redis with ioredis-mock and stubs the BullMQ backup,
 *    attendance and field jobs, so no test ever needs a Redis server or
 *    opens a queue connection.
 *  - Boots an in-memory MongoDB and connects mongoose to it for the file's
 *    lifetime, wiping every collection (and the fake Redis) after each test.
 */
import { vi, beforeAll, afterAll, afterEach } from 'vitest';

// vi.hoisted runs ahead of the (hoisted) static imports below, which is the
// only place env can be set early enough for config/env.ts. It is awaited so
// the assignments are guaranteed to have landed before any app module loads.
await vi.hoisted(async () => {
  const os = await import('node:os');
  const path = await import('node:path');
  const fs = await import('node:fs');

  const uploadDir = path.join(os.tmpdir(), 'hrms-test-uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  // Created on demand by the code under test; never inside the upload root.
  const backupDir = path.join(os.tmpdir(), 'hrms-test-backups');

  Object.assign(process.env, {
    NODE_ENV: 'test',
    LOG_LEVEL: 'error',
    JWT_SECRET: 'test-jwt-secret-0123456789abcdef0123456789abcdef',
    JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdef0123456789ab',
    ENCRYPTION_KEY: 'test-encryption-key-0123456789abcdef0123456789ab',
    UPLOAD_DIR: uploadDir,
    BACKUP_DIR: backupDir,
    CORS_ORIGIN: 'http://localhost:5173',
    // Blank (not merely unset) so a developer's .env can never switch the
    // email service from its dev/no-op transport to Resend or real SMTP.
    RESEND_API_KEY: '',
    SMTP_HOST: '',
    SMTP_USER: '',
    SMTP_PASS: '',
    // Never let a test reach a developer's real Redis or Meilisearch.
    REDIS_URL: 'redis://127.0.0.1:1',
    MEILISEARCH_HOST: 'http://127.0.0.1:1',
    // Blank: push stays off, so a developer's Firebase service account in
    // .env can never send a real notification from a test.
    FIREBASE_SERVICE_ACCOUNT_PATH: '',
    // Blank: no test ever calls Google with a developer's real Maps key.
    GOOGLE_MAPS_API_KEY: '',
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
  // The real module has two clients (BullMQ's `redis`, the fail-fast request
  // path `redisApp`); in tests both are the SAME in-memory instance, so a
  // value written through one is visible through the other.
  const client = new RedisMock();
  return {
    redis: client,
    redisApp: client,
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

vi.mock('../jobs/attendance.jobs.js', () => ({
  attendanceQueue: {},
  startAttendanceWorker: vi.fn(),
  // Resolves like the real one, so `ensureAttendanceSchedules().catch(...)` is safe.
  ensureAttendanceSchedules: vi.fn(async () => undefined),
}));

vi.mock('../jobs/field.jobs.js', () => ({
  fieldQueue: {},
  startFieldWorker: vi.fn(),
  ensureFieldSchedules: vi.fn(async () => undefined),
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
