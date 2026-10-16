import { type ClientSession } from 'mongoose';
export declare function withTransaction<T>(fn: (session: ClientSession | undefined) => Promise<T>): Promise<T>;
//# sourceMappingURL=transaction.d.ts.map