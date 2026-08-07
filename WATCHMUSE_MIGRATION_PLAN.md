# WatchMuse — Migration Plan

**Status:** accepted architectural decision — **B) REFACTOR SELECTED PARTS**. The application will **not** be rebuilt.
**Source of truth for findings:** `WATCHMUSE_ARCHITECTURE_AUDIT.md`
**Scope of this document:** sequencing, not implementation. No application code is written here.
**Hard constraint:** the application must be in a **working, shippable state after every phase**.

**Target direction**

```
Browser → API Routes → WatchMuse Services → ContentProvider contract → TMDb Adapter → TMDb API
```

**Product decisions confirmed for this migration**

| Decision | Choice | Consequence |
| --- | --- | --- |
| Search endpoint | `/search/multi` | One upstream request per keystroke instead of two — halves quota burn, directly supports the Phase 6 rate-limit gate |
| Media type in UI | Mixed list + "Film"/"Dizi" badge | No filter UI, no new client state |
| `?type=` API param | **Not built** | Nothing consumes it; see *Deliberately NOT doing* in Phase 2 |

---

# Architectural Invariants

These hold from Phase 0 through Phase 6. **A phase that violates any of these is not complete, regardless of whether tests pass.** Each is verifiable by the stated command.

| # | Invariant | Verification |
| --- | --- | --- |
| I-1 | `TMDB_ACCESS_TOKEN` is read in **exactly one module**, server-side only | `grep -rn "TMDB_ACCESS_TOKEN" src/` returns exactly one `process.env` read |
| I-2 | Every module that can touch the token imports `server-only` | `grep -L 'server-only'` over the adapter/config directory returns nothing |
| I-3 | No `NEXT_PUBLIC_` variable ever holds a secret | `grep -rn "NEXT_PUBLIC_" src/ next.config.ts` returns nothing |
| I-4 | Raw provider responses never cross into components | No component references a snake_case upstream field (`poster_path`, `provider_id`, `first_air_date`, …) |
| I-5 | All upstream payloads pass through defensive normalization that **cannot throw** | Malformed-input tests in every phase ≥ 1 |
| I-6 | Contracts are application-owned, not provider-shaped | `src/lib/contracts/` imports nothing from the adapter |
| I-7 | Three-state availability semantics preserved: `available` / `unavailable` / `unknown` | Locked by Phase 1 tests |
| I-8 | Provider matching is by **ID only**, never by name | Locked by Phase 1 test "provider named Netflix with wrong ID → unavailable" |
| I-9 | Only `results.TR` + only `flatrate` counts as subscription-included | Locked by Phase 1 rent/buy tests |
| I-10 | Stale-response protection survives every refactor of the client | Outcome objects stay keyed by their input |
| I-11 | Zero secret-bearing values in logs or error messages | `grep -rn "console\." src/` — any addition must go through the redacting logger (Phase 6) |
| I-12 | Dependency tree stays lean; every addition is justified in writing | `npm ls --depth=0` reviewed at each phase gate |
| I-13 | **`next build` succeeds with no `TMDB_ACCESS_TOKEN` present** | Run build in a shell without the variable |
| I-14 | Config layer never throws at module scope | Absent token yields `null`, not an exception |
| I-15 | Cache keys are namespaced by media type once TV exists | Phase 2 onward |

> **I-13 is the invariant most likely to be broken by accident.** The moment configuration validation moves to module scope — a very natural-looking "improvement" — CI builds and secret-less environments break. Keep the read lazy.

---

# Phase 0 — Establish a Rollback Baseline

> **This is a prerequisite, not a migration phase.** It changes no code.

## 1. Goal

Create a committed, restorable baseline of the current working application.

## 2. Why it happens at this point in the sequence

**Because right now there is nothing to roll back to.** Verified:

```
git rev-list --all --count        → 1
git ls-tree -r HEAD -- src        → favicon.ico, globals.css, layout.tsx, page.tsx
git status --porcelain | grep ??  → src/app/api/, src/components/, src/lib/
```

The single existing commit is the untouched `create-next-app` scaffold. **Approximately 95% of the application — every file under `src/lib/`, `src/components/`, and `src/app/api/` — has never been committed.**

Consequences if this is skipped:

- `git revert` and `git reset` have nothing to restore. The "Rollback strategy" section of every phase below would be fiction.
- A botched refactor, a bad merge, or an errant `git clean` destroys the work permanently.
- There is no diff baseline, so no phase can be reviewed as a changeset.

This is the single highest-risk condition in the repository today, and it costs minutes to fix.

## 3. Files expected to be created

None.

## 4. Files expected to be modified

None. (Git index only.)

## 5. Files expected to be deleted

None.

## 6. Detailed implementation steps

1. Confirm the working tree is in a good state: `npm run lint`, `npm run typecheck`, `npm run build` all pass.
2. Confirm no secret is stage-able: `git status --porcelain | grep -i env` must show only `.env.example`. `git check-ignore -v .env.local` must report a match.
3. Stage everything except the deliberately-excluded files: `git add -A`.
4. **Re-verify before committing:** `git diff --cached --name-only | grep -i "^\.env"` must output **only** `.env.example`.
5. Commit as the baseline (e.g. `chore: commit working WatchMuse demo baseline before migration`).
6. Tag it: `git tag pre-migration-baseline`.
7. Adopt the branch/commit discipline used by every phase below: one branch per phase, one squashed commit per phase, merged only after that phase's acceptance criteria pass.

## 7. Tests to add/run

None new. Run the existing gate — lint, typecheck, build — before committing, so the baseline is known-good rather than merely known-current.

## 8. Acceptance criteria

- `git rev-list --all --count` ≥ 2.
- `git ls-tree -r HEAD --name-only -- src | wc -l` = 21.
- `git status --porcelain` shows a clean tree (aside from intentionally ignored files).
- `git tag` lists `pre-migration-baseline`.

## 9. Security invariants

- **No `.env*` file other than `.env.example` may be staged.** Verified twice — before staging and after (step 4).
- `.gitignore` remains unchanged; the `!.env.example` exception at line 36 stays.
- If a secret is ever staged by accident: **do not amend and move on.** Rotate the TMDb token first, then clean the index.

## 10. Regression risks

- Committing `.env.local` — mitigated by the double check in steps 2 and 4.
- Committing `node_modules/`, `.next/`, or `tsconfig.tsbuildinfo` — already covered by `.gitignore`; confirm via `git status` output length.

## 11. Rollback strategy

Not applicable — this phase creates the rollback capability. If the commit itself is wrong, `git reset --soft HEAD~1` restores the index without touching files.

## 12. STOP condition before Phase 1

> **Do not begin Phase 1 until `git tag` shows `pre-migration-baseline` and `git status` is clean.** Every subsequent phase's rollback strategy depends on this tag existing.

---

# Phase 1 — Make Current Behavior Testable

## 1. Goal

Freeze the **current, known-correct** availability-classification behavior behind unit tests, by extracting the minimum pure logic required to test it. **No behavior changes.**

## 2. Why it happens at this point in the sequence

Phase 2 renames types, routes, cache keys, and components simultaneously. Phase 3 relocates modules across new layer boundaries. Both are mechanical but wide.

Without tests, those phases are unverifiable: the classification rule is subtle (`flatrate` only, TR only, ID-matched only, three-state) and a regression would be **silent** — the UI would confidently tell a user a title is on Netflix when it is not. Nothing would fail. No exception, no log, no visible defect.

Tests written **before** the renames become the safety net **for** the renames. Written after, they merely describe whatever the refactor happened to produce.

There is also a hard mechanical blocker: `src/lib/tmdb/providers.ts:1` imports `server-only`, which throws outside a bundler context. The classification function cannot be imported by a test runner until it is extracted. That extraction is the whole of this phase's structural work.

## 3. Files expected to be created

