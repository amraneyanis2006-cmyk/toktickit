// Dashboard constants (specification.md BR-22, BR-23). The status sets already
// live next to their transition rules; re-exported here under the BR-22 names.
export { ACTIVE_TICKET_STATUSES as ACTIVE_STATUSES } from './statusTransition';
export { OPEN_ACTION_STATUSES } from './actionTransition';

export const RECENT_WINDOW_DAYS = 7;

/** BR-23: the rolling 7 x 24 h before `now` - pure millisecond arithmetic, so no time zone or DST is involved. */
export function recentWindowStart(now: Date, days = RECENT_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
