import { z } from 'zod';
import { Employee } from '../models/employee.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { fieldScope, scopeFilter } from '../lib/field-scope.js';
import { objectIdString } from '../lib/field-utils.js';
import { getFieldSettings } from '../services/field-settings.service.js';
import { VISIT_SITE_POPULATE, dateKeySchema, dayKey, dayPointsOf, dayRoute, daysBetween, fieldDay, fixOf, istDate, loadFieldDays, measureDays, metresToKm, publicPoint, } from '../services/field-route.service.js';
import { formatDateTime, formatTime, sendReportFile, } from '../services/field-report-export.service.js';
import { assertInScope, employeeRef, fullName } from './field-team.controller.js';
export const MAX_RANGE_DAYS = 92;
const formatSchema = z.enum(['xlsx', 'pdf']).optional();
const rangeFields = { from: dateKeySchema.optional(), to: dateKeySchema.optional(), format: formatSchema };
export const dailyQuerySchema = z.object({
    employeeId: objectIdString.optional(),
    date: dateKeySchema.optional(),
    format: formatSchema,
});
export const summaryQuerySchema = z.object({
    ...rangeFields,
    groupBy: z.enum(['employee', 'site', 'purpose']).default('employee'),
});
export const rangeQuerySchema = z.object(rangeFields);
/** `from`..`to` (default: this month to date); 400 when inverted or longer than 92 days. */
function reportRange(q) {
    const to = q.to ?? fieldDay().date;
    const from = q.from ?? `${to.slice(0, 8)}01`;
    if (from > to)
        throw new ValidationAppError('from must be on or before to');
    if (daysBetween(from, to) > MAX_RANGE_DAYS) {
        throw new AppError(`A report covers at most ${MAX_RANGE_DAYS} days`, 400, 'RANGE_TOO_LONG');
    }
    return { from, to };
}
function siteRef(site) {
    return site ? { _id: String(site._id), name: site.name ?? '', type: site.type ?? '' } : null;
}
const FLAG_KEYS = ['awayFromSite', 'noGps', 'noSelfie', 'shortVisit', 'autoClosed', 'syncedLate', 'capturedOffline'];
const FLAG_LABEL = {
    awayFromSite: 'Away from site',
    noGps: 'No GPS',
    noSelfie: 'No selfie',
    shortVisit: 'Short visit',
    autoClosed: 'Auto-closed',
    syncedLate: 'Synced late',
    capturedOffline: 'Captured offline',
};
function flagsOf(v) {
    return Object.fromEntries(FLAG_KEYS.map((k) => [k, Boolean(v.flags?.[k])]));
}
const words = (s) => (s ?? '').replace(/_/g, ' ');
const POINT_LABEL = {
    day_in: 'Day check-in',
    visit_in: 'Visit check-in',
    visit_out: 'Visit check-out',
    day_out: 'Day check-out',
};
const pointLabel = (p) => p ? `${POINT_LABEL[p.kind]}${p.siteName ? ` (${p.siteName})` : ''} ${formatTime(p.at)}` : '';
/** A stored file reference as `/uploads/<key>` (signed into a link on the way out). */
const fileRef = (key) => (key.startsWith('/uploads/') || /^https?:\/\//.test(key) ? key : `/uploads/${key.replace(/^\/+/, '')}`);
function timelineVisit(v) {
    const report = (v.report ?? null);
    const punch = (p) => p?.time ? { at: p.time, location: fixOf(p.location), distanceM: p.distanceM ?? null } : null;
    return {
        _id: String(v._id),
        site: siteRef(v.siteId),
        purpose: v.purpose ?? '',
        status: v.status,
        plannedDate: v.plannedDate ? new Date(v.plannedDate).toISOString().slice(0, 10) : null,
        checkIn: punch(v.checkIn),
        checkOut: punch(v.checkOut),
        durationMinutes: v.durationMinutes ?? null,
        flags: flagsOf(v),
        report: report
            ? {
                notes: report.notes ?? '',
                outcome: report.outcome ?? null,
                nextAction: report.nextAction ?? null,
                followUpDate: report.followUpDate ?? null,
                photos: (report.photos ?? []).map(fileRef),
                documents: (report.documents ?? []).map((d) => ({ url: fileRef(d.key), name: d.name })),
                peopleMet: report.peopleMet ?? [],
                checklist: report.checklist ?? null,
                submittedAt: report.submittedAt ?? null,
            }
            : null,
    };
}
const personMet = (p) => (p.designation ? `${p.name} (${p.designation})` : p.name);
/**
 * `GET /field/reports/daily?employeeId&date` (employee default: the caller)
 * → `{ date, employee, visits, points, legs, totalKm, estimated }`: the
 * visits checked in that day and the plans for it still unvisited, each with
 * its work report; the day's route.
 */
export async function dailyReport(req, res) {
    const q = req.query;
    const scope = await fieldScope(req);
    const employeeId = q.employeeId?.toLowerCase() ?? scope.self?.toHexString();
    if (!employeeId)
        throw new ValidationAppError('employeeId is required');
    assertInScope(scope, employeeId);
    const employee = await Employee.findById(employeeId).select('firstName lastName employeeId').lean().exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    const day = fieldDay(q.date);
    const [{ data, route }, unvisited] = await Promise.all([
        dayRoute(employeeId, day.date),
        Visit.find({ employeeId, plannedDate: day.label, 'checkIn.time': null, status: { $in: ['planned', 'missed'] } })
            .sort({ _id: 1 })
            .select('employeeId siteId purpose status plannedDate flags')
            .populate(VISIT_SITE_POPULATE)
            .lean()
            .exec(),
    ]);
    const visits = [...data.visits, ...unvisited].map(timelineVisit);
    const payload = {
        date: day.date,
        employee: employeeRef(employee),
        visits,
        points: route.points.map(publicPoint),
        legs: route.legs,
        totalKm: route.totalKm,
        estimated: route.estimated,
    };
    if (!q.format) {
        res.json({ success: true, data: payload });
        return;
    }
    const visitRows = visits.map((v, i) => [
        i + 1,
        v.site?.name ?? 'Unknown site',
        v.purpose,
        words(v.status),
        formatTime(v.checkIn?.at),
        formatTime(v.checkOut?.at),
        v.durationMinutes ?? '',
        FLAG_KEYS.filter((k) => v.flags[k]).map((k) => FLAG_LABEL[k]).join(', '),
        words(v.report?.outcome),
        v.report?.notes ?? '',
        (v.report?.peopleMet ?? []).map(personMet).join('; '),
        v.report?.nextAction ?? '',
    ]);
    const legRows = route.legs.map((l) => [
        pointLabel(route.points[l.fromIndex]),
        pointLabel(route.points[l.toIndex]),
        metresToKm(l.distanceM),
        l.estimated ? 'Yes' : '',
    ]);
    legRows.push(['Total', '', route.totalKm, route.estimated ? 'Yes' : '']);
    const name = fullName(employee);
    await sendReportFile(res, q.format, {
        title: 'Daily field report',
        subtitle: `${name}${employee.employeeId ? ` (${employee.employeeId})` : ''} · ${day.date} · ${route.totalKm} km${route.estimated ? ' (estimated)' : ''}`,
        filename: `field-daily_${employee.employeeId || employeeId}_${day.date}`,
        tables: [
            {
                name: 'Visits',
                columns: ['#', 'Site', 'Purpose', 'Status', 'Check-in', 'Check-out', 'Minutes on site', 'Flags', 'Outcome', 'Notes', 'People met', 'Next action'],
                rows: visitRows,
                widths: [0.4, 1.6, 1, 0.9, 0.7, 0.7, 0.8, 1.2, 0.9, 2.2, 1.4, 1.4],
            },
            { name: 'Route', columns: ['From', 'To', 'Km', 'Estimated'], rows: legRows, widths: [3, 3, 1, 1] },
        ],
    });
}
const GROUP_LABEL = { employee: 'Employee', site: 'Site', purpose: 'Purpose' };
/**
 * `GET /field/reports/summary?from&to&groupBy=employee|site|purpose` →
 * `[{ key, label, visits, completed, missed, minutesOnSite, km }]` by label.
 * `visits`: checked in; `missed`: plans for the range never visited;
 * `minutesOnSite`: summed visit durations. `km`: by employee, the day routes'
 * total; by site or purpose, the legs that arrive at a visit of that group
 * (the travel to reach it).
 */
export async function summaryReport(req, res) {
    const q = req.query;
    const groupBy = q.groupBy ?? 'employee';
    const scope = await fieldScope(req);
    const { from, to } = reportRange(q);
    const [days, missed] = await Promise.all([
        loadFieldDays({ employeeIds: scope.employeeIds, from, to, visitDaysOnly: true }),
        Visit.find({
            ...scopeFilter(scope),
            status: 'missed',
            plannedDate: { $gte: fieldDay(from).label, $lte: fieldDay(to).label },
        })
            .select('employeeId siteId purpose status plannedDate')
            .populate(VISIT_SITE_POPULATE)
            .lean()
            .exec(),
    ]);
    const routes = await measureDays(days.map((d) => ({ employeeId: d.employeeId, date: d.date, points: dayPointsOf(d) })));
    const groups = new Map();
    const siteNames = new Map();
    const keyOf = (v) => {
        if (groupBy === 'employee')
            return String(v.employeeId);
        if (groupBy === 'site') {
            const id = v.siteId ? String(v.siteId._id) : '';
            if (v.siteId)
                siteNames.set(id, v.siteId.name ?? '');
            return id;
        }
        return v.purpose ?? '';
    };
    const group = (key) => {
        let g = groups.get(key);
        if (!g) {
            g = { key, label: key, visits: 0, completed: 0, missed: 0, minutesOnSite: 0, km: 0, metres: 0 };
            groups.set(key, g);
        }
        return g;
    };
    for (const day of days) {
        const visitById = new Map(day.visits.map((v) => [String(v._id), v]));
        for (const v of day.visits) {
            const g = group(keyOf(v));
            g.visits += 1;
            if (v.status === 'completed')
                g.completed += 1;
            g.minutesOnSite += v.durationMinutes ?? 0;
        }
        const route = routes.get(dayKey(day.employeeId, day.date));
        for (const leg of route?.legs ?? []) {
            if (groupBy === 'employee') {
                group(day.employeeId).metres += leg.distanceM;
                continue;
            }
            const arrival = route.points[leg.toIndex];
            const visit = arrival?.kind === 'visit_in' && arrival.visitId ? visitById.get(arrival.visitId) : undefined;
            if (visit)
                group(keyOf(visit)).metres += leg.distanceM;
        }
    }
    for (const m of missed)
        group(keyOf(m)).missed += 1;
    if (groupBy === 'employee') {
        const people = await Employee.find({ _id: { $in: [...groups.keys()] } })
            .select('firstName lastName')
            .setOptions({ withDeleted: true })
            .lean()
            .exec();
        const names = new Map(people.map((p) => [String(p._id), fullName(p)]));
        for (const g of groups.values())
            g.label = names.get(g.key) ?? 'Unknown employee';
    }
    else if (groupBy === 'site') {
        for (const g of groups.values())
            g.label = siteNames.get(g.key) || 'Unknown site';
    }
    const rows = [...groups.values()]
        .map(({ metres, ...g }) => ({ ...g, km: metresToKm(metres) }))
        .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
    if (!q.format) {
        res.json({ success: true, data: rows });
        return;
    }
    await sendReportFile(res, q.format, {
        title: 'Field visits summary',
        subtitle: `${from} to ${to} · by ${groupBy}`,
        filename: `field-summary_${groupBy}_${from}_${to}`,
        tables: [
            {
                name: 'Summary',
                columns: [GROUP_LABEL[groupBy], 'Visits', 'Completed', 'Missed', 'Minutes on site', 'Km'],
                rows: rows.map((r) => [r.label, r.visits, r.completed, r.missed, r.minutesOnSite, r.km]),
                widths: [3, 1, 1, 1, 1.2, 1],
            },
        ],
    });
}
/** Visit flags that are exceptions, in listing sequence. */
const FLAG_EXCEPTIONS = [
    { flag: 'awayFromSite', type: 'away_from_site' },
    { flag: 'noGps', type: 'no_gps' },
    { flag: 'noSelfie', type: 'no_selfie' },
    { flag: 'shortVisit', type: 'short_visit' },
    { flag: 'autoClosed', type: 'auto_closed' },
    { flag: 'syncedLate', type: 'synced_late' },
];
const TYPE_ORDER = [...FLAG_EXCEPTIONS.map((e) => e.type), 'missed_plan'];
const EXCEPTION_LABEL = {
    away_from_site: 'Away from site',
    no_gps: 'No GPS',
    no_selfie: 'No selfie',
    short_visit: 'Short visit',
    auto_closed: 'Auto-closed',
    synced_late: 'Synced late',
    missed_plan: 'Missed plan',
};
/** `3 h 20 min`, `45 min`. */
function span(ms) {
    const minutes = Math.max(0, Math.round(ms / 60_000));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0)
        return `${m} min`;
    if (h >= 48)
        return `${Math.round(h / 24)} days`;
    return m ? `${h} h ${m} min` : `${h} h`;
}
function exceptionDetail(type, v, shortVisitMinutes) {
    switch (type) {
        case 'away_from_site': {
            const d = v.checkIn?.distanceM;
            const radius = v.siteId?.radiusM;
            if (typeof d !== 'number')
                return 'Checked in outside the site radius';
            return `Checked in ${Math.round(d)} m from the site${typeof radius === 'number' ? ` (radius ${radius} m)` : ''}`;
        }
        case 'no_gps':
            return 'No GPS fix with the check-in or check-out';
        case 'no_selfie':
            return 'Checked in without a selfie';
        case 'short_visit':
            return `${v.durationMinutes ?? 0} min on site (under ${shortVisitMinutes} min)`;
        case 'auto_closed':
            return v.checkOut?.time
                ? `Not checked out; closed automatically at ${formatTime(v.checkOut.time)}`
                : 'Not checked out; closed automatically';
        case 'synced_late': {
            const late = [v.checkIn, v.checkOut]
                .map((p) => (p?.capturedAt && p.receivedAt ? new Date(p.receivedAt).getTime() - new Date(p.capturedAt).getTime() : 0))
                .reduce((a, b) => Math.max(a, b), 0);
            return late > 0 ? `Reached the server ${span(late)} after it was recorded` : 'Reached the server more than 15 min after it was recorded';
        }
        default:
            return v.plannedDate ? `Planned for ${new Date(v.plannedDate).toISOString().slice(0, 10)}; not visited` : 'Planned; not visited';
    }
}
/**
 * `GET /field/reports/exceptions?from&to` → `[{ visitId, employee, site,
 * date, type, detail }]`, oldest first: one row per exception flag of a
 * visit (away from site, no GPS, no selfie, short visit, auto-closed, synced
 * late) and one per missed plan.
 */
