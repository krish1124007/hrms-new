import type { Server as SocketServer, Namespace, Socket } from 'socket.io';
export declare const FIELD_TRACKING_NAMESPACE = "/field-tracking";
/** Event carrying one rep's newest fix: `{ employeeId, name, lat, lng, accuracy, recordedAt }`. */
export declare const LOCATION_UPDATE_EVENT = "location:update";
/** Every `field-sales.manage` holder: they watch every rep. */
export declare const MANAGERS_ROOM = "managers:all";
/** A manager's room: updates from the reps whose `reportingManager` is `managerEmployeeId`. */
export declare function reportsRoom(managerEmployeeId: string): string;
export declare function getFieldTrackingNamespace(): Namespace | null;
/**
 * Namespace gate, after `socketAuth`: only field-sales users may watch reps.
 * Rooms follow the same visibility as `GET /field/tracking/live` —
 * `field-sales.manage` joins `managers:all` (every rep); every field user
 * with an employee record joins `reports:<their employee id>` (their direct
 * reports). Anyone else is refused with `FORBIDDEN`.
 */
export declare function fieldTrackingAccess(socket: Socket, next: (err?: Error) => void): void;
/**
 * `/field-tracking` — managers watch their reps' live locations. JWT auth
 * (active users only) then the field-sales gate above; clients never choose
 * their rooms. The ingest (`services/location-track.service.ts`) emits
 * `location:update` to `managers:all` and the rep's manager's room.
 */
export declare function registerFieldTrackingNamespace(io: SocketServer): void;
//# sourceMappingURL=field-tracking.socket.d.ts.map