| File | Purpose |
| --- | --- |
| `src/lib/tmdb/providers-normalize.ts` | `normalizeProvidersResponse` + `normalizeFlatrate`, moved verbatim. **No `server-only` import.** |
| `src/lib/tmdb/search-normalize.ts` | `normalizeSearchResponse` + `normalizeMovie`, moved verbatim. **No `server-only` import.** |
| `src/lib/tmdb/providers-normalize.test.ts` | The classification test suite |
| `src/lib/tmdb/search-normalize.test.ts` | Search normalization tests |
| `src/lib/tmdb/normalize.test.ts` | Primitive/sanitization tests |
| `vitest.config.ts` | Minimal; see step 3 |

## 4. Files expected to be modified

| File | Change |
| --- | --- |
| `src/lib/tmdb/providers.ts` | Delete the two moved functions; import them instead. Keeps `server-only`, fetch, cache. |
| `src/lib/tmdb/search.ts` | Same. |
| `package.json` | Add `vitest` devDependency; add `"test": "vitest run"` and `"test:watch": "vitest"` |

## 5. Files expected to be deleted

None.

## 6. Detailed implementation steps

1. **Move, do not rewrite.** Cut `normalizeProvidersResponse` and `normalizeFlatrate` out of `providers.ts` into `providers-normalize.ts` and export them. Keep the existing relative imports (`./constants`, `./normalize`, `./types`) — none of these pull in `server-only`, which is precisely why the extraction works. **Change no logic, no parameter order, no return shape.**
2. Repeat for `normalizeSearchResponse` / `normalizeMovie` → `search-normalize.ts`.
3. Add `vitest` as a devDependency. **Nothing else** — no `jsdom`, no `@testing-library/react`, no `happy-dom`. Everything under test is a pure function; there is no component to render. `vitest.config.ts` can be near-empty (`test: { environment: "node" }`); it exists mainly to make the setup explicit and to hold a `@/` alias if one is ever needed.
4. In test files, **import test helpers explicitly** (`import { describe, it, expect } from "vitest"`) rather than enabling `globals: true`. This avoids adding `vitest/globals` to `tsconfig.json` types, keeping the TypeScript config untouched.
5. Write fixtures as **hand-authored literal objects** inside the test files — small, readable, and obviously not production data. Do not fetch from TMDb in tests.
6. Run the full gate: `npm run test && npm run lint && npm run typecheck && npm run build`.

> **On discovering questionable behavior:** if a test reveals something arguably wrong, **do not fix it in this phase.** Assert the current behavior and mark it `// KNOWN-BEHAVIOR:` with a short note. Phase 1 exists to freeze the baseline; changing behavior and structure in the same phase destroys the ability to attribute a regression to either.

## 7. Tests to add/run

Against `normalizeProvidersResponse` — the required matrix:

| # | Fixture | Expected |
| --- | --- | --- |
| 1 | `results.TR.flatrate` contains provider_id `8` | `netflix.available === true` |
| 2 | Netflix ID `8` appears **only** under `results.TR.rent` | `netflix.available === false` |
| 3 | Netflix ID `8` appears **only** under `results.TR.buy` | `netflix.available === false` |
| 4 | `results.TR.flatrate` contains provider_id `119` | `prime_video.available === true` |
| 5 | `flatrate` contains `1796` (Netflix ads tier) | `netflix.available === true` |
| 6 | `flatrate` contains `2100` (Prime ads tier) | `prime_video.available === true` |
| 7 | `flatrate` contains `{provider_id: 9999, provider_name: "Netflix"}` | `netflix.available === false` — **proves ID-only matching** |
| 8 | `results` has no `TR` key | `hasRegionData === false`, both providers `false` |
| 9 | `results` contains only `US` (with Netflix in flatrate) | `hasRegionData === false` — **proves region isolation** |
| 10 | `results.TR` present but no `flatrate` key | `hasRegionData === true`, both `false` — the "Bulunamadı" case |
| 11 | Malformed: `null`, `[]`, `{results: null}`, `{results:{TR:{flatrate:"x"}}}`, `{results:{TR:{flatrate:[null, 5, {}]}}}` | No throw; sane defaults |
| 12 | `flatrate` contains a duplicate provider_id | Deduplicated |
| 13 | `otherFlatrateProviders` | Excludes target IDs, includes non-target ones |

Against `toExternalHttpsUrl` (`src/lib/tmdb/normalize.ts`) — sanitization:

| # | Input | Expected |
| --- | --- | --- |
| 14 | `"javascript:alert(1)"` | `null` |
| 15 | `"http://example.com"` | `null` — https only |
| 16 | `"data:text/html,..."` | `null` |
| 17 | `"https://www.themoviedb.org/..."` | passes through |
| 18 | `""`, `null`, `123`, `"not a url"` | `null`, no throw |

Against the other primitives: `toReleaseYear` (valid date, empty, `null`, out-of-range year, malformed), `asPositiveInteger` (`0`, `-1`, `1.5`, `"3"`, `NaN`), `normalizeMovie` (missing `id` → dropped; missing `title` → falls back to `original_title`; both missing → dropped; `vote_average: 0` → `null`).

## 8. Acceptance criteria

- `npm run test` passes; all 18 numbered cases above are present and green.
- `npm run lint`, `npm run typecheck`, `npm run build` all pass.
- `git diff` on `providers.ts` and `search.ts` shows **only deletions and one import line** — no logic edits.
- Manual smoke: search a known title, select it, confirm the availability panel renders exactly as before.
- `npm ls --depth=0` shows exactly one new devDependency: `vitest`.

## 9. Security invariants

- The extracted modules **must not** import `server-only` — but they also **must not** read `process.env`, perform I/O, or accept a token. They are pure transformations. Verify: `grep -n "process.env\|fetch(" src/lib/tmdb/*-normalize.ts` returns nothing.
- `providers.ts` and `search.ts` **keep** their `server-only` import (I-2).
- Fixtures contain no real credential and no captured live response.

## 10. Regression risks

| Risk | Mitigation |
| --- | --- |
| Silent logic drift while "moving" code | Review the diff line-by-line; the moved bodies must be byte-identical |
| `next build` type-checks `*.test.ts` and fails on `vitest` imports | Expected to work (vitest is a devDependency, type-only resolution succeeds). **Contingency if it fails:** add `"**/*.test.ts"` to `tsconfig.json` `exclude` and run a separate `tsconfig.test.json` for test type-checking. Do not pre-apply this. |
| Vitest scanning `.next/` | No test files exist there; add an explicit `exclude` in `vitest.config.ts` if it becomes noisy |
| Tests encoding a *bug* as correct | Accepted and intentional. The `KNOWN-BEHAVIOR` marker makes it reviewable later. |

## 11. Rollback strategy

Purely additive to two files plus new files. `git revert` the phase commit, or `git checkout pre-migration-baseline -- src/lib/tmdb/providers.ts src/lib/tmdb/search.ts` and delete the new files. Zero runtime impact from a rollback.

## 12. Deliberately NOT doing

- **Not testing route handlers.** They are 26–29 line wrappers whose only logic (input validation) is trivially visible. Covered indirectly.
- **Not testing components.** Would require `jsdom` + testing-library — two dependencies to assert on markup that Phase 5 will change anyway.
- **Not adding coverage thresholds.** They reward testing getters.
- **Not fixing anything.** See the KNOWN-BEHAVIOR note.

## 13. STOP condition before Phase 2

> **Do not begin Phase 2 until the classification test suite is green and committed.** Phase 2's renames are only safe because these tests exist. If the suite is incomplete, Phase 2 is guesswork.

---

# Phase 2 — Product Domain Model (MediaType / Title)

## 1. Goal

Introduce `MediaType = "movie" | "tv"`, add real TV support, move terminology from Movie-oriented to Title-oriented, and relocate application contracts out of TMDb-specific naming.

## 2. Why it happens at this point in the sequence

