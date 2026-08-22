# Lab 2 UI Specification — Zen Green Theme

**Scope:** Application Shell, Development Requester Selection, Create Ticket, My
Tickets, Requester Ticket Detail (read-only) + Attachments. Built with React 19 +
Bootstrap 5; component classes below assume Bootstrap utility classes plus a small
custom stylesheet (`zen-green.css`) for tokens Bootstrap doesn't provide natively.

Reference mockups: Figure 1 (Ticket Detail), Development Requester Selection screen,
My Tickets screen (labsheet, §8).

---

## 1. Color Tokens

| Token | Value | CSS variable | Usage |
|---|---|---|---|
| Primary green | `#006B3C` | `--zg-primary` | App header background, primary buttons, strong emphasis, active nav underline |
| Secondary green | `#0B7A46` | `--zg-secondary` | Active tab indicator, focus ring accent, links, hover states |
| Pale green | `#EAF6EF` | `--zg-pale` | Selected row/card background, success banners, subtle section headers |
| Page background | `#F5F7F6` | `--zg-bg` | `<body>` background |
| Surface / card | `#FFFFFF` | `--zg-surface` | Cards, panels, table container — 1px `#E2E8E5` border, `0 1px 3px rgba(0,0,0,0.06)` shadow |
| Text (primary) | `#1F2A24` | `--zg-text` | Body text — dark charcoal-green, not pure black |
| Text (muted) | `#5B6B62` | `--zg-text-muted` | Helper text, secondary labels, placeholders |
| Editable field bg | `#FFFFFF` | `--zg-field-bg` | Text inputs, selects, textareas — border `#CBD5D1` |
| Read-only field bg | `#F1EFE6` | `--zg-field-readonly` | Ticket Number, Ticket Date, and other system-generated fields |
| Error | `#B3261E` | `--zg-error` | Border + text for invalid fields, error banners |
| Error background | `#FBEAE9` | `--zg-error-bg` | Error banner/toast background |
| Warning | `#B8860B` (amber) | `--zg-warning` | Warning callouts/badges only — never decorative |
| Success | `#0B7A46` on `#EAF6EF` | `--zg-success` | Success banners, "created" confirmation |

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

## 2. Typography & Spacing

- Font family: system stack (`-apple-system, "Segoe UI", Roboto, sans-serif`) — no
  external font load required.
- Base body size: `14px` desktop / `15px` mobile (Bootstrap default scale, unmodified).
- Headings: `h1` (page titles) `24px/1.3` weight 600; `h2` (section headers) `18px`
  weight 600; both use `--zg-text`, never pure black.
