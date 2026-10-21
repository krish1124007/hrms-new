import { Schema, model } from 'mongoose';

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

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { versionKey: false, collection: 'counters' },
);

export const Counter = model<ICounter>('Counter', counterSchema);