This is the **widest** change in the migration: it touches contracts, routes, cache keys, the adapter, and every component at once. Its cost grows with every file added, so it belongs as early as tests allow.

It is placed **after** Phase 1 because the tests are what make a change of this width reviewable, and **before** Phase 3 because there is no sense defining a `ContentProvider` contract around a model that is about to change shape. Defining the seam first would mean designing the interface twice.

It is also the last moment the public API surface is free to change: once anything external consumes `/api/movies/*`, renaming becomes a breaking change with a deprecation window.

## 3. Files expected to be created

| File | Purpose |
| --- | --- |
| `src/lib/contracts/media.ts` | `MediaType`, `TitleSummary`, `TitleSearchResult` |
| `src/lib/contracts/availability.ts` | `AvailabilityResult`, `ProviderAvailability`, `FlatrateProvider` |
| `src/lib/contracts/errors.ts` | `ApiErrorBody` |
| `src/app/api/titles/search/route.ts` | Replaces the movies search route |
| `src/app/api/titles/[mediaType]/[id]/availability/route.ts` | Replaces the providers route |
| `src/components/MediaTypeBadge.tsx` | "Film" / "Dizi" indicator |

## 4. Files expected to be modified

| File | Change |
| --- | --- |
| `src/lib/tmdb/search.ts` | Switch to `/search/multi`; media-type-aware cache key |
| `src/lib/tmdb/search-normalize.ts` | Handle both media types; filter out `person` |
| `src/lib/tmdb/providers.ts` | Accept `mediaType`; call `/movie/…` or `/tv/…`; namespace cache key |
| `src/lib/tmdb/providers-normalize.ts` | Rename output type; `justWatchUrl` → `deepLinkUrl` |
| `src/lib/tmdb/*.test.ts` | Update imports/type names; **add TV cases** |
| `src/components/*` | Rename to Title-oriented; consume new contracts |
| `src/app/page.tsx` | Update the component import |

## 5. Files expected to be deleted

| File | Note |
| --- | --- |
| `src/lib/tmdb/types.ts` | Content moves to `src/lib/contracts/` |
| `src/app/api/movies/search/route.ts` | Replaced |
| `src/app/api/movies/[id]/providers/route.ts` | Replaced |

Component renames are moves, not deletions — use `git mv` so history follows.

## 6. Detailed implementation steps

1. **Create the contracts directory first**, with the new shape:
   ```ts
   export type MediaType = "movie" | "tv";

   export interface TitleSummary {
     id: number;
     mediaType: MediaType;      // NEW
     title: string;
     originalTitle: string | null;
     releaseYear: number | null;
     posterUrl: string | null;
     overview: string | null;
     voteAverage: number | null;
   }
   ```
   Note `posterPath` is **gone** — verified unused in every component (only `posterUrl` is consumed by `MoviePoster.tsx`).

2. **`AvailabilityResult`** replaces `MovieProvidersResult`:
   - `movieId` → `titleId` + `mediaType`
   - `justWatchUrl` → `deepLinkUrl`
   - `matchedProviderId` **removed** — verified unused in components. The instruction *"TMDb-specific provider identifiers must not become a general application concept unless explicitly namespaced"* is satisfied here by **deletion rather than namespacing**; namespacing a field nobody reads would be invented work.
   - `FlatrateProvider.name` is **kept** (consumed at `ProviderPanel.tsx:127`). `FlatrateProvider.id` is kept but documented as adapter-scoped.

3. **Search: switch to `/search/multi`.** One upstream call returns movies, TV, and people. In `search-normalize.ts`:
   - Read `media_type` from each result. Keep only `"movie"` and `"tv"`; **drop `"person"` and anything unrecognized** (consistent with the existing "drop records we cannot trust" discipline).
   - **⚠️ TMDb uses different field names per media type.** This is the highest-risk detail in this phase:

     | Concept | movie | tv |
     | --- | --- | --- |
     | Title | `title` | `name` |
     | Original title | `original_title` | `original_name` |
     | Release date | `release_date` | `first_air_date` |

     If this is missed, **every TV result silently renders with an empty title and no year** — and `normalizeMovie`'s existing "drop records without a title" rule would delete all TV results instead of erroring. The failure looks like "TV search returns nothing," not like a bug. Add tests specifically for this (see §7).

4. **Availability: media-type-aware endpoint.** `/movie/{id}/watch/providers` or `/tv/{id}/watch/providers`, selected by `mediaType`. The TR/`flatrate` classification logic is **unchanged** — Phase 1 tests must still pass untouched.

5. **⚠️ Cache keys must include media type.** TMDb's movie and TV ID spaces are **independent**: `movie/1399` and `tv/1399` are different works. A cache keyed on the bare ID would serve a film's availability for a series. This is silent data corruption with no error surface. Use `availability:${mediaType}:${id}`; keep `search:${normalizedQuery}` (multi-search is already type-agnostic).

6. **Routes.** `/api/titles/search?q=`, and `/api/titles/[mediaType]/[id]/availability`. Validate `mediaType` against the union **before** it reaches a URL template — reject anything not exactly `movie` or `tv` with a 400. This preserves the existing path-injection protection.

7. **Components.** `MovieSearch → TitleSearch`, `MovieResultList → TitleResultList`, `MoviePoster → TitlePoster`, `ProviderPanel → AvailabilityPanel`. Add `MediaTypeBadge` to each row.
   - The badge must distinguish by **text label, not colour** — Phase 5 removes hue-based communication, and adding a coloured badge now creates work that Phase 5 immediately undoes.

8. **Commit client and server together.** The route rename is a coordinated breaking change; a split commit leaves the repository in a non-working state, violating the migration's core constraint.

## 7. Tests to add/run

- **All Phase 1 tests must still pass** after renaming — this is the primary signal that the classification rule survived.
- New: movie result via `/search/multi` (`title`/`release_date`) → correct title and year.
- New: TV result via `/search/multi` (`name`/`first_air_date`) → **correct title and year** (the §6.3 risk).
- New: `media_type: "person"` → dropped.
- New: `media_type` missing or unrecognized → dropped.
- New: mixed payload → `mediaType` correctly assigned per item.
- New: cache key generation — `movie/1399` and `tv/1399` produce **different** keys.
- New: route-level `mediaType` validation rejects `"person"`, `"../"`, `""`.

## 8. Acceptance criteria

- `npm run test`, `lint`, `typecheck`, `build` all pass.
- Manual: searching a TV series returns it with a correct title, year, poster, and "Dizi" badge.
- Manual: selecting a TV series returns Turkish availability.
- Manual: a movie and a series with colliding IDs (or, more practically, two consecutive selections of each) return distinct results — proves cache namespacing.
- `grep -rn "movieId\|MovieSummary\|justWatchUrl\|posterPath" src/` returns nothing.
- `grep -rn "/api/movies" src/` returns nothing.

## 9. Security invariants

- I-1 through I-4 unchanged. The token read point does not move in this phase.
- `mediaType` is **validated against a closed union before URL interpolation** — the new dynamic segment is a new injection surface and must be treated as one.
- Contracts (`src/lib/contracts/`) stay type-only where possible so they remain safe to import from client components (this is why the current `types.ts` is safely client-importable — preserve that property).

## 10. Regression risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| TV field-name mismatch → empty/dropped TV results | **High** | Explicit tests in §7; manual TV smoke test |
| Cache key collision between movie and TV | **High** — silent wrong answers | Dedicated key test + manual check |
| Rename sweep misses a reference | Medium | The four `grep` assertions in §8 |
| `/search/multi` relevance differs from `/search/movie` | Medium | Accepted trade-off; single-request quota saving was the deciding factor |
| `person` results leaking into the UI | Medium | Explicit filter + test |
| Split commit breaks the app between client and server | Medium | Single atomic commit (§6.8) |

## 11. Rollback strategy

`git revert` the single phase commit. Because client and server ship together, the revert is self-consistent. No data migration, no persisted state, no external consumers — the cache is in-process and is discarded on restart.

