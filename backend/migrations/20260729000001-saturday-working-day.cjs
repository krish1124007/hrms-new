/**
 * Make Saturday a working day on existing shifts.
 *
 * The week-off rule is now Sunday + the 4th Saturday of the month, applied in
 * code (`src/lib/week-off.ts`). Shifts created before that still carry
 * `workDays: [1,2,3,4,5]`, which would keep every Saturday off for those
 * employees. This adds Saturday (6) to any shift that works the full Mon–Fri
 * week, leaving genuinely part-week shifts alone.
 *
 * Run with:  npx migrate-mongo up
 */

const MON_TO_FRI = [1, 2, 3, 4, 5];

function sorted(days) {
  return [...days].sort((a, b) => a - b);
}

function isMonToFri(days) {
  return (
    Array.isArray(days) &&
    days.length === 5 &&
    sorted(days).every((d, i) => d === MON_TO_FRI[i])
  );
}

module.exports = {
  async up(db) {
    const shifts = await db.collection('shifts').find({}).toArray();
    for (const shift of shifts) {
      if (!isMonToFri(shift.workDays)) continue;
      await db
        .collection('shifts')
        .updateOne({ _id: shift._id }, { $set: { workDays: [1, 2, 3, 4, 5, 6] } });
    }
  },

  async down(db) {
    // Reverse only the shifts this migration could have touched: full Mon–Sat.
    const shifts = await db.collection('shifts').find({}).toArray();
    for (const shift of shifts) {
      const days = shift.workDays;
      if (!Array.isArray(days) || days.length !== 6) continue;
      if (!sorted(days).every((d, i) => d === [1, 2, 3, 4, 5, 6][i])) continue;
      await db
        .collection('shifts')
        .updateOne({ _id: shift._id }, { $set: { workDays: MON_TO_FRI } });
    }
  },
};
