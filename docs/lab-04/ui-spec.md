# Lab 4 UI Specification — Dashboards, Actions Taken, Ticket Workflow, Final Polish

**Extends:** `docs/lab-03/ui-spec.md` and `docs/lab-02/ui-spec.md`. Zen Green tokens,
typography, spacing, field states, button variants, badges, and responsive/
accessibility rules are reused **as-is** (`client/src/styles/zen-green.css`). No second
visual system is introduced; everything below is built from the existing classes
(`zg-card`, `zg-badge-*`, `btn-zg-primary|secondary|tertiary`, `zg-callout-*`,
`zg-readonly-field`, `zg-field-error`, `zg-label`, `zg-required-asterisk`).

---

## 1. New Tokens and Badges

```css
:root {
  --zg-info-bg: #E7F0FA;   /* already used by Status OPEN / Role IT Staff */
  --zg-info-text: #1F5F9C;
  --zg-neutral-bg: #E8ECE9;   /* already used by Status CLOSED */
  --zg-neutral-text: #4C5C54;
}
```
| Badge (class) | Background | Text | Label (always shown) |
|---|---|---|---|
| Action PLANNED (`zg-badge-action-planned`) | `--zg-neutral-bg` | `--zg-neutral-text` | "Planned" |
| Action IN_PROGRESS (`zg-badge-action-in_progress`) | `#FDF3D8` | `--zg-warning` | "In Progress" |
| Action COMPLETED (`zg-badge-action-completed`) | `--zg-pale` | `--zg-primary` | "Completed" |
| Action CANCELLED (`zg-badge-action-cancelled`) | `--zg-error-bg` | `--zg-text-muted` | "Cancelled" (+ strike-through description) |
| Follow-up required (`zg-badge-followup`) | `#FCE7D6` | `#C2540D` | "Follow-up" |
| Awaiting review (`zg-badge-awaiting-review`) | `--zg-info-bg` | `--zg-info-text` | "Requester says resolved" |

Same pill shape/padding/font as every existing badge; meaning is never conveyed by
color alone (text label + icon where useful).

## 2. Application Shell and Navigation

| Role | Navigation (left → right) | Landing route |
|---|---|---|
| Requester | **Dashboard**, My Tickets, Create Ticket | `/dashboard` |
| IT Staff | **Dashboard**, Ticket Queue | `/dashboard` |
| Administrator | **Dashboard**, Ticket Queue, Users | `/dashboard` |

- `/dashboard` renders `RequesterDashboard` or `StaffDashboard` from the session role.
- Active page: `NavLink` active class (underline + bold, as Lab 3) and
  `aria-current="page"`.
- The user menu (name, role badge, Logout) is unchanged; the decorative clock glyph in
  the brand is `aria-hidden`.
- Leftovers removed: any unused selector, debug text, placeholder copy, or duplicate
  control from earlier labs (checked in the visual checklist, §10).

## 3. Shared Dashboard Components

- **Page header:** `h1` greeting ("Welcome back, {first name}") + one-line subtitle,
  and a **Refresh** button (`btn-zg-secondary`, busy-disabled while loading,
  `aria-label="Refresh dashboard"`), plus "Updated at hh:mm" from `generatedAt`.
- **MetricCard** (`zg-card zg-metric`, `zg-metric` being a new modifier class): label (`h2`, 14 px, muted), value (32 px,
  weight 600, `aria-live="polite"` on refresh), and a **"View all"** link whose
  accessible name includes the metric ("View all open tickets"). The whole card is
  **not** a click target (avoids nested interactive elements); the link is.
  Value 0 shows "0" with a muted "Nothing here" line, never a blank.
- **TicketList** (`zg-card`): rows with Ticket Number (link to detail), Summary
  (truncated with ellipsis + full text in `title`), status badge, and a date.
  Empty list → `zg-callout-neutral` message specific to the list.
- **States:** loading = skeleton cards/rows (no layout jump); failure =
  `zg-callout-error` "We couldn't load your dashboard." + Retry; forbidden =
  redirect to the role's dashboard (route guard, as Lab 3; no toast); counts never
  computed on the client.

## 4. Requester Dashboard (`/dashboard`, Requester)

1. Header: "Welcome, {first name}!" / "Here's the latest on your requests."
2. Metric cards (4): **Open** (`openTickets`), **Waiting for You**
   (`waitingForMe`, highlighted with the amber border when > 0), **Resolved (last 7
   days)** (`resolvedLast7Days`), **Closed** (`closedTickets`). Each "View all" opens
   My Tickets pre-filtered (drill-down URL from the API).
