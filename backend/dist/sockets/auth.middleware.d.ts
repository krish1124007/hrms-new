import type { Socket } from 'socket.io';
export interface AuthedSocketData {
    userId: string;
    role?: string;
    jti?: string;
    /** Role permissions + the user's custom permissions, as at the handshake. */
    permissions: string[];
    /** The user's Employee `_id`, or null when they have no employee record. */
    employeeId: string | null;
}
/**
 * Socket handshake auth — the same checks as the HTTP `authMiddleware`: a
 * valid, unrevoked access token whose session is current, for a user that
 * still exists and is `active`. Rejections carry a stable code as the error
 * message (`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_REVOKED`,
 * `SESSION_INVALIDATED`, `USER_INACTIVE`).
 */
export declare function socketAuth(socket: Socket, next: (err?: Error) => void): Promise<void>;
export declare function getAuthed(socket: Socket): AuthedSocketData;
/** Same rule as `requirePermission`: the admin wildcard `*` passes. */
export declare function socketHasPermission(data: AuthedSocketData, perm: string): boolean;
//# sourceMappingURL=auth.middleware.d.ts.map