# Lab 3 UI Specification — TokTickIT Authentication, Roles, IT Staff Ticketing, and Admin User Management

**Extends:** `docs/lab-02/ui-spec.md` (Zen Green design language, tokens, and shared
component conventions are reused as-is unless a change is called out below.)

---

## 1. Reused Design Tokens (from `docs/lab-02/ui-spec.md` §1–2, unchanged)

```css
:root {
  --zg-primary: #006B3C;
  --zg-secondary: #0B7A46;
  --zg-pale: #EAF6EF;
  --zg-bg: #F5F7F6;
  --zg-surface: #FFFFFF;
  --zg-text: #1F2A24;
  --zg-text-muted: #5B6B62;
  --zg-field-bg: #FFFFFF;
  --zg-field-border: #CBD5D1;
  --zg-field-readonly: #F1EFE6;
  --zg-error: #B3261E;
  --zg-error-bg: #FBEAE9;
  --zg-warning: #B8860B;
  --zg-success-bg: #EAF6EF;
  --zg-focus-ring: #0B7A46;
}
```

Typography (system font stack, `14px`/`15px` mobile body, `h1 24px`/`h2 18px` weight
600), the `4px`-multiple spacing scale, field-state styles (editable/focused/
read-only/invalid/disabled — §3 of Lab 2), button variants (Primary/Secondary/
Tertiary/Destructive/Busy/Disabled — §4 of Lab 2), and badge shape (pill,
`border-radius: 999px`, `12px`/`4px` padding, `12px` font weight 600, text label
always present, never color-only — §5 of Lab 2) are reused exactly as specified in
`docs/lab-02/ui-spec.md` and are not repeated here.

## 2. New Tokens and Badges (Lab 3 additions)

Two new CSS variables are introduced, following the Lab 2 naming convention, since no
existing token fits "Reopened" or a distinctly-darker "Closed" without reusing colors
already meaning something else:

```css
:root {
  --zg-neutral-bg: #EEF1EF;   /* Closed status, Requester role badge background */
  --zg-neutral-text: #46524B; /* Closed status, Requester role badge text */
  --zg-reopened-bg: #FCE7D6;  /* Reopened status background */
  --zg-reopened-text: #C2540D;/* Reopened status text */
}
```

| Badge | Background | Text | Rationale |
|---|---|---|---|
| Role: Requester | `--zg-neutral-bg` | `--zg-neutral-text` | Neutral — default role, no emphasis |
| Role: IT Staff | `#E7F0FA` | `#1F5F9C` | Reuses the existing Status OPEN blue pair |
| Role: Administrator | `--zg-pale` | `--zg-primary` | Reuses the existing brand-emphasis pair |
| Status: WAITING_FOR_REQUESTER | `#FDF3D8` | `--zg-warning` | Reuses the existing amber pair (same as Priority MEDIUM / Status IN_PROGRESS) |
| Status: CLOSED | `--zg-neutral-bg` | `--zg-neutral-text` | Neutral/terminal, visually calmer than Cancelled |
| Status: REOPENED | `--zg-reopened-bg` | `--zg-reopened-text` | New orange pair — distinct from amber (Waiting) and red (error) |
| Status: CANCELLED | `--zg-error-bg` | `--zg-text-muted` | Error-tinted background but muted text — terminal/negative without implying "fix this now" like a validation error |
| Public Comment thread | `--zg-pale` | `--zg-text` | Same pale-green success surface used for New/Resolved status, left border `--zg-secondary` |
| Internal Note thread | `#FDF3D8` | `--zg-text` | Same amber surface as Waiting/In-Progress badges, dashed `--zg-warning` border, "Internal — Staff Only" label in `--zg-warning` |

Existing badges (Requested/IT Priority Low/Medium/High, and Lab 2 statuses New/Open/
In Progress/Resolved) are unchanged from `docs/lab-02/ui-spec.md` §5. All new badges
follow the same pill shape/padding/font rule and never rely on color alone (§5, §8).

## 3. Application Shell (all authenticated screens)

- Persistent header: TokTickIT identity (left), role-scoped primary navigation
  (center), current user name + role badge + Logout (right).
- Navigation is rendered from the current user's role — a Requester never sees "Ticket
  Queue" or "User Management" in the DOM, and IT Staff never sees "User Management."
  This is a UX convenience only; every route it points to independently checks
  authorization server-side (see `specification.md` §8).
- The Lab 2 "current Requester + Change Requester" control is fully removed.
- Active-page indication and responsive collapse (hamburger on mobile) are unchanged
  from Lab 2.

## 4. Login Screen