3. **Needs Your Attention** list (`attentionTickets`): Waiting-for-Requester Tickets,
   oldest first, with the hint "IT Staff are waiting for your reply". Empty: "Nothing
   needs your attention right now."
4. **Recently Updated** list (`recentTickets`) + "View all" → My Tickets. Empty (no
   Tickets at all): "You haven't created any tickets yet." + Create Ticket button.
5. **Quick Actions** card: Create Ticket (primary), View My Tickets (secondary).

## 5. IT Staff / Administrator Dashboard (`/dashboard`, IT Staff or Administrator)

1. Header: "Welcome back, {first name}!" / "Here's what's happening with the queue."
2. Metric cards (5): **Unassigned**, **My Open Tickets**, **Awaiting Review**
   (Requester says resolved), **High Priority Open**, **My Open Actions** (link
   scrolls to the list `#my-open-actions`).
3. **Tickets by Status** — 8 compact count chips (status badge + number), each a link
   to the Queue filtered by that status. **Open Tickets by IT Priority** — High,
   Medium, Low, Not set, each a link (Not set → `priority=NONE`).
4. Lists: **My Open Actions** (action description, Ticket number link, action status
   badge, Follow-up badge, date), **Urgent Tickets** (active + High IT Priority,
   oldest first, owner or "Unassigned"), **Recently Updated**.
5. Administrator only: **User Accounts** card (Active Requesters, Active IT Staff,
   Active Administrators, Inactive) with links to User Management filtered by role /
   status.
6. Empty-state texts: "No unassigned tickets.", "You have no open actions.",
   "No urgent tickets.", "No ticket was updated in the last 7 days."

**Drill-down targets must honour the URL:** My Tickets, Ticket Queue, and User
Management read their filter state (status list, ownership, priority,
requesterResolved, resolvedWithinDays, role, isActive) from the query string on load, show the
applied filters in their controls, and display a removable "Filtered from
Dashboard" chip. Clear Filters removes them.

## 6. Actions Taken (Staff Ticket Detail)

**Placement:** a new section "Actions Taken (n)" directly below the Operational
Panel and above Public Comments, so work, then conversation, then private notes read
top-down.

**List mode**
- Desktop ≥ 992 px: table — Date/Time · Action · Result · Performed by · Status ·
  Follow-up · Attachment notes · Actions (buttons).
- Tablet/mobile < 992 px: one card per action, fields as labelled rows, buttons full
  width (≥ 44 px) at < 768 px. No horizontal page scroll at 320 px.
- Order: Date/Time ascending, then creation (stable). Completed/cancelled rows show a
  lock icon + "Locked" text; cancelled description is struck through **and** labelled.
- Empty: "No actions recorded yet. Record the work done on this ticket." + Add
  Action button.

**Create mode** (button **Add Action**, `btn-zg-primary`) opens an inline panel
(full-screen sheet on mobile):
- Action Date/Time* (`datetime-local`, pre-filled with now), Action Description*
  (textarea, counter 0/2000), Result (textarea, optional, counter), Performed by
  (select of active IT Staff/Administrators from `GET /api/staff/users`, default =
  me, label "Performed by (defaults to you)"), Follow-Up Required? (checkbox), Follow-up
  Note* (textarea shown and required only when checked, counter 0/1000), Attachment
  Notes (input, hint "Which file shows the evidence, e.g. wifi-error.png").
- Created by is displayed read-only ("Recorded by {me}") — never editable.
- Save is busy-disabled during the request; a `clientRequestId` (UUID) is generated
  when the panel opens and reused on retry, so a double click or a retry cannot
  create two actions.
- Validation errors appear under each field (`zg-field-error`, `aria-describedby`);
  a server 4xx maps its `fields` to the same places; values are kept after any error.

**View / edit mode** (button **View** on each row)
- Opens the same panel pre-filled; for open actions the fields are editable and the
  footer shows **Save changes**, **Start** (PLANNED only), **Complete**, **Cancel
  action**; for locked actions every field is `zg-readonly-field` and only **Close**
  is shown.
- **Complete** requires a Result (focus moves to Result with an error if empty).
- **Cancel action** opens a confirmation dialog ("Cancel this action? It stays in
  the history and can't be edited.") with focus trap, Esc, and a visible close button.
- Every save sends `expectedUpdatedAt`; on `409 STALE_UPDATE` a `zg-callout-info`
  says "Someone else updated this action. The latest version is shown." and the
  panel reloads with the server's current values (the user's unsaved text is shown
  below it so it is not lost).
