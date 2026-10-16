import type { Socket } from 'socket.io';
export interface AuthedSocketData {
    userId: string;
    role?: string;
    jti?: string;
}
export declare function socketAuth(socket: Socket, next: (err?: Error) => void): Promise<void>;
export declare function getAuthed(socket: Socket): AuthedSocketData;
//# sourceMappingURL=auth.middleware.d.ts.map