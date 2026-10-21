/**
 * FCM push: every in-app notification also goes to the user's registered
 * devices. firebase-admin is mocked — no network, no real credentials.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Types } from 'mongoose';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fcm = vi.hoisted(() => ({
  send: vi.fn(),
  initializeApp: vi.fn(),
  getMessaging: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: fcm.initializeApp,
  cert: (serviceAccount: unknown) => ({ serviceAccount }),
  getApps: () => [],
}));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: fcm.getMessaging }));

import { env } from '../config/env.js';
import { createApp } from '../app.js';
import { createUser } from '../test/factories.js';
import { PushDevice } from '../models/push-device.model.js';
import { Notification } from '../models/notification.model.js';
import { sendPush } from './push.service.js';
import { createNotification } from './notification.service.js';

const serviceAccountFiles: string[] = [];

/** A fake service-account file; a fresh path per test means a fresh Firebase init. */
function configurePush(): void {
  const file = path.join(os.tmpdir(), `fcm-test-${randomUUID()}.json`);
  fs.writeFileSync(file, JSON.stringify({ project_id: 'dhrms-test', client_email: 'x@y.z', private_key: 'k' }));
  serviceAccountFiles.push(file);
  env.FIREBASE_SERVICE_ACCOUNT_PATH = file;
}

/** FCM's answer: every token delivered, unless `failures` names its error code. */
function fcmAccepts(failures: Record<string, string> = {}): void {
  fcm.send.mockImplementation(async ({ tokens }: { tokens: string[] }) => {
    const responses = tokens.map((token) =>
      failures[token] ? { success: false, error: { code: failures[token] } } : { success: true },
    );
    return { successCount: responses.filter((r) => r.success).length, responses };
  });
}

const device = (userId: unknown, token: string) =>
  PushDevice.create({ userId, token, platform: 'android' });

const message = (notificationId = new Types.ObjectId().toHexString()) => ({
  title: 'Leave approved',
  body: 'Your leave on 10 Mar was approved',
  data: { type: 'leave_request', link: '/leave/my', notificationId },
});

const userId = () => new Types.ObjectId().toHexString();

beforeEach(() => {
  fcm.initializeApp.mockImplementation((_options: unknown, name: string) => ({ name }));
  fcm.getMessaging.mockImplementation(() => ({ sendEachForMulticast: fcm.send }));
  fcmAccepts();
});

afterEach(() => {
  env.FIREBASE_SERVICE_ACCOUNT_PATH = undefined;
  for (const file of serviceAccountFiles.splice(0)) fs.rmSync(file, { force: true });
});

describe('sendPush', () => {
  it('is a no-op when Firebase is not configured — no messaging call at all', async () => {
    const who = userId();
    await device(who, 'token-aaaaaaaaaaaaaaaa');

    expect(await sendPush(who, message())).toEqual({ sent: 0, removed: 0 });
    expect(fcm.getMessaging).not.toHaveBeenCalled();
    expect(fcm.send).not.toHaveBeenCalled();
  });

  it("sends one multicast to every one of the user's devices, with the link and notification id", async () => {
    configurePush();
    const who = userId();
    await device(who, 'token-phone-0000000001');
    await device(who, 'token-tablet-000000002');
    await device(userId(), 'token-someone-else-003');
    const msg = message();

    const result = await sendPush(who, msg);

    expect(result).toEqual({ sent: 2, removed: 0 });
    expect(fcm.send).toHaveBeenCalledTimes(1);
    const sent = fcm.send.mock.calls[0]![0];
    expect([...sent.tokens].sort()).toEqual(['token-phone-0000000001', 'token-tablet-000000002']);
    expect(sent.notification).toEqual({ title: msg.title, body: msg.body });
    expect(sent.data).toEqual({ type: 'leave_request', link: '/leave/my', notificationId: msg.data.notificationId });
  });

  it('removes the devices FCM reports as dead, and keeps the rest', async () => {
    configurePush();
    const who = userId();
    await device(who, 'token-good-00000000001');
    await device(who, 'token-gone-00000000002');
    await device(who, 'token-junk-00000000003');
    await device(who, 'token-flaky-0000000004');
    fcmAccepts({
      'token-gone-00000000002': 'messaging/registration-token-not-registered',
      'token-junk-00000000003': 'messaging/invalid-registration-token',
      // A passing failure: the token itself is fine.
      'token-flaky-0000000004': 'messaging/internal-error',
    });

    expect(await sendPush(who, message())).toEqual({ sent: 1, removed: 2 });

    const left = (await PushDevice.find({ userId: who }).lean()).map((d) => d.token).sort();
    expect(left).toEqual(['token-flaky-0000000004', 'token-good-00000000001']);
  });

  it('sends in batches of 500 tokens', async () => {
    configurePush();
    const who = new Types.ObjectId();
    await PushDevice.insertMany(
      Array.from({ length: 501 }, (_, i) => ({ userId: who, token: `token-bulk-${String(i).padStart(6, '0')}`, platform: 'ios' })),
    );

    expect(await sendPush(who.toHexString(), message())).toEqual({ sent: 501, removed: 0 });
    expect(fcm.send.mock.calls.map(([arg]) => arg.tokens.length)).toEqual([500, 1]);
  });

  it('never throws: a failing FCM call or an unreadable service account resolves to nothing sent', async () => {
    configurePush();
    const who = userId();
    await device(who, 'token-aaaaaaaaaaaaaaaa');
    fcm.send.mockRejectedValue(new Error('FCM is down'));
    await expect(sendPush(who, message())).resolves.toEqual({ sent: 0, removed: 0 });

    env.FIREBASE_SERVICE_ACCOUNT_PATH = path.join(os.tmpdir(), `missing-${randomUUID()}.json`);
    await expect(sendPush(who, message())).resolves.toEqual({ sent: 0, removed: 0 });
    expect(await PushDevice.countDocuments({ userId: who })).toBe(1);
  });
});