- `422 INVALID_ASSIGNEE` → error under Performed by: "This person can't be assigned
  (inactive or not IT Staff)."

**Requester Ticket Detail:** same list, read-only (no buttons), title "Work done on
your ticket"; no Created-by column (shows Performed by only).

## 7. Ticket Workflow and Resolution Feedback

- **Status control** (Operational Panel): select listing only
  `legalNextStatuses`; "Resolved" stays visible but **disabled** when
  `resolutionGate.canResolve` is false, with the reason underneath:
  "To resolve, complete at least one action and close all open actions." or
  "Assign a Ticket Owner first.". CANCELLED keeps its confirmation dialog.
- The backend stays the authority: a `409 RESOLUTION_BLOCKED` /
  `INVALID_TRANSITION` / `STALE_UPDATE` shows a `zg-callout-error` with the
  server message, the selection is reset, and the Ticket reloads.
- **Success** refreshes the summary in place: status badge, "Resolved on …", legal
  next statuses, Status History, and shows an inline success callout
  (`zg-callout-info`, `role="status"`), e.g. "Status changed to Resolved." There is no
  toast component.
- **Awaiting review banner** (`zg-callout-info` + `zg-badge-awaiting-review`) at the top
  of Staff Ticket Detail when `requesterIndicatedResolved` is true and the Ticket is
  active: "The requester says the problem appears resolved. Review the actions
  before resolving."
- **Status History** (staff and Requester detail): vertical timeline "From → To · by
  {name} · {date}", oldest first; legacy Tickets show "History recorded from
  Lab 4 onwards."

## 8. Responsive Rules

| Width | Dashboard | Actions Taken | Workflow |
|---|---|---|---|
| ≥ 1200 px | metric cards in one row (4 or 5), lists in 2 columns | table | status select inline |
| 992–1199 px | cards 3 per row, lists 2 columns | table (Attachment notes column wraps) | inline |
| 768–991 px | cards 2 per row, lists 1 column | cards | full-width select |
| < 768 px (incl. 320 px) | cards 1 per row, lists 1 column, chips wrap | cards, buttons full width, panel = full-screen sheet | full-width select and buttons |

No horizontal page scrolling, clipped labels, or overlapping controls at 320, 768,
1280 px (checked by RESP tests and screenshots).

## 9. Accessibility

- Every new field has a `<label for>`; required fields use the asterisk **and**
  `aria-required`; errors are linked with `aria-describedby` and announced
  (`role="alert"` on submit).
- Keyboard: every action reachable by Tab in reading order; dialogs trap focus,
  close on Esc, return focus to the opener; visible `--zg-focus-ring` everywhere.
- Status, priority, action status, follow-up, and awaiting-review are text badges,
  never color-only.
- Dashboard numbers use `aria-live="polite"` after Refresh; skeletons have
  `aria-busy="true"`.
- Heading order: one `h1` per page, cards use `h2`, lists use `h2`/`h3` consistently.

## 10. Screenshot and Visual Checklist (Answer Parts 5–9)

Captured automatically by `e2e/lab-04/screenshots.spec.ts` into
`artifacts/lab-04/screenshots/{staff-dashboard,requester-dashboard,actions-taken,ticket-workflow,regression}/`,
each at desktop 1280, tablet 768, and mobile 320 unless stated:
- [ ] Staff Dashboard: populated, loading, empty (staff with nothing), failure, forbidden (Requester), Admin variant with User Accounts.
- [ ] Requester Dashboard: populated, empty (Requester with no Tickets), failure.
- [ ] Drill-down: card → filtered Queue / My Tickets with the same count.
- [ ] Actions Taken: list with several actions on one Ticket, create panel, validation errors (follow-up note, future date), inactive-assignee rejection, edit, start, complete (with result), cancel dialog, locked action, stale-update message, Requester read-only view.
- [ ] Workflow: legal options only, Resolved disabled with reason, RESOLUTION_BLOCKED message, successful resolve with refreshed summary and history, awaiting-review banner.
- [ ] Regression: login, My Tickets, Ticket Detail with attachments and comments, Ticket Queue, Internal Notes, User Management.

**Visual consistency checklist** (completed before submission): design consistency
with Labs 2–3 · role navigation and active page · dashboards (cards, lists, empty
states) · Actions Taken (table/cards, badges, locked rows) · editable vs read-only
fields · validation placement under fields · keyboard focus visible · no clipping ·
no overlap · no horizontal overflow · no console errors · no placeholder or obsolete UI.
