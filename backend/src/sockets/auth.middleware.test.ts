/**
 * Socket handshake auth: the same checks as the HTTP auth middleware (a
 * valid token for an active user), and the socket joins its user's room.
 */
import { describe, it, expect } from 'vitest';
import { createUser } from '../test/factories.js';
import { User } from '../models/user.model.js';
import { socketAuth } from './auth.middleware.js';

interface FakeSocket {
  id: string;
  handshake: { auth: Record<string, unknown> };
  data: Record<string, unknown>;
  joined: string[];
  join(room: string | string[]): void;
}

function fakeSocket(token?: string): FakeSocket {
  const joined: string[] = [];
  return {
    id: 'socket-1',
    handshake: { auth: token ? { token } : {} },
    data: {},
    joined,
    join(room) {
      joined.push(...[room].flat());
    },
  };
}

function handshake(socket: FakeSocket): Promise<Error | undefined> {
  return new Promise((resolve) => {
    void socketAuth(socket as never, (err?: Error) => resolve(err));
  });
}

describe('socketAuth', () => {
  it('accepts an active user and joins their room; rejects them once inactive', async () => {
    const { user, token } = await createUser({ roleSlug: 'employee' });
    const ok = fakeSocket(token);
    expect(await handshake(ok)).toBeUndefined();
    expect(ok.data.userId).toBe(String(user._id));
    expect(ok.joined).toContain(`user:${String(user._id)}`);

    await User.updateOne({ _id: user._id }, { $set: { status: 'inactive' } });
    expect((await handshake(fakeSocket(token)))?.message).toBe('USER_INACTIVE');
  });

  it('refuses a handshake without a token', async () => {
    expect((await handshake(fakeSocket()))?.message).toBe('UNAUTHORIZED');
  });
});
