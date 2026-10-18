import { startOfBusinessDay } from './business-day.js';
export const DEFAULT_PROBATION_MONTHS = 6;
/**
 * The day label `months` calendar months after the business day `date`
 * falls on, clamped to the last day of the target month when it is shorter.
 */
export function addBusinessMonths(date, months) {
    const day = startOfBusinessDay(date);
    const target = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, 1));
    const lastOfTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(day.getUTCDate(), lastOfTarget));
    return target;
}
export function isOnProbation(employee, today = new Date()) {
    const day = startOfBusinessDay(today).getTime();
    const after = (d) => startOfBusinessDay(d).getTime() > day;
    if (employee.probationEndDate)
        return after(employee.probationEndDate);
    if (employee.confirmationDate)
        return after(employee.confirmationDate);
    if (!employee.joiningDate)
        return false;
    return addBusinessMonths(employee.joiningDate, DEFAULT_PROBATION_MONTHS).getTime() > day;
}
//# sourceMappingURL=probation.js.map