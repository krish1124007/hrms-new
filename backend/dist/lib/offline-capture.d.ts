/** Arriving later than this after capture marks a write `syncedLate`. */
export declare const SYNCED_LATE_AFTER_MS: number;
/**
 * The instant an action happened: `capturedAt` (a Date or ISO string) when
 * acceptable, the server's `now` when absent. A time ahead of `now` (clock
 * slack, or a phone clock running minutes or hours fast) is not honoured: the
 * action counts as captured at `now`. 400 `CAPTURED_AT_INVALID` when it is
 * unparseable or more than `settings.offlineMaxAgeDays` days old.
 */
export declare function acceptCapturedAt(capturedAt: Date | string | null | undefined, settings: {
    offlineMaxAgeDays: number;
}, now?: Date): Date;
/** True when a write captured at `capturedAt` reached the server more than 15 min later. */
export declare function isSyncedLate(capturedAt: Date, receivedAt: Date): boolean;
/**
 * `{ capturedAt, receivedAt, syncedLate }` for a write: the accepted capture
 * time, the server time it arrived, and whether it arrived late. A write
 * without `capturedAt` is captured "now" and never late.
 */
export declare function captureTimes(capturedAt: Date | string | null | undefined, settings: {
    offlineMaxAgeDays: number;
}, now?: Date): {
    capturedAt: Date;
    receivedAt: Date;
    syncedLate: boolean;
};
//# sourceMappingURL=offline-capture.d.ts.map