## 12. Deliberately NOT doing

- **Not adding `?type=` to the search endpoint.** The chosen UI is a mixed list with badges; nothing would send the parameter. Building it now creates untested, unused API surface. Add it with the filter UI, if that is ever wanted.
- **Not adding pagination.** Independent of this phase; still deferred.
- **Not adding season/episode data.** TV availability is title-level; episode-level data is a separate product decision.
- **Not renaming `src/lib/tmdb/`** — that move belongs to Phase 3 where the provider seam is defined. Doing it here would mean moving the same files twice.

## 13. STOP condition before Phase 3

> **Do not begin Phase 3 until TV search and TV availability are verified end-to-end in the browser, and all Phase 1 tests still pass unmodified in substance.** Phase 3 wraps this model in an interface; wrapping an unverified model hides the defect behind another layer.

---

# Phase 3 — Architectural Seams

## 1. Goal

Introduce the four seams that make the architecture swappable without a rewrite: `ContentProvider`, a service layer, `CacheStore`, and a lazy server-only config layer. Plus the normalized `AppError` taxonomy that crosses those boundaries.

## 2. Why it happens at this point in the sequence

The model is now stable (Phase 2) and its behavior is locked (Phase 1). Defining interfaces around a settled model means designing them once.

This phase is also the prerequisite for Phase 6's deployment decision: the `CacheStore` abstraction is what allows the in-memory implementation to be replaced by a shared one **without touching domain code**. Deferring this seam until the deployment target is chosen would force the cache rework and the deployment work into the same change — exactly the coupling this migration exists to avoid.

## 3. Files expected to be created

| File | Purpose |
| --- | --- |
| `src/config/env.ts` | Lazy, server-only, typed configuration |
| `src/lib/cache/types.ts` | `CacheStore` interface |
| `src/lib/cache/memory.ts` | In-memory implementation (adapts existing `ttl-cache.ts`) |
| `src/lib/providers/types.ts` | `ContentProvider` interface |
| `src/lib/providers/tmdb/adapter.ts` | Implements `ContentProvider` |
| `src/lib/providers/tmdb/http.ts` | ★ token read point (moved from `tmdb/client.ts`) |
| `src/lib/providers/tmdb/normalize.ts` | Moved normalizers |
| `src/lib/providers/tmdb/mapping.ts` | Provider ID table (moved from `tmdb/constants.ts`) |
| `src/lib/providers/tmdb/errors.ts` | Maps upstream status → `AppError` |
| `src/lib/services/titleService.ts` | Search orchestration + cache policy |
| `src/lib/services/availabilityService.ts` | Availability orchestration + cache policy |
| `src/lib/errors.ts` | `AppError` + namespaced code union |

## 4. Files expected to be modified

| File | Change |
| --- | --- |
| `src/app/api/titles/**/route.ts` | Call services instead of `lib/tmdb/*` |
| `src/lib/api/responses.ts` | Map `AppError` → HTTP |
| All moved test files | Update import paths only |

## 5. Files expected to be deleted

`src/lib/tmdb/` in its entirety — every file moves under `src/lib/providers/tmdb/`. `src/lib/ttl-cache.ts` becomes `src/lib/cache/memory.ts`. Use `git mv` throughout.

## 6. Detailed implementation steps

1. **`AppError` first**, since everything else references it:
   ```ts
   export type AppErrorCode =
     | "TMDB_NOT_CONFIGURED" | "TMDB_AUTH_FAILED"      // split lands in Phase 4
     | "TMDB_RATE_LIMIT" | "TMDB_TIMEOUT"
     | "TMDB_UPSTREAM_ERROR" | "TMDB_NETWORK_ERROR"
     | "TMDB_INVALID_RESPONSE" | "TMDB_NOT_FOUND"
     | "APP_INVALID_INPUT" | "APP_UNEXPECTED";
   ```
   Keep the existing code → HTTP-status mapping and the existing user-facing Turkish messages verbatim. This is a rename, not a redesign.

2. **`CacheStore` — and this interface must be asynchronous:**
   ```ts
   export interface CacheStore {
     get<T>(key: string): Promise<T | undefined>;
     set<T>(key: string, value: T, ttlMs: number): Promise<void>;
   }
   ```
   > **Why `Promise` even though the in-memory implementation is synchronous:** a synchronous interface cannot be satisfied by Redis, Upstash, or a Next cache handler — all are network-bound. If the interface is synchronous now, the Phase 6 implementation swap **breaks every service call site**, which is precisely the outcome the abstraction exists to prevent. The in-memory implementation simply returns already-resolved promises. This costs a microtask per lookup and buys the deployment-target decision.

   `createTtlCache()` in the current `ttl-cache.ts` already has the right internals (TTL, max entries, pruning); it becomes the memory implementation with an async-wrapped surface.

3. **`ContentProvider` — only what WatchMuse needs today:**
   ```ts
   export interface ContentProvider {
     readonly id: string;                    // "tmdb"
     searchTitles(input: {
       query: string; language: string;
     }): Promise<TitleSearchResult>;
     getAvailability(input: {
       mediaType: MediaType; id: number;
       region: string; language: string;
     }): Promise<AvailabilityResult>;
   }
   ```
   **Two methods. No more.** No `getDetails`, no `getSimilar`, no `getTrending`, no capability flags. Every speculative method is an interface commitment made without a caller to validate it.

4. **Services own caching policy; the provider does not.** Today `search.ts` and `providers.ts` each perform their own cache lookup. After this phase, the adapter is a pure translator (HTTP + normalize) and the service decides what to cache and for how long. This is what makes the adapter independently testable and the cache independently swappable.

5. **Config layer:**
   ```ts
   import "server-only";
   export function getTmdbToken(): string | null { /* lazy read */ }
   export function getDefaults(): { language: string; region: string };
   export function getCacheTtls(): { availabilityMs: number; searchMs: number };
   ```
   Non-negotiable properties:
   - **Never throws at module scope** — returns `null` for an absent token, and the adapter raises `TMDB_NOT_CONFIGURED`. This is what preserves I-13 (token-less build).
   - **The token is exposed via a function, not a property on an exported object.** An accidental `console.log(config)` must not be able to dump it.
   - `import "server-only"` — mandatory.
   - No `zod`. Three accessors do not justify a schema library; revisit past ~10 fields.

6. **Move `src/lib/tmdb/*` → `src/lib/providers/tmdb/*` with `git mv`** so blame and history survive.

7. **Wire route handlers to services.** They keep only: input validation, service call, `AppError` → HTTP mapping.

## 7. Tests to add/run

- **All Phase 1 + 2 tests pass with only import paths changed.** If an assertion needs rewording, the refactor changed behavior — investigate rather than adjust.
- New: `memory.ts` `CacheStore` — set/get round-trip, TTL expiry, `maxEntries` eviction, miss returns `undefined`.
- New: config — absent token returns `null` and **does not throw**; present token is returned; the exported surface does not expose the token as an enumerable property.
- New: `AppError` → HTTP status mapping for each code.
- New: adapter maps upstream 401/403/404/429/500 to the correct `AppError` codes (using a stubbed fetch, not a live call).

## 8. Acceptance criteria

- Full gate passes; manual smoke of both flows unchanged.
- `grep -rn "process.env" src/` returns **exactly one** hit, inside `src/config/env.ts` (the token read point has moved from the adapter into config — I-1 still holds, with a new single location).
- `src/lib/services/` contains **zero** references to `tmdb`.
- `src/lib/contracts/` imports nothing from `src/lib/providers/`.
- `npm run build` succeeds with `TMDB_ACCESS_TOKEN` unset (I-13).

## 9. Security invariants

