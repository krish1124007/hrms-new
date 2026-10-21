/**
 * Named monotonic counters (`lib/sequence.ts`). One document per key, e.g.
 * `RCPT-2026` → `{ seq: 42 }`. Never decremented and never reset, so a number
 * handed out once is never handed out again — whatever happens to the record
 * that carried it.
 */
export interface ICounter {
    _id: string;
    seq: number;
}
export declare const Counter: import("mongoose").Model<ICounter, {}, {}, {}, import("mongoose").Document<unknown, {}, ICounter, {}, {}> & ICounter & Required<{
    _id: string;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=counter.model.d.ts.map