describe('createNotification pushes', () => {
  it('pushes the new notification once to the recipient, with its id and link', async () => {
    configurePush();
    const who = userId();
    await device(who, 'token-aaaaaaaaaaaaaaaa');

    await createNotification({
      userId: who,
      type: 'decision',
      title: 'Expense approved',
      message: 'Your claim of ₹500 was approved',
      link: '/expenses/my',
    });

    await vi.waitFor(() => expect(fcm.send).toHaveBeenCalledTimes(1));
    const saved = await Notification.findOne({ userId: who }).lean().orFail();
    const sent = fcm.send.mock.calls[0]![0];
    expect(sent.notification).toEqual({ title: 'Expense approved', body: 'Your claim of ₹500 was approved' });
    expect(sent.data).toEqual({ type: 'decision', link: '/expenses/my', notificationId: String(saved._id) });
  });

  it('still resolves, with the notification saved, when the push fails', async () => {
    configurePush();
    const who = userId();
    await device(who, 'token-aaaaaaaaaaaaaaaa');
    fcm.send.mockRejectedValue(new Error('FCM is down'));

    await expect(
      createNotification({ userId: who, type: 'system_alert', title: 'Hello', message: 'World' }),
    ).resolves.toBeUndefined();

    await vi.waitFor(() => expect(fcm.send).toHaveBeenCalledTimes(1));
    expect(await Notification.countDocuments({ userId: who })).toBe(1);
  });
});

describe('POST /notifications/devices', () => {
  it('upserts by token and re-binds a token to whoever registers it last', async () => {
    const app = createApp();
    const first = await createUser({ roleSlug: 'employee' });
    const second = await createUser({ roleSlug: 'employee' });
    const token = 'fcm-token-shared-phone-0001';

    const one = await request(app)
      .post('/api/v1/notifications/devices')
      .set({ Authorization: `Bearer ${first.token}` })
      .send({ token, platform: 'android' });
    expect(one.status).toBe(200);
    const two = await request(app)
      .post('/api/v1/notifications/devices')
      .set({ Authorization: `Bearer ${second.token}` })
      .send({ token, platform: 'android' });
    expect(two.status).toBe(200);

    const rows = await PushDevice.find({ token }).lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.userId)).toBe(String(second.user._id));

    // Only the device's current owner can unregister it.
    await request(app)
      .delete(`/api/v1/notifications/devices/${token}`)
      .set({ Authorization: `Bearer ${first.token}` });
    expect(await PushDevice.countDocuments({ token })).toBe(1);
    const gone = await request(app)
      .delete(`/api/v1/notifications/devices/${token}`)
      .set({ Authorization: `Bearer ${second.token}` });
    expect(gone.status).toBe(200);
    expect(await PushDevice.countDocuments({ token })).toBe(0);
  });
});