- **The token read point moves — it does not multiply.** After this phase the single read lives in `src/config/env.ts`; the adapter obtains it via `getTmdbToken()`. Re-verify I-1 by grep.
- `src/config/env.ts`, `src/lib/providers/tmdb/http.ts`, `src/lib/cache/memory.ts`, and both services import `server-only`.
- Services and route handlers must never see the token — they call `provider.searchTitles(...)`, never `getTmdbToken()`.
- Config must have no `toJSON`/serializable form containing the secret.

## 10. Regression risks

| Risk | Mitigation |
| --- | --- |
| Cache policy accidentally dropped while moving it from adapter to service | Assert TTL behavior in tests; manually confirm a repeat query does not re-hit upstream |
| `server-only` import lost during a file move | Grep for `server-only` across the new provider/config/cache directories |
| Async cache conversion introduces an unawaited promise | `typecheck` catches most; review every `cache.get` call site |
| Import-path churn breaks the build | Large but mechanical; the test suite is the safety net |
| Over-building the interface | Enforced by review: two methods only |

## 11. Rollback strategy

The widest phase by file count. Keep it as a **single squashed commit** on its own branch and revert wholesale — a partial revert would leave services pointing at deleted modules. If the phase must be split, split at the `AppError` boundary (it is the only piece with no dependencies of its own).

## 12. Deliberately NOT doing

- **No DI container, no service locator, no registry.** Module imports are the injection mechanism at this size.
- **No second `ContentProvider` implementation.** The interface is worth having with one implementation; a speculative second one is not, and would be designed against imagined requirements.
- **No repository pattern, no event bus, no CQRS.**
- **No Redis.** The interface is the deliverable; the implementation waits for Phase 6.
- **No `zod`.** See §6.5.

## 13. STOP condition before Phase 4

> **Do not begin Phase 4 until `grep -rn "process.env" src/` returns exactly one hit and the token-less build passes.** These two checks confirm the secret boundary survived the largest file move in the migration.

---

# Phase 4 — Correctness and Repository Hygiene

## 1. Goal

Fix the correctness defects the audit identified, restore the cancellation guarantee, add CI, and reconcile the documentation.

## 2. Why it happens at this point in the sequence

These are small, independent fixes. They are deliberately placed **after** the structural work because several of them (the error-code split, cancellation propagation) touch modules that Phase 3 moves — doing them earlier would mean doing them twice.

CI lands here because only now is there a meaningful gate to enforce: lint + typecheck + **test** + build. Adding CI before Phase 1 would have enforced a gate with no behavioral coverage.

## 3. Files expected to be created

| File | Purpose |
| --- | --- |
| `.github/workflows/ci.yml` | lint + typecheck + test + build |
| `src/app/error.tsx` | Branded, localized error boundary |
| `src/app/not-found.tsx` | Branded 404 |

## 4. Files expected to be modified

`src/lib/errors.ts` (split the code), `src/lib/providers/tmdb/errors.ts` + `http.ts` (emit the split codes, accept a caller signal), `src/lib/api/fetch-json.ts` (signal required again), `src/components/TitleSearch.tsx` (branch on `TMDB_NOT_CONFIGURED` only), `src/app/api/titles/**/route.ts` (pass `request.signal`), `package.json` (name → `watchmuse`), `README.md`.

## 5. Files expected to be deleted

`AI_README.md`, `WORK_SUMMARY.md` — **only after** their genuinely useful content is merged into `README.md`.

Worth preserving from them: the `.env.local` setup walkthrough (already in README — verify no detail is lost) and the note on which TMDb token type to use.

Worth **discarding**: `AI_README.md` §7 cites `src/lib/normalize.ts`, a path that has never existed (the file is `src/lib/tmdb/normalize.ts`, and after Phase 3 it is `src/lib/providers/tmdb/normalize.ts`). `AI_README.md` §5 recommends `git filter-repo`/BFG history cleanup for a token leak that **never occurred** — verified: one commit, 24 objects, no `.env` ever tracked. `WORK_SUMMARY.md` lists as pending several items that are already complete. Do not carry any of this forward.

## 6. Detailed implementation steps

1. **Split `TMDB_NOT_CONFIGURED` from `TMDB_AUTH_FAILED`.** Currently both come from the single `configuration` code (`client.ts:19` for a missing token, `client.ts:94` for a 401/403).
   > **This is a user-facing correctness bug, not just taxonomy.** `MovieSearch.tsx:207` branches on `code === "configuration"` and renders *"create a `.env.local` file and add `TMDB_ACCESS_TOKEN`"*. In production, a **revoked or rate-limit-banned token** would show a visitor instructions to edit a local file they do not have. Bind that guidance to `TMDB_NOT_CONFIGURED` only; `TMDB_AUTH_FAILED` gets a neutral "service temporarily unavailable" message.
2. **Restore the required `AbortSignal`.** `fetch-json.ts:24` was weakened from `signal: AbortSignal` to `signal?: AbortSignal`. The stated justification — a runtime error from a missing signal — does not hold: **both call sites already pass one** (`MovieSearch.tsx:49` and `:83`). The change removed a compile-time guarantee in exchange for nothing. Revert it.
3. **Propagate cancellation to upstream.** `http.ts` currently sets only `AbortSignal.timeout(...)` and accepts no caller signal, so a disconnected browser still costs a full upstream request. Accept an optional caller signal and combine: `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`. Route handlers pass `request.signal`.
   - Verify `request.signal` is populated in Next 16 route handlers before relying on it; if not, keep the timeout-only behavior and note it.
   - The `AbortError` branch added at `client.ts:61–64` is currently **unreachable** (`AbortSignal.timeout` throws `TimeoutError`, and no other signal is wired in). Once caller signals exist it becomes reachable — and must map to a *cancelled* outcome, not to `TMDB_TIMEOUT`, since a user navigating away is not an upstream failure.
4. **CI**: Node 24, `npm ci`, then lint → typecheck → test → build. Build runs **without** `TMDB_ACCESS_TOKEN` in the environment, which turns I-13 into an enforced gate rather than a convention.
5. **Naming**: `package.json` name → `watchmuse`; the `<h1>` at `MovieSearch.tsx:120` still reads "Film Abonelik Kontrolü" — update to the WatchMuse product name.
6. **Error boundary**: `error.tsx` and `not-found.tsx`, Turkish, no stack traces or error details rendered to the user.
7. **README reconcile**, then delete the two stale documents.

## 7. Tests to add/run

- New: missing token → `TMDB_NOT_CONFIGURED`; upstream 401/403 → `TMDB_AUTH_FAILED`; the two map to distinct codes and distinct user messages.
- New: `fetchJson` signature requires a signal (compile-time; a type-level test or simply `typecheck` catching a call without one).
- New: an aborted caller signal surfaces as cancellation, **not** as `TMDB_TIMEOUT`.
- CI runs the whole suite on every push.

## 8. Acceptance criteria

- Full gate passes locally **and** in CI.
- CI's build step succeeds with no token in the environment.
- Manual: with no `.env.local`, the UI shows setup guidance. With an intentionally invalid token, it shows the neutral message and **not** the `.env.local` instructions.
- `AI_README.md` and `WORK_SUMMARY.md` are gone; `README.md` covers everything that was worth keeping.
- `grep -rn "signal?:" src/lib/api/fetch-json.ts` returns nothing.

## 9. Security invariants

- `error.tsx` must render **no** error message, stack, or digest from the caught error. Next's default error object can carry internal detail; render static copy only.
- The `TMDB_AUTH_FAILED` message must not hint at token length, prefix, or any other property of the credential.
- CI must never receive a real `TMDB_ACCESS_TOKEN` — the build is expected to succeed without one, so there is no reason to add it as a secret. **Adding it to CI would create a leak surface for zero benefit.**
- README must contain no real token (it currently does not).

## 10. Regression risks

