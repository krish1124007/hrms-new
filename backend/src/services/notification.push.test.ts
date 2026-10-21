/**
 * createNotification hands every new notification to `sendPush` exactly once,
 * fire-and-forget: a push that rejects (or throws) never fails the caller.
 */
import { Types } from 'mongoose';
import { describe, it, expect, vi } from 'vitest';

const push = vi.hoisted(() => ({ sendPush: vi.fn() }));
vi.mock('./push.service.js', () => ({ sendPush: push.sendPush }));

import { Notification } from '../models/notification.model.js';
import { createNotification } from './notification.service.js';

describe('createNotification → sendPush', () => {
  it('calls sendPush once with the saved notification, and resolves although the push rejects', async () => {
    push.sendPush.mockRejectedValue(new Error('push exploded'));
    const userId = new Types.ObjectId().toHexString();

    await expect(
      createNotification({
        userId,
        type: 'leave_request',
        title: 'Leave approved',
        message: 'Your leave on 10 Mar was approved',
        link: '/leave/my',
      }),
    ).resolves.toBeUndefined();

    const saved = await Notification.findOne({ userId }).lean().orFail();
    expect(push.sendPush).toHaveBeenCalledTimes(1);
    expect(push.sendPush).toHaveBeenCalledWith(userId, {
      title: 'Leave approved',
      body: 'Your leave on 10 Mar was approved',
      data: { type: 'leave_request', link: '/leave/my', notificationId: String(saved._id) },
    });
  });

  it('resolves when sendPush throws synchronously', async () => {
    push.sendPush.mockImplementation(() => {
      throw new Error('not even a promise');
    });
    const userId = new Types.ObjectId().toHexString();

    await expect(
      createNotification({ userId, type: 'system_alert', title: 'Hi', message: 'There' }),
    ).resolves.toBeUndefined();
    expect(await Notification.countDocuments({ userId })).toBe(1);
  });

  it('does not push when the notification could not be saved', async () => {
    push.sendPush.mockResolvedValue({ sent: 0, removed: 0 });

    // No title: the model refuses it; createNotification logs and resolves.
    await createNotification({
      userId: new Types.ObjectId().toHexString(),
      type: 'system_alert',
      title: '',
      message: 'x',
    });

    expect(push.sendPush).not.toHaveBeenCalled();
  });
});