export async function exceptionsReport(req, res) {
    const q = req.query;
    const scope = await fieldScope(req);
    const { from, to } = reportRange(q);
    const first = fieldDay(from);
    const last = fieldDay(to);
    const people = { path: 'employeeId', select: 'firstName lastName employeeId', options: { withDeleted: true } };
    const [flagged, missed, settings] = await Promise.all([
        Visit.find({
            ...scopeFilter(scope),
            'checkIn.time': { $gte: first.from, $lt: last.to },
            status: { $ne: 'cancelled' },
            $or: FLAG_EXCEPTIONS.map((e) => ({ [`flags.${e.flag}`]: true })),
        })
            .select('employeeId siteId checkIn checkOut durationMinutes flags status')
            .populate(VISIT_SITE_POPULATE)
            .populate(people)
            .lean()
            .exec(),
        Visit.find({ ...scopeFilter(scope), status: 'missed', plannedDate: { $gte: first.label, $lte: last.label } })
            .select('employeeId siteId status plannedDate')
            .populate(VISIT_SITE_POPULATE)
            .populate(people)
            .lean()
            .exec(),
        getFieldSettings(),
    ]);
    const rows = [];
    const add = (v, type, date, at) => {
        rows.push({
            visitId: String(v._id),
            employee: v.employeeId ? employeeRef(v.employeeId) : null,
            site: siteRef(v.siteId),
            date,
            type,
            detail: exceptionDetail(type, v, settings.shortVisitMinutes),
            at,
        });
    };
    for (const v of flagged) {
        const checkedIn = new Date(v.checkIn.time);
        for (const e of FLAG_EXCEPTIONS)
            if (v.flags?.[e.flag])
                add(v, e.type, istDate(checkedIn), checkedIn.getTime());
    }
    for (const v of missed) {
        const planned = new Date(v.plannedDate);
        add(v, 'missed_plan', planned.toISOString().slice(0, 10), planned.getTime());
    }
    rows.sort((a, b) => a.date.localeCompare(b.date) ||
        a.at - b.at ||
        fullName(a.employee).localeCompare(fullName(b.employee)) ||
        TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
    const data = rows.map(({ at: _at, ...row }) => row);
    if (!q.format) {
        res.json({ success: true, data });
        return;
    }
    await sendReportFile(res, q.format, {
        title: 'Field exceptions',
        subtitle: `${from} to ${to}`,
        filename: `field-exceptions_${from}_${to}`,
        tables: [
            {
                name: 'Exceptions',
                columns: ['Date', 'Employee', 'Employee ID', 'Site', 'Exception', 'Detail'],
                rows: data.map((r) => [
                    r.date,
                    r.employee ? fullName(r.employee) : 'Unknown employee',
                    r.employee?.employeeId ?? '',
                    r.site?.name ?? 'Unknown site',
                    EXCEPTION_LABEL[r.type],
                    r.detail,
                ]),
                widths: [1, 1.6, 1, 1.6, 1.1, 3],
            },
        ],
    });
}
/* ── Sites ── */
/**
 * `GET /field/reports/sites?from&to` → `[{ site, visits, lastVisitAt,
 * employees: [{ _id, firstName, lastName, employeeId }], employeeCount }]`,
 * most visited first: the visits checked in at each site in the range and
 * who made them.
 */
export async function sitesReport(req, res) {
    const q = req.query;
    const scope = await fieldScope(req);
    const { from, to } = reportRange(q);
    const visits = await Visit.find({
        ...scopeFilter(scope),
        'checkIn.time': { $gte: fieldDay(from).from, $lt: fieldDay(to).to },
        status: { $ne: 'cancelled' },
    })
        .select('employeeId siteId checkIn.time')
        .lean()
        .exec();
    const bySite = new Map();
    for (const v of visits) {
        const key = String(v.siteId);
        const at = new Date(v.checkIn.time);
        const s = bySite.get(key) ?? { visits: 0, lastVisitAt: at, employees: new Set() };
        s.visits += 1;
        if (at > s.lastVisitAt)
            s.lastVisitAt = at;
        s.employees.add(String(v.employeeId));
        bySite.set(key, s);
    }
    const employeeIds = [...new Set([...bySite.values()].flatMap((s) => [...s.employees]))];
    const [sites, people] = await Promise.all([
        FieldSite.find({ _id: { $in: [...bySite.keys()] } }).select('name type').setOptions({ withDeleted: true }).lean().exec(),
        Employee.find({ _id: { $in: employeeIds } })
            .select('firstName lastName employeeId')
            .setOptions({ withDeleted: true })
            .lean()
            .exec(),
    ]);
    const siteById = new Map(sites.map((s) => [String(s._id), s]));
    const personById = new Map(people.map((p) => [String(p._id), employeeRef(p)]));
    const data = [...bySite.entries()]
        .map(([id, s]) => {
        const site = siteById.get(id);
        const employees = [...s.employees]
            .map((e) => personById.get(e))
            .filter((e) => Boolean(e))
            .sort((a, b) => fullName(a).localeCompare(fullName(b)));
        return {
            site: { _id: id, name: site?.name ?? 'Unknown site', type: site?.type ?? '' },
            visits: s.visits,
            lastVisitAt: s.lastVisitAt,
            employees,
            employeeCount: s.employees.size,
        };
    })
        .sort((a, b) => b.visits - a.visits || a.site.name.localeCompare(b.site.name));
    if (!q.format) {
        res.json({ success: true, data });
        return;
    }
    await sendReportFile(res, q.format, {
        title: 'Site visits',
        subtitle: `${from} to ${to}`,
        filename: `field-sites_${from}_${to}`,
        tables: [
            {
                name: 'Sites',
                columns: ['Site', 'Type', 'Visits', 'Last visit', 'Visited by', 'People'],
                rows: data.map((r) => [
                    r.site.name,
                    r.site.type,
                    r.visits,
                    formatDateTime(r.lastVisitAt),
                    r.employees.map(fullName).join(', '),
                    r.employeeCount,
                ]),
                widths: [2, 1.2, 0.7, 1.3, 3.5, 0.7],
            },
        ],
    });
}
//# sourceMappingURL=field-reports.controller.js.map