| Risk | Mitigation |
| --- | --- |
| Error-code split misses a UI branch → users see wrong guidance | Manual test of both failure modes |
| Required signal breaks a call site added since | `typecheck` catches it |
| Cancellation propagation aborts requests too eagerly (e.g. React StrictMode double-effect in dev) | Test in dev **and** production build; StrictMode double-invocation is a known source of spurious aborts |
| Deleting docs loses a real detail | Merge first, delete second — in that order, in separate commits if needed |

## 11. Rollback strategy

Each item here is independent. Prefer **one commit per item** so any single fix can be reverted alone. The doc deletion should be its own commit so content can be recovered from history if something was missed.

## 12. Deliberately NOT doing

- **No retry logic yet.** A bounded retry with jitter for `TMDB_TIMEOUT` / `TMDB_UPSTREAM_ERROR` is worth adding eventually, but it interacts with rate limiting (Phase 6) and must never apply to `TMDB_RATE_LIMIT`. Adding it before the limiter exists risks amplifying the exact failure mode Phase 6 addresses.
- **No `engines` field enforcement / no Renovate / no commit hooks.** CI covers the actual risk.
- **No i18n framework.** Still one locale.

## 13. STOP condition before Phase 5

> **Do not begin Phase 5 until CI is green on a clean checkout and both configuration-failure modes have been manually verified.** Phase 5 rewrites the presentation of every status state — including error states — and needs those states to be correct first.

---

# Phase 5 — Style Foundation Only

## 1. Goal

Establish semantic WatchMuse design tokens, remove contradictory hardcoded styling, and make status communication work **without relying on hue** — while preserving every existing accessibility affordance.

**This phase performs no visual redesign.**

## 2. Why it happens at this point in the sequence

The component set is final after Phase 2's renames, and the status vocabulary is final after Phase 4's error split. Establishing tokens before those settled would mean applying them twice.

It happens **before** any visual design pass because the current styling has two competing systems, and designing on top of that contradiction means the design gets applied twice — once to the tokens and once to the 58 hardcoded utilities that ignore them.

It happens **after** correctness because a broken app that looks right is worse than a working app that looks plain.

## 3. Files expected to be created

| File | Purpose |
| --- | --- |
| `src/app/tokens.css` *(optional)* | Token definitions, if separating them from `globals.css` aids review |

## 4. Files expected to be modified

`src/app/globals.css`, `src/app/layout.tsx`, and every component under `src/components/`.

## 5. Files expected to be deleted

None. `.film-grain` may be removed from `globals.css` (see §6.6) but the file remains.

## 6. Detailed implementation steps

1. **Define semantic tokens** — roles, not colours: `--wm-bg`, `--wm-fg`, `--wm-muted`, `--wm-line`, `--wm-emphasis`, `--wm-inverse`. Expose through Tailwind v4's `@theme` so utilities are generated (`bg-*`, `text-*`, `border-*`).

2. **⚠️ Fix the light/dark inversion.** `globals.css:4–9` currently sets the `:root` default to **dark** (`#0b0b0b`) with light applied only under `@media (prefers-color-scheme: light)`. But Tailwind's `dark:` variant activates only under `prefers-color-scheme: dark`. Under `no-preference` the body renders dark while every `dark:` utility stays inactive — near-black text on a near-black background.
   Fix: **light in bare `:root`, dark inside `@media (prefers-color-scheme: dark)`.** This aligns the CSS variables with Tailwind's variant and eliminates the second source of truth.

3. **Replace the 58 hardcoded `black/white` opacity utilities** (`text-black/70 dark:text-white/70`, `border-black/10 dark:border-white/15`, …) with token utilities. This is mechanical. It is also what makes the tokens actually control anything — today they control almost nothing.

4. **Remove all hue-based communication:**
   - `ProviderPanel.tsx:23–24` — `border-l-[#E50914]` (Netflix red), `border-l-[#00A8E1]` (Prime blue)
   - `ProviderPanel.tsx:36,45` — emerald / amber badges
   - `StatusMessage.tsx:5–7` — red / amber alert boxes

5. **Re-express the three availability states monochromatically.** Colour is currently load-bearing; something must replace it:
   - **Aboneliğe dahil** — solid fill, inverted (dark background, light text)
   - **Bulunamadı** — outlined, normal weight
   - **Bilgi mevcut değil** — outlined, dashed or hatched border, muted text

   Text labels already exist and **must stay** — they are what makes this accessible to colour-blind users and screen readers alike. The same treatment applies to `StatusMessage` tones (info / warning / error) and to the Phase 2 media-type badge.

6. **Remove the global grayscale selector.** `globals.css:37–39` applies `filter: grayscale(100%) contrast(1.05)` to **every** `img` on the page, with no escape hatch short of `!important`. Move it to a `.poster` class applied by `TitlePoster`. The filmic intent is good; the blast radius is wrong for a utility-first codebase — it would silently desaturate every future logo, icon, and illustration.

7. **Resolve `.film-grain`.** `globals.css:42–51` uses `rgba(...,0.01)` under `mix-blend-mode: overlay` — visually undetectable, while costing a `position: fixed`, `z-index: 9999` compositing layer. Either implement it properly (SVG turbulence or a tiled noise data-URI) or delete it. **Do not leave it as-is.**

8. **Resolve the typography contradiction.** `body.watchmuse-retro` sets `font-family: var(--font-geist-sans), Georgia, 'Times New Roman', serif` — a geometric sans with **serif fallbacks**, which render as unrelated designs if the primary font fails. Pick a coherent stack in this phase; choosing an actual display face for the retro identity belongs to the design pass.

## 7. Tests to add/run

No automated tests. Component tests would require `jsdom` + testing-library to assert on markup that a subsequent design pass will change — poor value.

**Manual verification checklist:**
- 320px viewport: no horizontal overflow, in both themes.
- OS light, OS dark, and (via devtools emulation) `no-preference`: text is legible in all three. This directly verifies the §6.2 fix.
- Grayscale/colour-blind simulation: the three availability states remain distinguishable.
- Keyboard-only: focus is visible on every interactive element.
- Contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text and UI boundaries.
- Screen reader: `aria-live` announcements still fire on availability results.

## 8. Acceptance criteria

- `grep -rnE "#E50914|#00A8E1|emerald|amber-|red-[0-9]" src/components/` returns nothing.
- `grep -rn "text-black/\|dark:text-white/" src/components/` returns nothing.
- `globals.css` contains no bare `img { filter: ... }` rule.
- Every accessibility affordance from the audit is intact: `aria-pressed`, `aria-live="polite"`, `role="status"` / `role="alert"`, bound `<label>`, `min-h-11` targets, `text-base` input.
- Full gate passes.

## 9. Security invariants

- Purely presentational. No data flow, no error content, no config changes.
- **Error messages must not become less informative as a side effect** of restyling `StatusMessage` — the configuration-error guidance from Phase 4 must still reach the user.

## 10. Regression risks

| Risk | Mitigation |
| --- | --- |
| Losing an accessibility attribute during component edits | The explicit checklist in §8 |
| Monochrome states become indistinguishable at a glance | Fill inversion + border treatment + text label; verify under simulation |
| Contrast regressions in one theme only | Test both themes plus `no-preference` |
| Token rename sweep misses a component | The two grep assertions in §8 |
| Scope creep into a full redesign | Explicit non-goal; enforce at review |

## 11. Rollback strategy

Presentation-only, so rollback is safe at any point. Revert the phase commit. Consider two commits — tokens first, component sweep second — so a token mistake can be fixed without redoing the sweep.

## 12. Deliberately NOT doing

- **No visual redesign.** No new layout, spacing scale, display typeface, logo, iconography, or motion. That is a separate pass, enabled by this one.
- **No design-system library, no CSS-in-JS, no component library.** Five components. Tokens suffice.
- **No dark-mode toggle.** `prefers-color-scheme` is sufficient; a toggle needs persistence and a hydration-safe initial paint — real work for no current requirement.
- **No component snapshot tests.**

## 13. STOP condition before Phase 6

