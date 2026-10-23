/**
 * Field Visits engine: visits reshaped to the visit contract, and the indexes
 * the engine relies on. (`autoIndex` is off in production, so an index a
 * model declares does not exist there until a migration builds it.)
 *
 *  1. Legacy visits (written before the visit engine; production had none)
 *     are reshaped, each field only when it is there:
 *       status `scheduled` → `planned` (plannedDate = the IST day it was
 *       created, when missing); purpose service → Maintenance, followup →
 *       Meeting, delivery → Installation, collection / other → Other;
 *       locationMismatch → flags.awayFromSite, locationMissing → flags.noGps,
 *       metadata.autoClosed → flags.autoClosed (missing flags → all false);
 *       distanceFromClientM → checkIn.distanceM; duration → durationMinutes;
 *       photos / outcome (positive → completed, followup_required →
 *       follow_up, others → other) / nextFollowUpDate / meetingWith / the
 *       check-out notes → a `report` (when the visit has none). The legacy
 *       fields and `isPlanned` are then removed.
 *  2. `day` (the visit's IST business day: check-in, else planned date, else
 *     creation) is filled in where missing.
 *  3. The one-open-visit index becomes per employee AND day (an offline
 *     replay of an older day may land while today's visit is open). Stops
 *     before dropping anything if an employee has two open visits on one
 *     day, listing them.
 *  4. Indexes:
 *       visits          employee_clientRef_unique { employeeId, clientRef }
 *                       (unique, partial clientRef string),
 *                       one_open_visit_per_employee_day { employeeId, day }
 *                       (unique, partial in_progress & not deleted),
 *                       schedule_date_unique { scheduleId, plannedDate }
 *                       (unique, partial scheduleId set),
 *                       followUpOf_unique (unique, partial),
 *                       { siteId: 1, 'checkIn.time': -1 }, { status: 1, plannedDate: 1 },
 *                       { employeeId: 1, day: -1 }
 *       visitschedules  { employeeId: 1 }, { isDeleted: 1 }
 *     (`checkIn.time` holds the check-in instant — served as `checkIn.at`.)
 *
 * Idempotent: re-running after a failure (or twice) is safe.
 *
 * down(): drops the indexes above and restores one_open_visit_per_employee
 * (skipped, with a warning, if an employee now has two open visits); copies
 * flags / durationMinutes / checkIn.distanceM back to the legacy names and
 * turns `planned` / `missed` back into `scheduled`. The new fields and the
 * reports stay (they are additive); renamed purposes are not restored.
 *
 * Run with:  npx migrate-mongo up -f migrate-mongo-config.cjs
 */

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';

const PURPOSES = { service: 'Maintenance', followup: 'Meeting', delivery: 'Installation', collection: 'Other', other: 'Other' };
const OUTCOMES = { positive: 'completed', followup_required: 'follow_up', negative: 'other', neutral: 'other' };
const FLAG_KEYS = ['awayFromSite', 'noGps', 'noSelfie', 'shortVisit', 'autoClosed', 'syncedLate', 'capturedOffline'];
const LEGACY_FIELDS = [
  'locationMismatch',
  'locationMissing',
  'distanceFromClientM',
  'duration',
  'isPlanned',
  'outcome',
  'nextFollowUpDate',
  'meetingWith',
  'photos',
  'metadata',
];

const OPEN_INDEX = 'one_open_visit_per_employee_day';
const OLD_OPEN_INDEX = 'one_open_visit_per_employee';

