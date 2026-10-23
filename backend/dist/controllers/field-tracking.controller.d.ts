import type { Request, Response } from 'express';
/**
 * Continuous location tracking is gone (scope §8, decision 7): locations are
 * recorded only at check-in and check-out — attendance day in/out and visit
 * in/out. The team map reads `GET /field/team/status` and
 * `GET /field/route/:employeeId`.
 *
 * `POST /field/tracking/batch` and `POST /attendance/tracking/batch` stay for
 * app builds that still upload a location queue: they answer 200
 * `{ ignored: true }` for any body and store nothing, so those apps neither
 * fail nor retry.
 */
export declare function ignoreTrackingBatch(_req: Request, res: Response): void;
//# sourceMappingURL=field-tracking.controller.d.ts.map