> **Do not begin Phase 6 until the app is verified legible and usable at 320px in light, dark, and `no-preference`, and the availability states are distinguishable without colour.** Phase 6 is the deployment gate; shipping a theme bug to the public is a worse outcome than shipping late.

---

# Phase 6 — Public Deployment Gate

## 1. Goal

Make WatchMuse safe to expose to the public internet.

## 2. Why it happens at this point in the sequence

Last, because everything before it is internal-facing. But note the ordering rule: **this is a gate, not a phase to be skipped.** Two of its items are hard blockers.

The deployment-target decision is deliberately deferred to here because Phase 3 made it cheap — the `CacheStore` interface means choosing serverless or a single server changes one implementation module, not the domain.

## 3. Files expected to be created

`src/lib/logging.ts` (structured, redacting), rate-limiting middleware or platform configuration, `src/app/api/health/route.ts`, `src/app/icon.png` + `src/app/opengraph-image.png`, and — **only if serverless is chosen** — `src/lib/cache/shared.ts`.

## 4. Files expected to be modified

`next.config.ts` (security headers), route handlers (rate limiting, logging), `README.md` (deployment/operations).

## 5. Files expected to be deleted

None.

## 6. Detailed implementation steps

1. **Rate limiting — hard gate.** `/api/titles/search` is currently an unauthenticated, unthrottled gateway to *your* TMDb quota, tied to *your* account. A trivial script exhausts it, and TMDb's enforcement lands on your token, not on the attacker. The 30-minute search cache helps only against repeated identical queries, not varied ones.
   **Prefer a platform/edge limiter** (Vercel Firewall, Cloudflare) over an in-application one: an in-app limiter on serverless has exactly the same per-instance fragmentation problem as the in-memory cache, and would need the shared store to work correctly.

2. **Structured, redaction-safe logging — hard gate.** Today there are **zero** `console.*` calls, which is excellent for secret hygiene and catastrophic for operations: a production incident would be entirely invisible. You cannot currently answer "how often is TMDb timing out?"
   Requirements: never log the token or `Authorization` header; never log full request URLs containing user queries (log a hash or length instead — the original brief explicitly asked not to log search text unnecessarily); log error **codes**, not raw upstream bodies. Introduce a single logger module so this discipline has one enforcement point rather than being re-litigated at each call site.

3. **Decide the deployment target**, then choose the `CacheStore` implementation:

   | Target | Cache decision |
   | --- | --- |
   | Single VPS / Docker, one instance | Keep `memory.ts` — it works exactly as designed |
   | Multiple instances / autoscaling | Shared store, or accept a hit rate divided by instance count |
   | Vercel / serverless | **Shared store required** — cold starts discard in-memory state, making the 6-hour TTL fiction and multiplying TMDb load |

4. **Security headers** in `next.config.ts`: CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `X-Frame-Options`/`frame-ancestors`, HSTS. CSP must permit `image.tmdb.org` for posters.

5. **Health/readiness endpoint** returning process liveness. **It must not call TMDb** — a health check that hits the upstream turns every orchestrator probe into quota consumption and couples your liveness to a third party's.

6. **Favicon and OG image.** `public/` is currently empty and there is no `icon`/`opengraph-image` in `src/app/`, so every social share renders blank.

## 7. Tests to add/run

- Rate limiter: requests over the threshold receive 429; under it, 200.
- Logger: a redaction test asserting the token never appears in output given a payload that contains it.
- Health endpoint returns 200 without a configured token (it must not depend on TMDb).
- Full suite green in CI.

## 8. Acceptance criteria

Every item in the *Public Deployment Checklist* below is checked.

## 9. Security invariants

