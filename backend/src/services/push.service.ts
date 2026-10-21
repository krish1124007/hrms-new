/**
 * Push notifications through Firebase Cloud Messaging (FCM).
 *
 * Every in-app notification is also pushed to the user's registered devices
 * (`PushDevice`, registered by the mobile app through
 * `POST /notifications/devices`). Configured by `FIREBASE_SERVICE_ACCOUNT_PATH`
 * — the path to a Firebase service-account JSON. Unset, push is a silent
 * no-op and firebase-admin is never even loaded.
 *
 * A courtesy, never a failure: `sendPush` never throws. Tokens FCM reports as
 * dead (app uninstalled, token rotated) are deleted so they stop costing a
 * request on every notification.
 */
import fs from 'node:fs';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { PushDevice } from '../models/push-device.model.js';

export interface PushMessage {
  title: string;
  body: string;
  /** Delivered to the app with the push, as strings: what to open on tap. */
  data: { type: string; link?: string; notificationId: string };
}

export interface PushResult {
  /** Devices FCM accepted the message for. */
  sent: number;
  /** Dead tokens deleted from the registry. */
  removed: number;
}

/** The slice of firebase-admin's `Messaging` this service uses. */
interface MulticastSender {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data: Record<string, string>;
    android: { priority: 'high' };
    apns: { payload: { aps: { sound: string } } };
  }): Promise<{
    successCount: number;
    responses: Array<{ success: boolean; error?: { code?: string; message?: string } }>;
  }>;
}

/** FCM accepts at most 500 tokens per multicast. */
const MULTICAST_LIMIT = 500;

/**
 * Error codes meaning the token will never work again: unregistered,
 * malformed, or issued for another Firebase project (`sender-id-mismatch` —
 * e.g. a build pointed at a different project).
 */
const DEAD_TOKEN_CODES = new Set([
  'registration-token-not-registered',
  'invalid-registration-token',
  'mismatched-credential',
  'sender-id-mismatch',
]);

/**
 * True when one device's send failed because of its token. `invalid-argument`
 * is about the token only when FCM says so ("…registration token…"); the
 * same code for a bad payload would fail every device and must not delete
 * any of them.
 */
function isDeadToken(error: { code?: string; message?: string } | undefined): boolean {
  const code = error?.code?.replace(/^messaging\//, '');
  if (!code) return false;
  if (DEAD_TOKEN_CODES.has(code)) return true;
  return code === 'invalid-argument' && /registration token/i.test(error?.message ?? '');
}

const NOTHING_SENT: PushResult = { sent: 0, removed: 0 };

/**
 * The Firebase app, initialised once per service-account path (lazily, on the
 * first push). A path that cannot be read or used is logged once and push
 * stays off — it never breaks the notification that triggered it.
 */
let cached: { path: string; sender: Promise<MulticastSender | null> } | null = null;

async function initSender(path: string): Promise<MulticastSender | null> {
  try {
    const serviceAccount = JSON.parse(await fs.promises.readFile(path, 'utf8')) as Record<string, unknown>;
    const { initializeApp, cert, getApps } = await import('firebase-admin/app');
    const { getMessaging } = await import('firebase-admin/messaging');
    const name = `dhrms-push:${path}`;
    const app =
      getApps().find((existing) => existing.name === name) ??
      initializeApp({ credential: cert(serviceAccount) }, name);
    logger.info('push: Firebase Cloud Messaging configured');
    return getMessaging(app) as unknown as MulticastSender;
  } catch (err) {
    logger.error({ err, path }, 'push: could not initialise Firebase — push notifications are off');
    return null;
  }
}

function sender(): Promise<MulticastSender | null> {
  const path = env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!path) return Promise.resolve(null);
  if (cached?.path !== path) cached = { path, sender: initSender(path) };
  return cached.sender;
}

/** FCM data payload values must be strings; absent keys are left out. */
function dataPayload(data: PushMessage['data']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== null) out[key] = String(value);
  }
  return out;
}

/**
 * Push `msg` to every device registered to `userId`. Resolves to how many
 * devices FCM accepted it for and how many dead tokens were removed;
 * `{ sent: 0, removed: 0 }` when push is not configured or the user has no
 * device. Never throws.
 */
export async function sendPush(userId: string, msg: PushMessage): Promise<PushResult> {
  try {
    const fcm = await sender();
    if (!fcm) return NOTHING_SENT;

    const devices = await PushDevice.find({ userId }).select('token').lean().exec();
    const tokens = devices.map((device) => device.token);
    if (tokens.length === 0) return NOTHING_SENT;

    let sent = 0;
    const dead: string[] = [];
    for (let i = 0; i < tokens.length; i += MULTICAST_LIMIT) {
      const batch = tokens.slice(i, i + MULTICAST_LIMIT);
      // eslint-disable-next-line no-await-in-loop
      const response = await fcm.sendEachForMulticast({
        tokens: batch,
        notification: { title: msg.title, body: msg.body },
        data: dataPayload(msg.data),
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default' } } },
      });
      sent += response.successCount;
      response.responses.forEach((result, index) => {
        if (!result.success && isDeadToken(result.error)) dead.push(batch[index]!);
      });
    }

    let removed = 0;
    if (dead.length > 0) {
      const deletion = await PushDevice.deleteMany({ token: { $in: dead } }).exec();
      removed = deletion.deletedCount ?? 0;
    }
    return { sent, removed };
  } catch (err) {
    logger.warn({ err, userId }, 'push: sending failed');
    return NOTHING_SENT;
  }
}
