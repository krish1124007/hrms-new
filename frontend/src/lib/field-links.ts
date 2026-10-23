/**
 * Where the Field Visits pages live, for links between them. One place, so
 * the router and these links cannot drift apart unnoticed.
 */
export const FIELD_PATHS = {
  teamMap: '/field/team-map',
  routes: '/field/routes',
  reports: '/field/reports',
  travel: '/field/travel',
  visits: '/field/visits',
} as const;

/** An employee's route on an IST day. */
export function routeLink(employeeId: string, date: string): string {
  const q = new URLSearchParams({ employeeId, date });
  return `${FIELD_PATHS.routes}?${q.toString()}`;
}

/** A visit's detail page. */
export function visitLink(visitId: string): string {
  return `${FIELD_PATHS.visits}/${encodeURIComponent(visitId)}`;
}