const INDEXES = [
  ['visits', { employeeId: 1, clientRef: 1 }, { name: 'employee_clientRef_unique', unique: true, partialFilterExpression: { clientRef: { $type: 'string' } } }],
  ['visits', { employeeId: 1, day: 1 }, { name: OPEN_INDEX, unique: true, partialFilterExpression: { status: 'in_progress', isDeleted: false } }],
  ['visits', { scheduleId: 1, plannedDate: 1 }, { name: 'schedule_date_unique', unique: true, partialFilterExpression: { scheduleId: { $type: 'objectId' } } }],
  ['visits', { followUpOf: 1 }, { name: 'followUpOf_unique', unique: true, partialFilterExpression: { followUpOf: { $type: 'objectId' } } }],
  ['visits', { siteId: 1, 'checkIn.time': -1 }, { name: 'siteId_1_checkIn.time_-1' }],
  ['visits', { status: 1, plannedDate: 1 }, { name: 'status_1_plannedDate_1' }],
  ['visits', { employeeId: 1, day: -1 }, { name: 'employeeId_1_day_-1' }],
  ['visitschedules', { employeeId: 1 }, { name: 'employeeId_1' }],
  ['visitschedules', { isDeleted: 1 }, { name: 'isDeleted_1' }],
];

async function indexesOf(col) {
  try {
    return await col.indexes();
  } catch (err) {
    if (err && err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Build `key` as `options.name` unless an equivalent index exists; rebuild a same-named different one. */
async function ensureIndex(db, collection, key, options) {
  const col = db.collection(collection);
  const existing = await indexesOf(col);
  const same = (ix) =>
    sameJson(ix.key, key) &&
    Boolean(ix.unique) === Boolean(options.unique) &&
    sameJson(ix.partialFilterExpression, options.partialFilterExpression);
  if (existing.some(same)) return;
  if (existing.some((ix) => ix.name === options.name)) await col.dropIndex(options.name);
  try {
    await col.createIndex(key, options);
  } catch (err) {
    // The same key under another name with other options — replace it with ours.
    if (!err || (err.code !== 85 && err.code !== 86)) throw err;
    const clash = (await indexesOf(col)).find((ix) => sameJson(ix.key, key) && ix.name !== '_id_');
    if (!clash) throw err;
    await col.dropIndex(clash.name);
    await col.createIndex(key, options);
  }
}

async function dropIndexIfPresent(db, collection, name) {
  const col = db.collection(collection);
  if ((await indexesOf(col)).some((ix) => ix.name === name)) await col.dropIndex(name);
}

/** The business-day label (UTC midnight of the IST calendar date) of `d`. */
function dayLabel(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** $set / $unset reshaping one legacy visit (see the header, step 1). */
function reshape(v) {
  const $set = {};
  if (v.status === 'scheduled') {
    $set.status = 'planned';
    if (!v.plannedDate) $set.plannedDate = dayLabel(v.createdAt) ?? dayLabel(new Date());
  }
  if (typeof v.purpose === 'string' && PURPOSES[v.purpose]) $set.purpose = PURPOSES[v.purpose];

  const flags = {};
  for (const k of FLAG_KEYS) flags[k] = Boolean(v.flags && v.flags[k]);
  if (v.locationMismatch) flags.awayFromSite = true;
  if (v.locationMissing) flags.noGps = true;
  if (v.metadata && v.metadata.autoClosed) flags.autoClosed = true;
  $set.flags = flags;

  if (typeof v.distanceFromClientM === 'number' && v.checkIn && v.checkIn.distanceM === undefined) {
    $set['checkIn.distanceM'] = v.distanceFromClientM;
  }
  if (typeof v.duration === 'number' && v.durationMinutes === undefined) $set.durationMinutes = v.duration;

  const photos = Array.isArray(v.photos) ? v.photos.filter((p) => typeof p === 'string') : [];
  const hasReportData = photos.length > 0 || v.outcome || v.nextFollowUpDate || v.meetingWith;
  if (!v.report && hasReportData) {
    const report = {
      notes: (v.checkOut && v.checkOut.notes) || '',
      photos,
      documents: [],
      peopleMet: typeof v.meetingWith === 'string' && v.meetingWith.trim() ? [{ name: v.meetingWith.trim() }] : [],
      submittedAt: (v.checkOut && v.checkOut.time) || v.updatedAt || v.createdAt || new Date(),
    };
    if (OUTCOMES[v.outcome]) report.outcome = OUTCOMES[v.outcome];
    if (v.nextFollowUpDate instanceof Date) report.followUpDate = dayLabel(v.nextFollowUpDate);
    $set.report = report;
  }

  const $unset = {};
  for (const f of LEGACY_FIELDS) if (v[f] !== undefined) $unset[f] = '';
  return Object.keys($unset).length > 0 ? { $set, $unset } : { $set };
}

async function reshapeLegacyVisits(db) {
  const visits = db.collection('visits');
  const legacy = {
    $or: [
      { status: 'scheduled' },
      { purpose: { $in: Object.keys(PURPOSES) } },
      { flags: { $exists: false } },
      ...LEGACY_FIELDS.map((f) => ({ [f]: { $exists: true } })),
    ],
  };
  let changed = 0;
  let ops = [];
  for await (const v of visits.find(legacy)) {
    ops.push({ updateOne: { filter: { _id: v._id }, update: reshape(v) } });
    if (ops.length === 500) {
      // eslint-disable-next-line no-await-in-loop
      changed += (await visits.bulkWrite(ops, { ordered: false })).modifiedCount;
      ops = [];
    }
  }
  if (ops.length > 0) changed += (await visits.bulkWrite(ops, { ordered: false })).modifiedCount;
  return changed;
}

async function backfillDays(db) {
  const res = await db.collection('visits').updateMany({ day: { $exists: false } }, [
    {
      $set: {
        day: {
          $dateFromString: {
            dateString: {
              $dateToString: {
                format: '%Y-%m-%d',
                timezone: TZ,
                date: { $ifNull: ['$checkIn.time', { $ifNull: ['$plannedDate', '$createdAt'] }] },
              },
            },
            timezone: 'UTC',
            onNull: null,
          },
        },
      },
    },
  ]);
  return res.modifiedCount;
}

/** Employees with two open visits on one day — the per-day index cannot be built over them. */
async function openVisitClashes(db) {
  return db
    .collection('visits')
    .aggregate([
      { $match: { status: 'in_progress', isDeleted: false } },
      { $group: { _id: { employeeId: '$employeeId', day: '$day' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
}

module.exports = {
  async up(db) {
    const reshaped = await reshapeLegacyVisits(db);
    const days = await backfillDays(db);

    const clashes = await openVisitClashes(db);
    if (clashes.length > 0) {
      throw new Error(
        `Employees with two open visits on the same day — close one of each pair first (nothing was dropped):\n  ${clashes
          .map((c) => `employee ${c._id.employeeId}: visits ${c.ids.join(', ')}`)
          .join('\n  ')}`,
      );
    }
    for (const [collection, key, options] of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await ensureIndex(db, collection, key, options);
    }
    await dropIndexIfPresent(db, 'visits', OLD_OPEN_INDEX);

    // eslint-disable-next-line no-console
    console.log(`field visits engine: ${reshaped} legacy visit(s) reshaped, ${days} day(s) filled in; indexes built`);
  },

  async down(db) {
    for (const [collection, , options] of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await dropIndexIfPresent(db, collection, options.name);
    }
    const visits = db.collection('visits');
    await visits.updateMany({ flags: { $exists: true } }, [
      {
        $set: {
          locationMismatch: { $ifNull: ['$flags.awayFromSite', false] },
          locationMissing: { $ifNull: ['$flags.noGps', false] },
        },
      },
    ]);
    await visits.updateMany({ durationMinutes: { $exists: true } }, [{ $set: { duration: '$durationMinutes' } }]);
    await visits.updateMany({ 'checkIn.distanceM': { $exists: true } }, [{ $set: { distanceFromClientM: '$checkIn.distanceM' } }]);
    await visits.updateMany({ status: { $in: ['planned', 'missed'] } }, { $set: { status: 'scheduled' } });
    try {
      await visits.createIndex(
        { employeeId: 1 },
        { name: OLD_OPEN_INDEX, unique: true, partialFilterExpression: { status: 'in_progress', isDeleted: false } },
      );
    } catch (err) {
      if (!err || err.code !== 11000) throw err;
      // eslint-disable-next-line no-console
      console.warn(`${OLD_OPEN_INDEX} not restored: an employee has more than one open visit`);
    }
  },
};
