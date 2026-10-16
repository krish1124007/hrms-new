import { type WeekOffRule } from '../lib/week-off.js';
/** Drop the cache so the next read picks up a freshly saved rule. */
export declare function invalidateWeekOffRule(): void;
/**
 * The configured rule, or the default when nothing has been saved yet.
 * Never throws — a DB hiccup falls back to the default rather than breaking
 * every attendance screen.
 */
export declare function getWeekOffRule(): Promise<WeekOffRule>;
//# sourceMappingURL=week-off.service.d.ts.map