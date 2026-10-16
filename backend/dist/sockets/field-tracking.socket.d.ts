import type { Server as SocketServer, Namespace } from 'socket.io';
export declare function getFieldTrackingNamespace(): Namespace | null;
/**
 * /field-tracking namespace — admins watch live location updates for their
 * own tenant. JWT is required; the client no longer sends its own tenantId.
 * The auth middleware auto-joins `tenant:${tenantId}` so the HTTP ingest
 * endpoint's emit is only delivered to same-tenant dashboards.
 */
export declare function registerFieldTrackingNamespace(io: SocketServer): void;
//# sourceMappingURL=field-tracking.socket.d.ts.map