- Labels above controls: `13px`, weight 600, `--zg-text-muted`, `4px` bottom margin.
- Spacing scale: multiples of `4px` (Bootstrap's default `$spacer` grid: 4/8/12/16/24/32).
  Card padding `24px` desktop, `16px` mobile. Form field vertical gap `16px`.

## 3. Field States

| State | Style |
|---|---|
| Editable, default | `--zg-field-bg` background, `1px solid --zg-field-border`, `4px` radius |
| Editable, focused | Border `--zg-focus-ring`, `2px` outer box-shadow ring (`0 0 0 2px rgba(11,122,70,0.25)`) — never remove the outline, only restyle it |
| Read-only | `--zg-field-readonly` background, no border-hover change, `cursor: default`, still legible (not greyed to illegibility) |
| Invalid | Border `--zg-error` `2px`, error text `13px` `--zg-error` directly below the field, preceded by a small icon; message appears immediately on blur/submit, not only in a page-top summary |
| Disabled | `opacity: 0.6`, `cursor: not-allowed`, no hover/focus style change, never clickable |
| Required marker | Red asterisk (`--zg-error` color) immediately after the label text; the asterisk is supplementary only — the validation message is still required on failure |

## 4. Buttons

| Variant | Style | Usage |
|---|---|---|
| Primary | `--zg-primary` background, white text, `--zg-secondary` on hover | Submit, Continue, Create Ticket |
| Secondary | White background, `--zg-primary` border + text | Cancel, Back |
| Tertiary / link-style | No background/border, `--zg-secondary` text, underline on hover | Clear Filters, Change Requester |
| Destructive | White background, `--zg-error` border + text; `--zg-error` solid on confirm step | Remove Attachment |
| Busy | Primary style + inline spinner + disabled state; label changes to a verb-ing form (e.g. "Submitting…") | Any submit button mid-request |
| Disabled | `opacity: 0.5`, `cursor: not-allowed`, non-interactive | Submit while invalid/in-flight |

All icon-only buttons (e.g. a table-row "view" icon) require `aria-label` and a
`title` tooltip — icons must never be the only way to identify a control's purpose.

## 5. Badges (Priority / Status)

| Badge | Background | Text |
|---|---|---|
| Priority LOW | `--zg-pale` | `--zg-secondary` |
| Priority MEDIUM | `#FDF3D8` | `--zg-warning` |
| Priority HIGH | `--zg-error-bg` | `--zg-error` |
| Status NEW | `--zg-pale` | `--zg-secondary` |
| Status OPEN | `#E7F0FA` | `#1F5F9C` |
| Status IN_PROGRESS | `#FDF3D8` | `--zg-warning` |
| Status RESOLVED | `--zg-pale` | `--zg-secondary` |

Badges never rely on color alone — each includes its text label, never a bare color
chip. Rounded pill shape (`border-radius: 999px`), `12px` horizontal padding, `4px`
vertical padding, `12px` font, weight 600.

## 6. Screens

### 6.1 Application Shell
- Header: `--zg-primary` background, white "TokTickIT" wordmark + clock icon (left),
  nav links "My Tickets" / "Create Ticket" (center-left), current Requester name +
  "Change Requester" under a Profile dropdown (right).
- Active nav item: `--zg-secondary` bottom border (`2px`), bold weight; inactive items
  are white at 85% opacity.
- Mobile (`<768px`): nav collapses into a hamburger/offcanvas menu; Requester name
  moves into the same offcanvas panel.

### 6.2 Development Requester Selection
- Centered card (max-width `480px`) on `--zg-bg` background.
- Icon badge (pale green circle) + "Select Development Requester" `h1`.
- Explanatory text: *"Choose a development requester to simulate the current requester
  context for Lab 2. This is for testing only and is not a login screen."*
- Labeled dropdown "Development Requester *", populated from `GET /api/requesters`.
- Info callout (pale green): "Only active development requesters are shown."
- Secondary callout (neutral grey): "Authentication coming in Lab 3 — In Lab 3, this
  selection will be replaced with secure authentication."
- Footer buttons: Cancel (secondary) + Continue (primary, disabled until a Requester
  is chosen).
- **Loading:** dropdown replaced by a skeleton/spinner row, Continue disabled.
- **Empty:** if zero active Requesters return, dropdown area replaced by a message
  ("No active development requesters are available. Contact an administrator.") —
  Continue stays disabled.
- **API failure:** error banner ("Unable to load development requesters. Check your
  connection and try again.") + Retry button; Continue disabled.

### 6.3 Create Ticket (Create Mode)
Field order top → bottom:
1. **System-generated row** (read-only styling): Ticket Number ("Generated after
   submission"), Ticket Date (today's date/time, live client clock is *not* required —
   a static "Generated at submission" placeholder is acceptable pre-submit).
2. **Requester** (read-only): current Requester's name, populated from session context.
3. **Classification row** (2–3 columns desktop, stacked mobile): Category (select),
   Related System (select), Requested Priority (select: Low/Medium/High).
4. **Ticket Summary** (single-line input, full width, character counter `x/150`).
5. **Description** (textarea, full width, min-height `120px`, vertically resizable
   only, character counter `x/2000`).
6. **Attachments** section: drag-and-drop/browse zone, list of selected files with
   name + size + remove-before-submit icon, inline error per rejected file (wrong
   type / too large / limit reached).
7. **Actions row:** Cancel (secondary, left) — Submit Ticket (primary, right).

States:
- **Initial:** all fields empty/default, Submit enabled once required fields are valid.
- **Validation failure:** invalid fields get `--zg-error` border + message; page does
  not scroll-jump destructively, first invalid field receives focus.
- **Submitting:** Submit shows spinner + "Submitting…", all fields disabled.
- **Success:** form area replaced by a success panel (`--zg-pale` background) showing
  the returned Ticket Number in large text, "View Ticket" and "Create Another" actions.
- **API failure:** error banner above the form ("Unable to submit ticket. Please try
  again."), all entered values preserved, fields re-enabled.
- **Invalid attachment:** per-file inline error (e.g. "example.exe — file type not
  allowed", "photo.png — exceeds 5MB limit"); valid files in the same batch are still
  accepted.

### 6.4 My Tickets
- Page header: "My Tickets" `h1` + subtitle, "Clear Filters" (tertiary) and "+ Create
  Ticket" (primary) top-right.
- Toolbar row: search input (icon-prefixed, placeholder "Search by ticket number or
  summary…"), Category / Requested Priority / IT Priority / Current Status filter
  selects.
- **Desktop table** columns: Ticket No. (sortable), Created Date (sortable), Summary,
  Category, Requested Priority (badge), Current Status (badge), Last Updated
  (sortable). Sortable headers show a directional caret.
- **Mobile (`<768px`):** each Ticket renders as a stacked card — Ticket No. + Status
  badge on the top row, Summary below, Category/Priority/Date as labeled key-value
  pairs beneath.
- Footer: "Showing X to Y of Z tickets" + pagination controls (Previous / page numbers
  / Next), page-size selector (10/20/50).
- **Loading:** skeleton rows/cards in place of data.
- **Empty (zero tickets ever):** centered illustration/icon + "You haven't created any
  tickets yet." + Create Ticket button.
- **No results (filters applied):** centered message "No tickets match your filters."
  + Clear Filters button.
- **API failure:** error banner + Retry button, table area hidden.

### 6.5 Requester Ticket Detail (View Mode)
- Breadcrumb: "My Tickets > Ticket Details" with a "← Back to My Tickets" action.
- Read-only info grid (matches Figure 1 layout, minus Ticket Owner — out of scope):
  Ticket No., Ticket Date, Category, Related System / Requester, Requested Priority,
  IT Priority ("Not set" if null), Current Status (badge) / Summary (full width) /
  Description (full width, preserves line breaks).
- **Attachments section** (visually separated by a divider + "Attachments (n)"
  header): list/table of attachments — file name, type icon, size, uploaded date,
  status (Active / Removed badge), and per-row actions (Download — disabled if
  removed; Remove — hidden if already removed).
  - "Add Attachment" control above the list, reusing the same drag/browse component
    as Create Ticket, respecting the 5-active-file cap (BR-20).
  - Remove flow: click Remove → confirmation modal requiring a removal reason
    (min 3 chars) → on confirm, row updates in place to "Removed" state, download
    disabled, reason shown on hover/expand.
- No Public Comments, Internal Notes, or Actions Taken sections are rendered (out of
  scope per §4.2 of the handout).

### 6.6 Screen Modes Summary
| Screen | Modes |
|---|---|
| Create Ticket | initial → validating → submitting → success / failure |
| My Tickets | loading → data / empty / no-results / failure |
| Ticket Detail | loading → view / not-found (404) / failure; Attachments: idle → uploading → success/failure, active → removing → removed |

## 7. Responsive Rules

| Viewport | Behavior |
|---|---|
| Desktop ≥ 992px | Full multi-column layouts as described per screen; content max-width `1140px`, centered. |
| Tablet 768–991px | Two-column layout where practical (e.g. Classification row wraps to 2 cols); Summary/Description keep full available width. |
| Mobile < 768px | All fields stack in a single column; buttons full-width and ≥44px tall (touch target); My Tickets renders as cards, not a table; no horizontal page scroll anywhere. |
| All sizes | No clipped labels, no overlapping validation messages, no hidden buttons, attachment file names truncate with ellipsis + full name on hover/focus rather than overflowing. |

## 8. Accessibility

- Every form control has a associated `<label>` (via `htmlFor`/`id`), not placeholder-
  only labeling.
- Focus outline (`--zg-focus-ring`) must remain visible for all interactive elements;
  never set `outline: none` without a replacement focus style.
- Status/Priority meaning is never conveyed by color alone — badge text is always
  present.
- Icon-only buttons carry `aria-label` + `title`.
- Modals (e.g. Remove Attachment confirmation) trap focus and are dismissible via
  `Esc` and a visible close control.

## 9. Visual Inspection Checklist (per screenshot round)

- [ ] Colors match the token table exactly (no ad-hoc greens/reds).
- [ ] Editable vs. read-only fields are visually distinguishable at a glance.
- [ ] Every required field shows an asterisk AND (on failure) an inline message.
- [ ] Button hierarchy is visually clear (one primary action per screen at a time).
- [ ] No clipped text, overlapping elements, or unintended horizontal scrolling at
      320px, 768px, and 1280px widths.
- [ ] Priority/Status badges are consistent across My Tickets and Ticket Detail.
- [ ] Empty, no-results, loading, and failure states were all captured, not just the
      happy path.
- [ ] Mobile My Tickets renders as cards; desktop renders as a table.

## 10. Screenshot Paths (for `artifacts/lab-02/screenshots/`)

```
artifacts/lab-02/screenshots/
├── create-ticket/   (initial, validation-error, submitting, success, api-failure,
│                     invalid-attachment — desktop + mobile)
├── my-tickets/      (loaded, empty, no-results, filtered, mobile-cards)
└── ticket-detail/   (loaded, attachment-added, attachment-removed, mobile)
```