- **I-11 tightens rather than relaxes.** Introducing a logger is the single most likely way to break the zero-secret-logging property. The redaction test in §7 is mandatory, not optional.
- Rate limiting must not be bypassable by header spoofing — if using client IP, take it from the platform's trusted forwarding header, not from an arbitrary `X-Forwarded-For`.
- Security headers must not be so permissive as to be decorative (`unsafe-inline` everywhere defeats CSP's purpose).
- If a shared cache is added: it holds only normalized public metadata — **never** the token, never user-identifying data.

## 10. Regression risks

| Risk | Mitigation |
| --- | --- |
| Logger leaks a secret | Mandatory redaction test |
| Rate limiter throttles legitimate search-as-you-type | Tune against the 375ms debounce and realistic session behavior; test before deploying |
| CSP breaks TMDb poster loading | Verify images render with headers enabled |
| Shared cache introduces a new failure mode (store unreachable) | The store must **degrade to a miss**, never to a request failure |

## 11. Rollback strategy

Ship each item as its own commit — they are independent. Rate limiting and CSP are the two most likely to need tuning in production, so keep them individually revertible. Have a documented path to disable the limiter quickly if it misfires against real traffic.

## 12. Deliberately NOT doing

- **No authentication.** There is no per-user data. Rate limiting solves abuse without it.
- **No database.** Nothing to persist.
- **No APM/tracing vendor.** Structured logs first; add tracing when logs prove insufficient.
- **No autoscaling/infra-as-code.** Out of scope at this size.

## 13. STOP condition — public deployment

> **Do not deploy publicly until rate limiting and redaction-safe logging are both live and verified.** These are the two hard gates. Everything else in this phase can follow the first deploy; these two cannot.

---

# Expected Final Repository Structure

```
src/
├── app/
│   ├── api/
│   │   ├── health/route.ts                             (Phase 6)
│   │   └── titles/
│   │       ├── search/route.ts                         (Phase 2)
│   │       └── [mediaType]/[id]/availability/route.ts   (Phase 2)
│   ├── error.tsx                                       (Phase 4)
│   ├── not-found.tsx                                   (Phase 4)
│   ├── icon.png                                        (Phase 6)
│   ├── opengraph-image.png                             (Phase 6)
│   ├── globals.css                                     (Phase 5: tokens)
│   ├── layout.tsx
│   └── page.tsx
│
├── components/
│   ├── TitleSearch.tsx           ← MovieSearch
│   ├── TitleResultList.tsx       ← MovieResultList
│   ├── TitlePoster.tsx           ← MoviePoster
│   ├── AvailabilityPanel.tsx     ← ProviderPanel
│   ├── MediaTypeBadge.tsx        (Phase 2)
│   └── StatusMessage.tsx
│
├── config/
│   └── env.ts                    ★ SOLE process.env READ POINT · server-only
│
└── lib/
    ├── constants.ts              debounce, min query length (client+server)
    ├── errors.ts                 AppError + namespaced code union
    │
    ├── contracts/                ★ APPLICATION-OWNED · type-only · no provider imports
    │   ├── media.ts              MediaType · TitleSummary · TitleSearchResult
    │   ├── availability.ts       AvailabilityResult · ProviderAvailability
    │   └── errors.ts             ApiErrorBody
    │
    ├── cache/
    │   ├── types.ts              CacheStore (async interface)
    │   ├── memory.ts             in-process implementation · server-only
    │   └── shared.ts             ONLY IF serverless is chosen (Phase 6)
    │
    ├── services/                 ★ KNOWS NOTHING ABOUT TMDb
    │   ├── titleService.ts       search orchestration + cache policy
    │   └── availabilityService.ts
    │
    ├── providers/
    │   ├── types.ts              ContentProvider — exactly 2 methods
    │   └── tmdb/
    │       ├── adapter.ts        implements ContentProvider
    │       ├── http.ts           token consumer · server-only
    │       ├── normalize.ts      PURE — unit tested
    │       ├── normalize.test.ts
    │       ├── mapping.ts        provider ID table (Netflix, Prime + ad tiers)
    │       └── errors.ts         upstream status → AppError
    │
    ├── api/
    │   ├── fetch-json.ts         client-side wrapper (signal REQUIRED)
    │   └── responses.ts          AppError → HTTP
    │
    └── logging.ts                (Phase 6) structured · redacting
```

**Deleted along the way:** `src/lib/tmdb/` (moved), `src/lib/ttl-cache.ts` (→ `cache/memory.ts`), `src/lib/tmdb/types.ts` (→ `contracts/`), `AI_README.md`, `WORK_SUMMARY.md`.

---

# Migration Dependency Graph

```
                    ┌──────────────────────────────────┐
                    │ PHASE 0  Rollback baseline       │
                    │ git commit + tag                 │
                    │ ⚠ PREREQUISITE — nothing below   │
                    │   is safely reversible without it│
                    └────────────────┬─────────────────┘
                                     │
                    ┌────────────────▼─────────────────┐
                    │ PHASE 1  Make testable           │
                    │ extract pure logic · Vitest      │
                    │ FREEZE current behavior          │
                    └────────────────┬─────────────────┘
                                     │  tests are the safety net
                                     │  for everything below
                    ┌────────────────▼─────────────────┐
                    │ PHASE 2  Domain model            │
                    │ MediaType · Title · contracts    │
                    │ /api/titles/* · TV support       │
                    └────────────────┬─────────────────┘
                                     │  model must be stable
                                     │  before wrapping it
                    ┌────────────────▼─────────────────┐
                    │ PHASE 3  Architectural seams     │
                    │ ContentProvider · services       │
                    │ CacheStore · config · AppError   │
                    └───────┬─────────────────┬────────┘
                            │                 │
              ┌─────────────▼──────┐   ┌──────▼───────────────────┐
              │ PHASE 4            │   │ (CacheStore seam unblocks │
              │ Correctness        │   │  the Phase 6 deployment   │
              │ + hygiene + CI     │   │  decision — no domain     │
              └─────────┬──────────┘   │  code changes later)      │
                        │              └──────┬───────────────────┘
              ┌─────────▼──────────┐          │
              │ PHASE 5            │          │
              │ Style foundation   │          │
              │ tokens only        │          │
              └─────────┬──────────┘          │
                        │                     │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │ PHASE 6  Deployment gate         │
                    │ rate limit ▮ logging ▮ headers   │
                    │ ▮ = HARD GATE, cannot be skipped │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼───────────────────┐
                    │ Separate: visual design pass     │
                    │ (retro cinema B&W identity)      │
                    │ enabled by Phase 5, not part of  │
                    │ this migration                   │
                    └──────────────────────────────────┘

  Strict ordering:  0 → 1 → 2 → 3
  After 3, phases 4 and 5 may be reordered or run in parallel branches.
  Phase 6 requires 3 (CacheStore) and 4 (CI). It does not require 5.
```

---

# Public Deployment Checklist

Nothing here is optional. Items marked ▮ are hard gates.

**Security**
- [ ] ▮ Rate limiting live on both API routes and verified with a load test
- [ ] `TMDB_ACCESS_TOKEN` supplied via platform secrets — never in an image, a repo, or a build arg
- [ ] `grep -rn "process.env" src/` returns exactly one hit
- [ ] `grep -rn "NEXT_PUBLIC_" src/` returns nothing
- [ ] Security headers set and verified (CSP allows `image.tmdb.org`)
- [ ] Error boundary renders no stack, digest, or internal detail
- [ ] Token rotation procedure documented in README

**Observability**
- [ ] ▮ Structured logging live
- [ ] ▮ Redaction test passing — token cannot appear in output
- [ ] Search query text is not logged verbatim
- [ ] Upstream failures are attributable by error code

**Correctness**
- [ ] Full test suite green in CI
- [ ] `next build` succeeds with **no** token present (I-13)
- [ ] `TMDB_NOT_CONFIGURED` and `TMDB_AUTH_FAILED` produce distinct, appropriate user messages
- [ ] Movie and TV availability both verified against real TMDb data
- [ ] Cache keys namespaced by media type — verified

**Operations**
- [ ] Deployment target decided and documented
- [ ] `CacheStore` implementation matches that target
- [ ] Health endpoint live and **not** dependent on TMDb
- [ ] Rollback procedure documented and tested once

**Product**
- [ ] Legible at 320px in light, dark, and `no-preference`
- [ ] Availability states distinguishable without colour
- [ ] Favicon and OG image present
- [ ] TMDb and JustWatch attribution visible in the UI
- [ ] TMDb API terms of use reviewed for public deployment

---

# Definition of Done

The migration is complete when **all** of the following hold:

1. All fifteen Architectural Invariants verify clean.
2. Phases 0–6 are each committed, individually revertible, and each left the application working.
3. The repository structure matches *Expected Final Repository Structure*.
4. `src/lib/services/` contains zero references to TMDb; `src/lib/contracts/` imports nothing from `src/lib/providers/`.
5. `ContentProvider` has exactly two methods, and exactly one implementation.
6. `CacheStore` implementation is swappable without editing any service.
7. The classification rule — TR only, `flatrate` only, ID-matched only, three-state — is covered by tests that have survived every phase without substantive modification.
8. Movies and TV both work end-to-end against live TMDb data.
9. CI enforces lint + typecheck + test + build on every push, including a token-less build.
10. Exactly one documentation file describes the project (`README.md`), plus the audit and this plan. No stale AI-generated documents remain.
11. The Public Deployment Checklist is fully checked.
12. The dependency tree has grown by **exactly one** package: `vitest` (dev). Any other addition is documented with its justification.

---

# Explicit Non-Goals

Not built during this migration, in any phase. Each is a plausible-sounding mistake at this size.

| Non-goal | Reason |
| --- | --- |
| **Dependency injection container / IoC** | ~1,500 lines. Module imports are the injection mechanism. |
| **Plugin / provider registry** | One provider. Build the registry when there are two and its requirements are known. |
| **Speculative second provider implementation** | The interface is worth defining; a second implementation designed against imagined requirements is not. |
| **GraphQL / tRPC / BFF** | Two GET endpoints. |
| **Database** | No state to persist. |
| **Redis / shared cache — for now** | The *interface* ships in Phase 3; the implementation waits for the Phase 6 deployment decision. |
| **Authentication / accounts** | No per-user data. Rate limiting solves abuse without it. |
| **Microservices / separate backend** | Explicitly excluded from the original brief and still correct. |
| **Monorepo / package splitting** | One application. |
| **Design-system library** | Five components. Tokens suffice. |
| **Visual redesign** | Phase 5 builds the foundation; the design pass is separate work. |
| **i18n framework** | One locale. Extract copy into a module first; adopt a framework at locale two. |
| **Playwright / E2E suite** | Disproportionate. Unit tests on the classification rule catch the failure that actually matters. |
| **Coverage thresholds** | Reward testing trivia over testing rules that can mislead users. |
| **`zod`** | Hand-written narrowing already works and is smaller. Revisit past ~10 config fields. |
| **PWA / offline / service worker** | No offline use case. |
| **Server Components rewrite of the search flow** | Search-as-you-type is genuine client interaction; converting would be a regression. |
| **Retry logic before rate limiting exists** | Would amplify the exact failure mode Phase 6 addresses. |
| **`?type=` search parameter** | The chosen UI is a mixed list with badges. Nothing would send it. |
| **Season / episode-level availability** | Separate product decision. |
| **Dark-mode toggle** | `prefers-color-scheme` is sufficient; a toggle needs persistence and hydration-safe paint. |

---

## Closing note

The objective is not architectural elegance. It is a small, maintainable WatchMuse codebase that can move from private demo to public production without a rewrite.

Every phase above is justified by a specific finding in `WATCHMUSE_ARCHITECTURE_AUDIT.md`. Where a step would have been added for symmetry or completeness rather than need, it appears under *Deliberately NOT doing* with the reason.

**Phases 0 and 1 are the highest-value work in this document.** Phase 0 because the current absence of a rollback baseline is the single largest unmanaged risk in the repository. Phase 1 because the classification rule is correct today by inspection rather than by verification, and it is the one place the application can silently mislead a user.

If only a day is available, spend it there.
