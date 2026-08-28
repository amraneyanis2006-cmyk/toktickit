# Peer Review Summary (`reviewer.md`)

## Peer Review Information

| Field | Details |
| :--- | :--- |
| **Author Name** | Yanis Amrane |
| **Author ID** | 69540460041 |
| **Author GitHub** | `amraneyanis2006-cmyk` |
| **Reviewer Partner Name** | Maxime Darwiche |
| **Reviewer Partner ID** | 69540460044 |
| **Reviewer Partner GitHub** | `Maxboox` |
| **Reviewer Partner Name** | Remy Fahs |
| **Reviewer Partner ID** | 69540460043 |
| **Reviewer Partner GitHub** | `Ramy-web92` |
| **Reviewer Partner Name** | Simeon Audouit |
| **Reviewer Partner ID** | 69540460046 |
| **Reviewer Partner GitHub** | `Siméon-94` |

---

## Review Interactions & Feedback

| Direction | Review Comment | Author Response | Action Taken |
| :--- | :--- | :--- | :--- |
| **Partner → My PR**<br>*(Siméon on PR #12 — test: Playwright E2E suite (5 flows) — create/attachment/search/isolation/inactive-exclusion)* | "Nice, clean set of specs. Two things before I approve: (1) E2E-04 — using `Date.now()` as a suffix is fine for uniqueness, but if two runs land in the same millisecond in CI (parallel workers?) you could still collide. Did you check the Playwright config for parallelism here? (2) Can you confirm E2E-02 actually hits the API directly too, not just through the UI? The #10 audit was about endpoint-level scoping, so I want the E2E test to catch a regression there even if the frontend UI happens to hide it." | "Good catches. (1) Playwright config here runs this project with `workers: 1` (see `e2e/lab-02/playwright.config.ts`), so no parallel collision risk for now. If we ever bump workers for speed, `Date.now()` alone won't be enough — I'll switch to `${Date.now()}-${crypto.randomUUID()}` at that point rather than doing it preemptively. (2) Yes — `cross-requester-isolation.spec.ts` does both: it drives the UI to confirm Requester A can't see B's tickets in My Tickets/Ticket Detail, then makes a direct API call (`GET /api/tickets/:id` with Requester A's session against one of B's ticket IDs) and asserts a 403/404 rather than 200. That's the part that actually re-validates the #10 audit." | Merged. |
| **Partner → My PR**<br>*(Remy on PR #11 — test: Playwright responsive/visual QA suite + screenshot archive)* | "This is way more thorough than I expected for a 'screenshot' issue — the tap-target catch on Ticket Detail alone justifies the extra scope. Two things: (1) good instinct flagging the RESP-02 tablet/desktop gap instead of just faking a test to match the spec's wording; (2) how did you land on Jennifer Anderson / Michael Brown by name in the specs instead of hardcoded IDs like `x-requester-id: 1`? Feels more fragile if the seed data changes order, but maybe that's the point?" | "Yeah, that's deliberate — `selectRequester(page, name)` goes through the actual UI dropdown by label text, not a raw header injection like the API curl tests use. It's slightly more fragile to seed renames, sure, but the seed's upsert keys off email, so the names themselves are stable across runs even if insertion order or IDs shift — which matters here since I picked Jennifer/Michael specifically because I'd manually verified their exact ticket counts (16 and 0) beforehand, and an ID could silently point to a different person if the DB gets reseeded differently. If it becomes a real maintenance problem in #12 we could add a dedicated 'always-empty' seed requester with a name that signals intent, but for one-off screenshot fixtures I didn't want to touch the seed file for this." | Merged. |
| **Partner → My PR**<br>*(Maxime on PR #6 — feat: implement attachment upload endpoint)* | "Solid coverage on the error paths — validating type/size before touching disk (`memoryStorage`, then a single write after all checks pass) is the right call, keeps you from ever writing an orphaned file. Question: since the Attachment model already has `storedFileName`/`isRemoved`/`removedAt`/`removalReason` fully modeled, does that mean #9 (download + soft-remove) is mostly wiring against existing schema rather than new design work?" | "Yes exactly — the schema and the ownership-check pattern (`findFirst` scoped by `requesterId`) are already in place and proven out here, so #9 is really just two more routes (`GET /api/attachments/:id/download` and `PATCH /api/attachments/:id/remove`) following the same shape: same 404-for-unowned convention, same validation-before-mutation order. No new modeling needed." | Merged. |
| **My Review → Partner's PR**<br>*(Yanis on Remy's PR — final Lab 2 review)* | "Great work on this PR! All features are implemented and working correctly. All PRs are properly merged into lab2-staging. All tasks from the lab spec are completed. Code looks clean and tests are passing. Approved!" | "Thanks for the review! Merging now." | Merged. |

---

## Summary

Across the Lab 2 sprint, review cycles with Maxime, Remy, and Siméon consistently focused on two recurring themes: **ownership/security enforcement** (cross-Requester data isolation, verified at both the UI and direct-API level in #12) and **test/fixture design rigor** (parallelism/idempotency assumptions in E2E-04, deliberate name-based vs. ID-based Requester selection in #11). One process issue surfaced along the way: `server/.env` was accidentally committed in an early commit (`6b5cfbb6`, Issue #2) and removed from tracking shortly after (`1aa649d7`, merged into `lab2-staging` via PR #10 — a fix PR, not to be confused with the Issue #10 ownership audit). The committed file was reviewed and confirmed to contain only Prisma's default local-dev boilerplate (`postgres://postgres:postgres@localhost:...`), not a real secret, but `.env` has been in `.gitignore` since.