**Route:** `/login` (unauthenticated only; authenticated users are redirected to their
role's home screen).

- Centered card, max-width ~400px, TokTickIT wordmark above the form.
- Fields: Email (text), Password (password, with show/hide toggle).
- Primary action: "Log In" (disabled while request in flight — spinner replaces label).
- Modes: **idle** → **submitting** (busy) → **success** (redirect) or **failure**
  (inline banner above the form: "Invalid email or password.").
- No "forgot password," "sign up," or social login controls (excluded from scope).
- Validation: both fields required client-side before submit is enabled; server is the
  authority (BR-01, BR-02 in `specification.md`).
- Responsive: identical single-column layout at all breakpoints; card simply narrows.

## 5. Mandatory Change Password Screen

**Route:** `/change-password` (shown automatically whenever `mustChangePassword =
true`; not reachable otherwise; no navigation away is offered except Logout).

- Centered card, explanatory text ("You must set a new password to continue.").
- Fields: New Password, Confirm New Password (both password type with show/hide).
- Inline rule hint under New Password (min 8 characters, must differ from current).
- Primary action: "Save New Password" (busy-disabled while in flight).
- Modes: **idle** → **submitting** → **success** (redirect into the app) or
  **failure** (field-level error under the offending field, or a banner for
  server/network failure).
- Logout remains available from this screen (escape hatch), all other navigation is
  suppressed.

## 6. Requester Screens (Lab 2 regression + additions)

My Tickets, Create Ticket, and the base Ticket Detail layout are visually unchanged
from `docs/lab-02/ui-spec.md`. Two additions to Ticket Detail only:

- **Public Comments thread:** appended below the existing read-only ticket fields and
  above/alongside Attachments (final placement decided in implementation, but always
  below core ticket identity fields). Each comment shows author name, role badge,
  timestamp, and content in a `--zg-pale`-tinted card. A single-line composer with a
  "Post Comment" button sits at the bottom of the thread (busy-disabled while posting,
  empty/whitespace rejected client-side per BR-15).
- **"Problem Appears Resolved" action:** a secondary button near the status badge,
  toggles to a confirmed/disabled state ("You indicated this is resolved") once used;
  visually distinct from the Current Status badge so a Requester cannot mistake it for
  formally closing the Ticket.
- Ownership protection, Attachment add/remove, and all Lab 2 states (empty, no-results,
  validation, failure) are otherwise unchanged.

## 7. IT Staff Ticket Queue

**Route:** `/staff/tickets` (IT Staff, Administrator only).

- Header row: search box (Ticket Number/Summary), filter controls (Status, Priority,
  Ownership: Mine/Unassigned/All), sort control.
- Desktop (≥1024px): table with columns Ticket Number, Created Date, Summary,
  Category, Requested Priority, IT Priority, Current Status, Ticket Owner, Last
  Updated; each row opens Ticket Detail on click.
- Tablet/mobile (<1024px): collapses to stacked cards — Ticket Number + Summary as the
  card title, remaining fields as labeled rows, status/priority as badges; no
  horizontal scrolling at any breakpoint (AC-18).
- Pagination control at the bottom (page size selector + page navigation), matching
  the Lab 2 My Tickets pattern.
- States: **loading** (skeleton rows/cards), **empty** ("No tickets yet" — only
  possible if the system has zero tickets at all, effectively a seed-data-only state),
  **no-results** (search/filter yields nothing — "Clear Filters" action), **forbidden**
  (non-staff role reaching the route directly — redirect + toast, not a blank screen),
  **failure** (retry banner).

## 8. IT Staff Ticket Detail

**Route:** `/staff/tickets/:ticketNumber` (IT Staff, Administrator only).

- Extends the Lab 2 Ticket Detail read-only field grouping (Requester, Category,
  Related System, Summary, Description, dates) — these fields remain read-only here
  too; only the operational panel below is editable.
- **Operational panel** (new, staff-only):
  - Ticket Owner: current owner name or "Unassigned"; "Claim" button (unassigned →
    self) or "Reassign" control (assigned → dropdown of active IT Staff/Administrator
    users) — dropdown, not free text, to prevent invalid owners.
  - IT Priority: editable select (Low/Medium/High), distinct styling from the
    read-only Requested Priority badge next to it, so the two are never confused.
  - Current Status: select showing only statuses legal from the current status per the
    transition matrix (illegal targets are not rendered as options, not just
    disabled); choosing `CANCELLED` opens a confirmation dialog before submit.
- **Public Comments thread:** identical component to §6, staff can also post here.
- **Internal Notes thread:** visually distinct (amber/grey, dashed border, "Internal —
  Staff Only" label) placed clearly separate from Public Comments — never interleaved
  in the same visual thread — with its own composer.
- Existing Attachments list (read-only for staff in Lab 3; staff do not add/remove
  attachments — that remains a Requester action).
- States: same family as §7 (loading/validation/success/forbidden/not-found/conflict/
  failure), plus a specific **conflict** toast when a Claim/Reassign or Status change
  is rejected because another staff member changed it first (optimistic-lock message,
  then reloads the current ticket state).

## 9. Administrator User Management

**Route:** `/admin/users` (Administrator only).

- Single screen, no sub-navigation. Top bar: search box (name/email), optional role
  filter dropdown, "Create User" primary button (opens a modal/side panel).
- User table: Name, Email, Role (badge), Status (Active/Inactive badge), Edit action.
  No pagination, no multi-column sort, no multi-filter (excluded from scope) — a
  single list is acceptable at expected seed/test data volumes.
- **Create/Edit modal or side panel:**
  - Fields: Name, Email, Role (single-select, not multi), Activation toggle.
  - Create mode shows a read-only "an initial password will be generated" note (no
    password field — system-generated per BR-23).
  - Edit mode adds a separate "Set New Initial Password" action (its own confirmation
    step, since it forces the target user through Change Password at next login).
  - The Activation toggle and Role select are **disabled with an explanatory tooltip**
    (not hidden) when editing: (a) the Administrator's own account (self-deactivation,
    BR-22), or (b) the last active Administrator (role/deactivation protection,
    BR-22) — the disabled state itself is part of the required "safe failure
    feedback."
  - Validation: required Name/Email, email format, duplicate-email server check
    surfaced as a field-level error under Email (`409 DUPLICATE_EMAIL`).
- States: loading, empty (no users match — effectively unreachable with seed data, but
  supported), no-results (search/filter yields nothing), validation, success (toast +
  table refresh), forbidden (non-Administrator reaching the route — redirect), safe
  failure (network/server error banner).
- Responsive: table collapses to stacked cards below 768px identically to the Ticket
  Queue pattern (§7); the create/edit panel becomes a full-screen sheet on mobile
  instead of a centered modal.

## 10. Required Screen Modes and Feedback (summary table)

| Screen | Modes | Feedback states required |
|---|---|---|
| Login | idle, submitting | validation, failure (generic) |
| Change Password | idle, submitting | validation, failure |
| Requester Ticket Detail | view | comment-posting busy/success/failure, resolved-indication success |
| IT Staff Ticket Queue | view | loading, empty, no-results, forbidden, failure |
| IT Staff Ticket Detail | view, editing (owner/priority/status/notes) | loading, validation, conflict, forbidden, not-found, failure |
| Admin User Management | list, create, edit | loading, empty, no-results, validation, conflict (duplicate email), forbidden, failure |

Not every screen needs a distinct formal state for every possible error (per handout
§8.6) — safe, generic failure feedback is acceptable wherever a more specific state is
not explicitly required above.

## 11. Responsive and Accessibility Requirements

Identical to `docs/lab-02/ui-spec.md` §7–8, applied to every new/changed screen:
- **Desktop ≥ 992px:** full layouts, content max-width `1140px`, centered.
- **Tablet 768–991px:** two-column layout where practical; wide fields keep full width.
- **Mobile < 768px:** single-column stack, buttons full-width and ≥44px tall, tables
  become cards, no horizontal page scroll anywhere.
- No clipped labels, overlapping validation messages, or hidden buttons at 320px,
  768px, and 1280px widths.
- Every new form control (Login, Change Password, Claim/Reassign select, IT Priority
  select, Status select, Comment/Note composers, Admin Create/Edit fields) has an
  associated `<label>` via `htmlFor`/`id`, never placeholder-only.
- `--zg-focus-ring` focus outline remains visible on all new interactive elements;
  never `outline: none` without a replacement.
- Role/Status/Priority meaning is never color-only (§2 above).
- Icon-only controls (e.g. a queue row's "open" icon) carry `aria-label` + `title`.
- The Claim/Reassign confirmation and Cancel-status confirmation dialogs trap focus
  and are dismissible via `Esc` and a visible close control, matching the Lab 2 Remove
  Attachment confirmation modal pattern.

## 12. Screenshot Checklist (for Answer Part 9)

For each of the following, capture desktop, tablet, and mobile:
- [ ] Login (idle + failure state)
- [ ] Mandatory Change Password
- [ ] Authenticated shell showing role-specific navigation (one capture per role)
- [ ] Requester Ticket Detail with Public Comments + "Problem Appears Resolved"
- [ ] IT Staff Ticket Queue (populated, filtered, no-results, empty)
- [ ] IT Staff Ticket Detail (Claim, Reassign, IT Priority edit, Status change,
      Public Comments vs. Internal Notes side by side)
- [ ] Administrator User Management list (search, role filter)
- [ ] Administrator Create User panel and Edit User panel (including disabled
      self-deactivation / last-Administrator states)
- [ ] Forbidden-access redirect/toast for a non-Administrator hitting `/admin/users`
      and a non-staff user hitting `/staff/tickets`

Visual consistency checklist (design consistency, role navigation, badges,
editable/read-only fields, validation placement, focus, clipping, overlap, and
horizontal overflow) is completed against this checklist before submission, per
handout §14 Part 9.
