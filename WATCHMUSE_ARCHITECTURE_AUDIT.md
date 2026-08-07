# WatchMuse — Architecture Audit

**Audit date:** 2026-08-07
**Auditor role:** senior software architect / security-conscious full-stack engineer
**Scope:** entire repository, read-only. No source file was modified during this audit.
**Secret handling:** `.env.local` exists on disk. Its contents were **never opened, read, printed, or copied**. Only the variable *name* (`TMDB_ACCESS_TOKEN`) was inspected, via source code and `.env.example`.

---

# Executive Summary

WatchMuse is a **1,499-line, 21-file Next.js 16 application**. It is small. That fact dominates every recommendation in this report.

The headline finding is unusual for an audit: **the two most expensive things to get wrong are already right.**

1. **The secret boundary is genuinely sound.** `TMDB_ACCESS_TOKEN` is read in exactly one place, in a module guarded by `import "server-only"`. There is no `NEXT_PUBLIC_` misuse, no logging of any kind, and the git history is clean — no `.env` file has ever been tracked.
2. **The application already owns its data models.** TMDb response objects never reach the UI. Normalization is centralized and defensive.

These are the two mistakes that force a rewrite when discovered late. Neither is present.

What *is* wrong is real but **additive rather than structural**: there is no configuration layer, no test of the core business rule, no media-type dimension (the product claims movies *and* TV; the code only knows movies), a caching strategy that silently collapses on serverless, an unauthenticated open proxy to a rate-limited third-party API, and a half-applied visual theme that contradicts itself.

None of these require inverting a dependency, moving a trust boundary, or rewriting the data flow. They are things you *add to* or *rename within* the existing shape.

**Verdict: B — REFACTOR SELECTED PARTS.** Estimated blast radius ~30–35% of files, with zero rewritten subsystems.

A caveat stated plainly: two of your framing assumptions in the audit brief are **not supported by the code**. You assumed scattered `process.env` access, and you raised the possibility of secrets in logs/errors. Neither exists today. I have corrected both below rather than quietly validating them.

---

# Current Repository Structure

```
.
├── AGENTS.md                  # Next.js-generated agent rules (auto-maintained)
├── CLAUDE.md                  # 11 bytes; imports AGENTS.md
├── AI_README.md               # ← untracked, AI-generated, partly incorrect
├── WORK_SUMMARY.md            # ← untracked, AI-generated, overlaps README
├── README.md                  # accurate and reasonably complete
├── .env.example               # placeholder only, no real value
├── .gitignore                 # .env* with !.env.example exception
├── eslint.config.mjs          # flat config, core-web-vitals + typescript
├── next.config.ts             # only images.remotePatterns for TMDb
├── postcss.config.mjs         # @tailwindcss/postcss
├── tsconfig.json              # strict: true, @/* → ./src/*
├── public/                    # EMPTY (no favicon, no OG image)
└── src/
    ├── app/
    │   ├── api/movies/search/route.ts            (29)
    │   ├── api/movies/[id]/providers/route.ts    (26)
    │   ├── globals.css                           (74)
    │   ├── layout.tsx                            (32)
    │   └── page.tsx                              (9)
    ├── components/
    │   ├── MovieSearch.tsx                      (255)  ← orchestrator
    │   ├── ProviderPanel.tsx                    (186)
    │   ├── MovieResultList.tsx                   (62)
    │   ├── MoviePoster.tsx                       (42)
    │   └── StatusMessage.tsx                     (28)
    └── lib/
        ├── constants.ts                          (10)  # shared client+server
        ├── ttl-cache.ts                          (72)  # server-only
        ├── api/
        │   ├── fetch-json.ts                     (75)  # client-side wrapper
        │   └── responses.ts                      (30)  # server-side wrapper
        └── tmdb/
            ├── client.ts                        (115)  # server-only, token here
            ├── constants.ts                      (57)  # provider IDs, TTLs
            ├── normalize.ts                      (67)  # defensive parsers
            ├── providers.ts                     (114)  # server-only
            ├── search.ts                         (96)  # server-only
            ├── errors.ts                         (43)
            └── types.ts                          (77)  # internal models
```

**Measured facts:**

| Metric | Value |
| --- | --- |
| Total `src/` lines | **1,499** across 21 files |
| Largest file | `MovieSearch.tsx` — 255 lines |
| Git commits | **1** (create-next-app initial) |
| Git objects in history | 24 |
| Tracked `.env` files | **0** |
| Production dependencies | **4** |
| Total installed packages | 288 |
| `npm audit` (incl. dev) | **0 vulnerabilities** |
| Packages with install scripts | **1** (dev-only transitive) |
| Test files | **0** |
| `npm run lint` | **PASS** (verified during this audit) |

**Structural observation:** the layering is already three-tier and coherent — `app/` (transport) → `lib/tmdb/` (integration) → `components/` (presentation). There is no god object, no circular dependency, and no file over 260 lines. For 1,499 lines this is a healthy shape.

---

# Current Request/Data Flow

```
  ┌─────────────────────────────────────────────────────────────┐
  │ BROWSER                                                     │
  │                                                             │
  │  MovieSearch.tsx  ("use client")                            │
  │    ├─ debounce 375ms  (constants.ts)                        │
  │    ├─ min 2 chars     (constants.ts)                        │
  │    ├─ AbortController per keystroke                         │
  │    └─ fetchJson()     (lib/api/fetch-json.ts)               │
  └───────────────┬─────────────────────────────────────────────┘
                  │  GET /api/movies/search?q=
                  │  GET /api/movies/{id}/providers
                  ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ NEXT.JS ROUTE HANDLERS  (dynamic, server)                   │
  │                                                             │
  │  search/route.ts        ── validates q.length >= 2          │
  │  [id]/providers/route.ts ── validates id is positive int    │
  │           │                                                 │
  │           └─ catch → toErrorResponse()  (api/responses.ts)  │
  └───────────────┬─────────────────────────────────────────────┘
                  ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ DOMAIN / INTEGRATION  (server-only)                         │
  │                                                             │
  │  search.ts                    providers.ts                  │
  │    ├─ TTL cache 30min           ├─ TTL cache 6h             │
  │    └─ normalizeSearchResponse   └─ normalizeProvidersResponse│
  │                    │                      │                 │
  │                    └──────┬───────────────┘                 │
  │                           ▼                                 │
  │                  ttl-cache.ts (IN-PROCESS Map)              │
  └───────────────────────────┬─────────────────────────────────┘
                              ▼
  ┌─────────────────────────────────────────────────────────────┐
  │ tmdb/client.ts   ★ SOLE TOKEN READ POINT (line 16)          │
  │   import "server-only"                                      │
  │   Authorization: Bearer <token>                             │
  │   AbortSignal.timeout(8s)  ·  cache: "no-store"             │
  │   status → TmdbError(code)  (errors.ts)                     │
  └───────────────────────────┬─────────────────────────────────┘
                              ▼
                      https://api.themoviedb.org/3
```

**What this diagram shows that matters:** the trust boundary is a single, narrow line. Everything above `client.ts` is token-free by construction. That is the property worth preserving through any refactor.

**What it shows that is missing:** there is no layer between the route handler and the TMDb-specific module. `search.ts` and `providers.ts` are *simultaneously* the service layer and the TMDb adapter. That conflation is the main architectural gap (see *TMDb Integration Review*).

---

# What Is Already Good

Listing these is not flattery — each one is a decision you do **not** have to revisit, which is what makes the refactor verdict defensible.

1. **Single token read point.** `src/lib/tmdb/client.ts:16` is the only `process.env.TMDB_ACCESS_TOKEN` access in the entire repository. Verified by grep.
2. **Build-time client/server enforcement.** `import "server-only"` at `client.ts:1`, `search.ts:1`, `providers.ts:1`, `ttl-cache.ts:1`. Importing any of these from a client component fails the build rather than shipping the token.
3. **The UI never sees TMDb shapes.** `src/lib/tmdb/types.ts` defines `MovieSummary`, `MovieProvidersResult`, `ProviderAvailability`. Components import only these. This is the single most valuable existing decision.
4. **Defensive normalization that cannot throw.** `normalize.ts` returns `null` rather than throwing on malformed input; `normalizeMovie()` drops records missing an id or title instead of crashing the list.
5. **The core business rule is correct and well-documented.** `providers.ts:60–68`: only `results.TR` is read, only `flatrate` counts as subscription-included, `rent`/`buy` are ignored, and matching is by **provider ID only** — never substring. The comment explaining *why* substring matching is unsafe ("Amazon Video" vs "Amazon Prime Video") is exactly the kind of comment that survives a handover.
6. **Target provider IDs are centralized.** `constants.ts` → `TARGET_PROVIDERS` is a single, well-commented edit point including ad-tier variants.
7. **Three-state availability semantics.** `available` / `unavailable` / `unknown` (`ProviderPanel.tsx:156–160`) correctly distinguishes "not on Netflix" from "TMDb has no Turkish data" — a distinction most implementations get wrong by collapsing both into `false`.
8. **Race-condition handling is genuinely correct.** `MovieSearch.tsx` stores each outcome keyed by the input it belongs to (`SearchOutcome.query`, `ProviderOutcome.movieId`) and *derives* display state. A stale response cannot render even if `AbortController` fails. This is belt-and-braces and it is right.
9. **Server-generated timestamps.** `checkedAt` is produced server-side (`providers.ts:92`), avoiding client-clock skew.
10. **Lean dependency tree.** 4 production dependencies. Zero vulnerabilities.
11. **Provider queries are demand-driven.** Only fired on selection, never fanned out across the result list.

---

# Problems Found

Ordered by severity. Full detail in the per-topic sections below.

| # | Problem | Priority |
| --- | --- | --- |
| 1 | Unauthenticated, unthrottled public proxy to a quota-limited third-party API | P1 → **P0 at deploy** |
| 2 | In-process cache collapses on serverless, amplifying #1 | P1 |
| 3 | No media-type dimension — product claims movies + TV, code is movies-only | P1 |
| 4 | Zero tests on the core classification rule | P1 |
| 5 | Service layer and TMDb adapter are the same module | P1 |
| 6 | No centralized/typed configuration layer | P2 |
| 7 | Visual theme is half-applied and internally contradictory | P2 |
| 8 | `fetchJson` `signal` weakened to optional without justification | P2 |
| 9 | Documentation rot — two stale AI docs, one factually wrong | P2 |
| 10 | Product identity not reflected in code (`movie-search-demo`, old `<h1>`) | P2 |
| 11 | Language/region hardcoded; all UI copy inline Turkish | P2 |
| 12 | No CI; empty `public/`; no pagination | P3 |

**There is no P0 in the current private-demo context.** I looked for one specifically. I am not going to invent one.

---

# Security Review

## Is `TMDB_ACCESS_TOKEN` guaranteed to remain server-side?

**Yes, with build-time enforcement — not merely by convention.**

The guarantee rests on three independent mechanisms:

1. **Naming.** No `NEXT_PUBLIC_` prefix, so Next.js will not inline the value into the client bundle. Verified: zero occurrences of `NEXT_PUBLIC_` anywhere in `src/` or `next.config.ts`.
2. **The `server-only` package.** `client.ts:1` imports it. If any client component transitively imports this module, the build fails with an explicit error. This converts a review-discipline problem into a compiler problem.
3. **Call-graph isolation.** The token is consumed inside `tmdbRequest()` and interpolated directly into a request header (`client.ts:49`). It is never assigned to a variable that escapes the function, never returned, never attached to an object.

## Can the token accidentally enter the browser bundle?

**Not without deliberately defeating two mechanisms.** The realistic residual risks are:

- Someone renames the variable to `NEXT_PUBLIC_TMDB_ACCESS_TOKEN` to "fix" a problem. Mitigated by documentation in `.env.example` and `README.md`, both of which warn about this explicitly. Not enforced by tooling. **A lint rule banning `NEXT_PUBLIC_.*TOKEN|SECRET|KEY` would close this** — cheap, recommended (P2).
- Someone removes the `server-only` import while refactoring. Nothing currently detects this.

## Could secrets appear in logs or errors?

**No. Verified by grep: there are zero `console.*` calls in the entire `src/` tree.**

Error construction was reviewed line by line:

- `client.ts:91–115` (`errorForStatus`) builds messages from the **HTTP status code only**. It never includes the response body, request headers, or URL.
- On 401/403 the message says the credential was *rejected* and names the *variable* — it does not echo any part of the value.
- `api/responses.ts` maps `TmdbError` → HTTP, and for any non-`TmdbError` returns a **fixed generic string**, so an unexpected exception's `.message` (which might contain a URL or header in some runtimes) cannot escape.

This last point deserves emphasis: many codebases leak here by returning `error.message` for unknown errors. This one does not.

**One minor information disclosure remains:** the upstream HTTP status code is surfaced to the end user (`client.ts:113`, "HTTP 500"). This is low-value to an attacker and useful for support. Acceptable; flag as P3 if you want a pure-opaque error surface later.

## Is `.env.local` safely ignored?

**Yes, and the history is clean — verified, not assumed.**

- `.gitignore:34` — `.env*`
- `.gitignore:36` — `!.env.example` (correct exception; without it the example file would be invisible)
- `git check-ignore -v .env.local` confirms the match.
- `git ls-files | grep .env` → **no results**. No `.env` file is or has been tracked.
- The repository has **1 commit and 24 total objects**. There is no history in which a secret could hide.

> **Correction to the audit brief and to `AI_README.md`:** `AI_README.md` §5 advises preparing for history cleanup with `git filter-repo`/BFG "if a token was ever committed." That scenario **did not occur** and cannot have occurred — there is a single commit, created by `create-next-app`, containing no env file. Acting on that advice would be wasted effort.

## Other security surface

- **No authentication, no sessions, no cookies, no user data.** The attack surface is two GET endpoints. There is nothing to escalate to.
- **Input validation exists on both endpoints.** `search/route.ts` enforces minimum query length; `[id]/providers/route.ts` parses and range-checks the ID (`Number.isInteger && > 0`) before it reaches a URL template. This closes path-injection into the TMDb URL.
- **Outbound URL construction is safe.** `client.ts:38–41` uses `new URL()` + `searchParams.set()` rather than string concatenation.
- **`toExternalHttpsUrl()`** (`normalize.ts`) refuses to pass through any non-`https:` link from the TMDb payload before it becomes an `href`. This is a genuinely thoughtful control — a compromised or malformed upstream response cannot inject a `javascript:` URL into the UI.
- **External links** use `rel="noopener noreferrer"`.
- **`images.remotePatterns`** is scoped to `image.tmdb.org` with `pathname: "/t/p/**"` and `search: ""`. Correctly narrow — the image optimizer cannot be used as an open proxy.

## The actual security problem: an open API proxy

The endpoints are **unauthenticated and unthrottled**. Today that is fine — it is a private demo on localhost.

**On the day this is publicly deployed, it becomes a P0.** `/api/movies/search?q=...` is a free, anonymous, uncached-per-attacker gateway to *your* TMDb quota, tied to *your* account. A trivial script exhausts the rate limit, and TMDb's enforcement lands on your token, not on the attacker. The 30-minute search cache offers partial protection against repeated identical queries but none against varied ones.

This must be solved **before** the first public deployment, not after.

---

# Environment and Secret Management

## Current state

Exactly one environment variable exists: `TMDB_ACCESS_TOKEN`, read at `client.ts:15–26` inside `readAccessToken()`.

The read is **lazy** — it happens per request, inside the function, not at module scope. This is why `npm run build` succeeds without a token (verified in a previous session and documented in `README.md`). That is the correct pattern and worth protecting: module-scope validation would break builds in CI and in any environment where secrets are injected at runtime rather than build time.

Missing-token handling produces a typed `TmdbError("configuration", ...)` → HTTP 503 → a specific, actionable Turkish message in the UI. The failure mode is well-designed.

## Assessment of the proposed `src/config/env.ts`

**Your brief assumes "scattered `process.env` access." That assumption is false.** There is one access point. A configuration layer would not be *consolidating* anything today.

That said, I still recommend building it — but for different reasons than the brief implies, and at **P2, not P1**:

1. **It stops being one variable very soon.** The moment you add `TMDB_LANGUAGE`, `TMDB_REGION`, `CACHE_URL`, `RATE_LIMIT_MAX`, or `APP_ENV`, the pattern matters. Introducing the layer while there is one variable costs ~30 lines; introducing it after five variables have spread means finding them all first.
2. **Fail-fast with a clear message beats fail-late with a 503.** A misconfigured *staging* deploy should announce itself distinctly from a missing token.
3. **It makes environment differences explicit and typed** rather than implicit in scattered `??` defaults. Today `TMDB_LANGUAGE`/`TMDB_REGION` are compile-time constants in `tmdb/constants.ts` — fine for a Turkey-only product, wrong the moment there is a second market.

### Recommended design (do not build yet)

```ts
// src/config/env.ts
import "server-only";

type ServerEnv = {
  tmdbAccessToken: string | null;   // null = not configured, NOT an exception
  defaultRegion: string;            // "TR"
  defaultLanguage: string;          // "tr-TR"
  cache: { providerTtlMs: number; searchTtlMs: number };
};
```

Design constraints that matter more than the shape:

- **Never throw at module scope.** Return `null` for an absent secret and let the domain layer raise the typed `NOT_CONFIGURED` error. This preserves the working build-without-token property.
- **Never log the object.** Add an explicit `toString()`/`toJSON()` that redacts, or simply never expose the token on the returned object — prefer a `getTmdbToken()` accessor over a plain property, so an accidental `console.log(env)` cannot dump it.
- **`import "server-only"`** on this file, non-negotiable.
- **Split server and public config into separate modules** if a public config ever appears. Do not create one object with a `public` sub-key — that is exactly how tokens end up in bundles.
- **Do not add `zod` for this.** Four fields with hand-written narrowing is smaller than the dependency. Revisit if the schema exceeds ~10 fields.

---

# TMDb Integration Review

## What is right

The integration is clean at the HTTP level: a single `tmdbRequest()` function, an 8-second timeout via `AbortSignal.timeout()`, explicit status → error mapping, `unknown` return type forcing callers to normalize.

Returning `Promise<unknown>` rather than a generic `Promise<T>` is a deliberate and correct choice — it makes it impossible to *accidentally* trust the upstream shape.

## The structural gap: adapter and service are the same module

`search.ts` and `providers.ts` each do four jobs:

1. cache lookup / population
2. TMDb endpoint selection and query parameters
3. TMDb-shape → internal-model normalization
4. business rules (flatrate-only classification, target provider matching)

Job 4 is **domain logic**. Jobs 2 and 3 are **adapter logic**. Job 1 is **infrastructure**. Today they are interleaved in one file.

The practical consequence: to add a second availability source, or to unit-test the classification rule without stubbing HTTP, you must first pull these apart. That is the refactor.

## TMDb vocabulary leaking outward

Reviewed for genuine coupling versus cosmetic naming:

| Leak | Location | Severity |
| --- | --- | --- |
| `tmdbProviderIds` | `tmdb/constants.ts`, `types.ts` | Cosmetic — rename to `externalIds` keyed by source |
| `matchedProviderId` | `types.ts`, sent to browser | Cosmetic, but it *is* a TMDb ID in the public API response |
| `justWatchUrl` | `types.ts`, `ProviderPanel.tsx:135` | Names a specific vendor in the internal model — should be `deepLinkUrl` |
| `/api/movies/*` | route paths | Public URL shape; costly to change **after** deployment, free now |
| `posterPath` *and* `posterUrl` | `types.ts` | Redundant — `posterPath` is the raw TMDb value and is unused by the UI. Dead field. |

**Assessment: the coupling is shallower than it looks.** The *shape* of `MovieSummary` and `MovieProvidersResult` is already provider-neutral — nothing in it mirrors TMDb's response structure. What leaks is **vocabulary**, not structure. Vocabulary is cheap to fix; structure is not. This is the single strongest argument against a rebuild.

## Correctness observations

- **`normalizeMovie()` silently drops malformed records** but `totalResults` still reflects TMDb's count. A page could show 4 results while claiming 20 total. Minor; note it if pagination is added.
- **`voteAverage: 0` is coerced to `null`** (`search.ts`) — treating "unrated" as absent. Correct for TMDb's semantics, but undocumented in the model. Worth a comment in `types.ts`.
- **`hasRegionData` semantics are subtle.** `results.TR` present but `flatrate` absent → `hasRegionData: true`, both providers `false` → UI shows "Bulunamadı". This is the right call (TMDb covers Turkey for this title; the absence of a flatrate entry is meaningful) but it rests on an assumption about TMDb's data completeness that is **untested and undocumented in code**. This is precisely the rule that needs a unit test.
- **`client.ts` accepts no caller `AbortSignal`.** If the browser disconnects, the upstream request runs to completion. Wasteful at scale, irrelevant now.
- **The `AbortError` branch added at `client.ts:61–64` is currently unreachable.** `AbortSignal.timeout()` throws `TimeoutError`; there is no other signal wired in. Harmless, but the comment claims a runtime-variance rationale that does not apply to this code path. It becomes correct only once caller signals are threaded through — which is the right fix.

---

# Client / Server Boundary Review

**This is the strongest part of the codebase.** The boundary is explicit, enforced, and narrow.

| Module | Side | Enforcement |
| --- | --- | --- |
| `lib/tmdb/client.ts` | server | `import "server-only"` |
| `lib/tmdb/search.ts` | server | `import "server-only"` |
| `lib/tmdb/providers.ts` | server | `import "server-only"` |
| `lib/ttl-cache.ts` | server | `import "server-only"` |
| `lib/tmdb/types.ts` | **both** | type-only — erased at compile time |
| `lib/tmdb/errors.ts` | server (in practice) | none — but contains no secrets |
| `lib/tmdb/normalize.ts` | server (in practice) | none — pure functions |
| `lib/constants.ts` | **both** | intentionally shared, no secrets |
| `lib/api/fetch-json.ts` | client | — |
| `lib/api/responses.ts` | server | — |

The `types.ts` decision is worth calling out: it is imported by client components but contains **only types**, so it compiles to nothing. Keeping `TargetProviderKey` defined there rather than in `constants.ts` avoids pulling provider IDs into the client bundle. That is a deliberate, correct call.

`src/app/page.tsx` is a 9-line server component that renders one client component. Everything interactive lives under `MovieSearch.tsx`.

## Issues

- **`MovieSearch.tsx` is the only real client boundary and it is doing too much** at 255 lines: two data-fetching effects, two derived state machines, the search form, the layout shell, and the attribution footer. It is not yet unmanageable, but it is the file that will grow when TV support and pagination arrive. Extracting the two fetch effects into `useSearchQuery()` / `useProviderQuery()` hooks would halve it and make both independently testable.
- **`errors.ts` and `normalize.ts` lack `server-only`.** Harmless today (neither holds secrets), but a client component *could* import `TmdbError` and pull the whole module in. Low priority; add the guard for consistency.
- **No Suspense or streaming.** Everything is client-fetched after hydration. For this app's interaction model (search-as-you-type) that is the correct choice, not a deficiency. Do **not** convert to server components chasing a best-practice checkbox.

---

# Error Handling Review

## Current taxonomy

`src/lib/tmdb/errors.ts` already defines a discriminated error code union with HTTP mapping:

| Current code | HTTP | Brief's requested name | Status |
| --- | --- | --- | --- |
| `configuration` | 503 | `TMDB_NOT_CONFIGURED` | ✅ present |
| `configuration` (401/403) | 503 | `TMDB_AUTH_ERROR` | ⚠️ **conflated** |
| `rate_limited` | 429 | `TMDB_RATE_LIMIT` | ✅ present |
| `timeout` | 504 | `TMDB_TIMEOUT` | ✅ present |
| `upstream` | 502 | `TMDB_UPSTREAM_ERROR` | ✅ present |
| `network` | 502 | — | ✅ bonus |
| `invalid_response` | 502 | — | ✅ bonus |
| `not_found` | 404 | — | ✅ bonus |

**Roughly 90% of the requested error architecture already exists.** This is another finding that argues against a rebuild.

## The one real defect

**`TMDB_NOT_CONFIGURED` and `TMDB_AUTH_ERROR` are collapsed into a single `configuration` code** (`client.ts:19` and `client.ts:94`). These are operationally different:

- *Not configured* → the deployment is missing an environment variable. Fix: set the secret.
- *Auth rejected* → the token exists but is invalid, revoked, or rate-limit-banned. Fix: rotate the credential.

They currently produce different *messages* but the same *code*, so monitoring and alerting cannot distinguish them, and the client cannot branch on them. `MovieSearch.tsx:207` branches on `code === "configuration"` and shows `.env.local` setup instructions — **which would be wrong and misleading advice for a revoked token in production.**

Split into `not_configured` and `auth_failed`.

## Other observations

- **Normalization is correct: no raw upstream error ever reaches the user.** `toErrorResponse()` returns a fixed generic message for non-`TmdbError` exceptions.
- **Error codes are not namespaced.** `configuration` and `network` are generic; once a second provider exists, `TMDB_*` / `PROVIDER_*` prefixes will be needed to tell sources apart.
- **The client re-derives errors loosely.** `fetch-json.ts` accepts any `{error:{code,message}}` shape and falls back to `"unexpected"`. Defensive and fine.
- **No retry, anywhere.** For `timeout` and `upstream` (502/503), one bounded retry with jitter is standard and cheap. Deliberately absent today — acceptable for a demo, worth adding before production. **Do not retry `rate_limited`** — that makes it worse.
- **No structured logging at all.** Zero `console.*` is excellent for secret hygiene but means a production incident would be **completely invisible**. You cannot currently answer "how often is TMDb timing out?" This is the single biggest production-readiness gap after rate limiting.
- **No `error.tsx` boundary.** An unexpected render-time exception in `MovieSearch.tsx` produces the default Next.js error page rather than branded, localized copy.

---

# Internal Data Model Review

## Does the app own its models?

**Yes — unambiguously.** `src/lib/tmdb/types.ts` defines `MovieSummary`, `MovieSearchResult`, `ProviderAvailability`, `FlatrateProvider`, `MovieProvidersResult`, `ApiErrorBody`. No TMDb response object is passed through anywhere. Verified by reading every component: none references `poster_path`, `release_date`, `vote_average`, `provider_id`, or any other snake_case TMDb field.

## Where normalization happens (correctly)

Immediately at the adapter boundary, before any value is cached:

- `search.ts` → `normalizeSearchResponse()` → `normalizeMovie()`
- `providers.ts` → `normalizeProvidersResponse()` → `normalizeFlatrate()`
- Shared primitives in `normalize.ts`

**The cache stores normalized models, not raw payloads.** This is the right order — a change to the internal model invalidates cached entries naturally rather than silently deserializing into a stale shape.

## Problems with the models

1. **No media-type dimension — the most consequential gap in this audit.**
   The product is described as covering movies *and* TV shows. The model is `MovieSummary`; the routes are `/api/movies/*`; the components are `MoviePoster`, `MovieResultList`, `MovieSearch`. TMDb's `/search/multi` returns mixed results with a `media_type` discriminator, and TV availability lives at `/tv/{id}/watch/providers`.

   Retrofitting this later means changing the model, the routes, the cache keys, the components, **and the public API surface at the same time.** Doing it now, at 1,499 lines, is a rename plus one new field. **This is why I rank it P1 rather than deferring it.**

   Target: `MediaType = "movie" | "tv"`, `TitleSummary` with `mediaType`, cache keys namespaced by type.

2. **`posterPath` is dead weight.** Both `posterPath` and `posterUrl` are serialized to the client; only `posterUrl` is consumed (`MoviePoster.tsx`). Drop `posterPath` from the public model — it is a raw TMDb value with no consumer.

3. **`justWatchUrl` names a vendor inside the internal model.** Should be `deepLinkUrl` with the source recorded separately.

4. **`region: string` is too loose.** Typed as `string` but documented as "always TR". Either narrow it to a `Region` union or make it genuinely configurable — the current state is neither.

5. **No shared API contract module.** Client and server agree on shapes only because both import `lib/tmdb/types.ts`. That works, but the file's *name* implies TMDb ownership of what is actually the application's public API contract. Renaming to `src/lib/contracts/` (or `src/types/api.ts`) would make the ownership honest and is a zero-risk move.

---

# Testing Review

## What exists

**Nothing.** Zero test files. No test runner. No CI.

The verification story is currently `lint` + `typecheck` + `build`, all manual. That is genuinely better than nothing — it catches type errors and React Compiler rule violations — but it verifies **no behavior**.

## Assessment against the target layers

| Layer | Status | Recommendation |
| --- | --- | --- |
| **A. Lint** | ✅ Present, passing | Add a rule banning `NEXT_PUBLIC_.*(TOKEN\|SECRET\|KEY)` |
| **B. TypeScript / build** | ✅ Present, passing | Wire into CI (P2) |
| **C. Environment / config validation** | ❌ Absent | Small; comes free with `config/env.ts` |
| **D. Unit tests** | ❌ Absent | **Highest value per hour spent** |
| **E. TMDb adapter tests** | ❌ Absent | **Do this. Fixtures only, no live calls.** |
| **F. API route tests** | ❌ Absent | Defer — thin wrappers, mostly covered by D+E |
| **G. Integration smoke test** | ❌ Absent | Defer; one CI job hitting a running server later |
| **H. Critical user-flow test** | ❌ Absent | **Do not build yet.** Playwright + CI browsers is disproportionate at this size |

## What should exist, concretely

Only two things genuinely matter right now, and both target the same risk: **the app can silently lie to the user about subscription availability, and nothing would catch it.**

1. **`normalizeProvidersResponse()` — the classification rule.** Test with hand-written fixtures:
   - `flatrate` containing Netflix ID 8 → `netflix.available === true`
   - `rent`/`buy` containing Netflix → `available === false` *(the rule most likely to regress)*
   - ad-tier IDs 1796 / 2100 → matched
   - a provider **named** "Netflix" with a different ID → **not** matched (proves ID-only matching)
   - `results.TR` absent → `hasRegionData === false`
   - `results.US` present, `results.TR` absent → still `false` (proves region isolation)
   - malformed input (`null`, `[]`, `{results:{TR:{flatrate:"x"}}}`) → no throw

2. **`normalize.ts` primitives** — `toReleaseYear`, `toExternalHttpsUrl` (especially that it rejects `javascript:` and `http:`), `asPositiveInteger`.

Both are **pure functions**. Neither needs HTTP mocking, a browser, or a running server.

## The blocker you will hit

`providers.ts` currently combines fetch + cache + normalize in one module, and imports `server-only`, which throws outside a bundler context. **You cannot test the rule without first extracting the pure normalization function into its own module.** That extraction is small and is listed in the migration order.

Runner recommendation: **Vitest.** It handles TypeScript and the `@/*` alias natively. Node's built-in runner requires explicit `.ts` import extensions, which conflicts with the Next.js convention — I attempted this route previously and it fights the toolchain. One dev dependency is the right trade here.

**Do not** aim for a coverage percentage. Six well-chosen assertions on the classification rule are worth more than 80% coverage of getters.

---

# Dependency Review

## Production dependencies (4)

| Package | Version | Assessment |
| --- | --- | --- |
| `next` | 16.3.0 | Current stable. Justified. |
| `react` / `react-dom` | 19.2.8 | Required by Next 16. |
| `server-only` | 0.0.1 | **Keep.** 0.0.1 looks alarming but this is a Vercel-maintained package whose entire implementation is a build-time resolution trick; it has no logic to version. It buys a compiler-enforced security boundary for ~0 bytes. |

**This is an unusually disciplined production tree.** Nothing to remove.

## Dev dependencies (8)

All standard `create-next-app` output. A `depcheck` run flags `@tailwindcss/postcss`, `tailwindcss`, `@types/node`, `@types/react-dom` as unused — **all four are false positives**: the first two are referenced from `postcss.config.mjs:3` and `globals.css:1` (`@import "tailwindcss"`), and the type packages are consumed implicitly by `tsc`. **Do not remove them.**

## Install scripts

**Exactly one package in the tree runs an install script:**

```
eslint-config-next@16.3.0
└── eslint-import-resolver-typescript@3.10.1
    └── unrs-resolver@1.12.2   (postinstall: node postinstall.js)
```

It is a **dev-only, transitive** native-resolver binding. It does not reach production. npm flagged it during install (`npm warn allow-scripts`). Acceptable; if you want defense in depth later, `npm config set ignore-scripts true` plus an explicit allowlist is possible, but it is not warranted at this risk level.

## Vulnerabilities

`npm audit` (including dev): **0 vulnerabilities**. 288 packages total.

## Missing dependencies that are justified

- **Vitest** (dev) — see Testing.
- **A rate limiter** — before public deploy. Prefer a platform primitive (Vercel/Cloudflare) over an application dependency where possible.
- **A shared cache client** — *only if* you deploy serverless. See Production Readiness.

## Outdated architectural choices

None found. `tsconfig.json` `target: ES2017` is conservative but is create-next-app's default and harmless — Next transpiles per browserslist regardless.

---

# UI Architecture Review

## Structure

Component decomposition is sensible for the size: one orchestrator (`MovieSearch`), one list, one detail panel, two shared primitives (`MoviePoster`, `StatusMessage`). Props are explicit, there is no context, no state library, no prop drilling beyond one level.

Accessibility is better than typical: `aria-pressed` on result buttons, `aria-live="polite"` on the provider panel, `role="status"` / `role="alert"` in `StatusMessage`, a real `<label>` bound to the input, `min-h-11` (44px) touch targets, and `text-base` on the input to prevent iOS zoom. **This was done deliberately and should be preserved.**

## Can the styling architecture support the intended identity?

The intended identity is: black and white, retro cinema, minimal, modern, responsive, not kitsch, not a fake 1990s site.

**The architecture can support this. The current implementation actively works against it.**

A theme layer was recently added to `globals.css` but **was never connected to the components**. The result is two competing styling systems:

### Evidence

1. **Three of the five new theme classes have zero usages.**
   `.watchmuse-card` → 0. `.watchmuse-badge` → 0. `.wm-muted` → 0.
   Only `.watchmuse-retro` and `.film-grain` are applied, both on `<body>` in `layout.tsx:27`.

2. **Components use 58 hardcoded `black/white` opacity utilities** (`text-black/70 dark:text-white/70`, `border-black/10 dark:border-white/15`, …) instead of the semantic tokens `--wm-foreground` / `--wm-muted` / `--wm-accent`. The theme variables therefore control almost nothing.

3. **The palette contradicts the brand.** Despite "black and white":
   - `ProviderPanel.tsx:23–24` — `border-l-[#E50914]` (Netflix red), `border-l-[#00A8E1]` (Prime blue)
   - `ProviderPanel.tsx:36,45` — emerald and amber badges
   - `StatusMessage.tsx:5–7` — red and amber alert boxes

   That is **16 colored utility classes plus 2 brand hex values** in a monochrome design. This is not a small tuning issue; the status-communication strategy currently *depends* on hue, and a black-and-white redesign must replace it with weight, border, rule, or typography.

4. **Two competing sources of truth for light/dark.**
   `globals.css:4–9` sets the `:root` default to **dark** (`#0b0b0b`), with light applied only under `@media (prefers-color-scheme: light)`. But Tailwind's `dark:` variant activates only under `prefers-color-scheme: dark`.
   Under `no-preference`, the body renders **dark** while every `dark:`-guarded utility stays inactive — producing near-black text on a near-black background. Modern browsers almost always report `light`, so this is latent rather than active, but it is a genuine inversion bug and it demonstrates that the theme was never reconciled with the utility layer.

5. **`img { filter: grayscale(100%) contrast(1.05) }`** (`globals.css:37–39`) is a global element selector with no escape hatch. It will desaturate *every* future image — logos, icons, illustrations — and can only be undone with `!important` or a more specific selector. The filmic look is a good instinct; the implementation is too blunt for a utility-first codebase. It belongs on a `.poster` class.

6. **`.film-grain::before`** uses `rgba(...,0.01)` gradients under `mix-blend-mode: overlay` — effectively invisible. It is a `position: fixed`, `z-index: 9999` element that currently costs a compositing layer and delivers no visual effect. Either implement it properly (SVG turbulence or a tiled noise data-URI) or remove it.

7. **Typography is contradictory.** `body.watchmuse-retro` sets `font-family: var(--font-geist-sans), Georgia, 'Times New Roman', serif` — a geometric sans with **serif fallbacks**. The two would render as visually unrelated designs. Retro cinema identity would be better served by a deliberate display face for headings (condensed grotesque or a slab) against a neutral body face, not by a fallback chain that mixes classifications.

### Verdict on the UI layer

The **component structure is sound and reusable**. The **styling layer is currently half-migrated and internally inconsistent** — it is new technical debt created in the last change, not legacy debt.

The correct fix is a **token-first pass**: define semantic tokens (`--wm-bg`, `--wm-fg`, `--wm-muted`, `--wm-line`, `--wm-emphasis`), expose them through `@theme` so Tailwind generates `bg-*`/`text-*` utilities, then replace the 58 hardcoded utilities with token utilities and re-express the three status states monochromatically. That is a mechanical, low-risk change — and it must happen **before** any real visual design work, or the design will be applied twice.

Also note: the `<h1>` still reads "Film Abonelik Kontrolü" (`MovieSearch.tsx:120`) — the product was renamed to WatchMuse in metadata and docs but not in the interface.

---

# Production Readiness

Can the same codebase serve local → staging → production without architectural change?

**Mostly yes — with two exceptions that are architectural, not configuration.**

## What already works across environments

- Secrets come from the environment, read lazily per request. Vercel/Docker/systemd injection all work unchanged.
- The build succeeds without a token, so CI can build without production secrets.
- No filesystem writes, no local state, no build-time data fetching.
- Routes are correctly dynamic (`ƒ`); nothing is accidentally frozen at build time.

## Exception 1 — caching does not survive the deployment model

`ttl-cache.ts` is a module-scope `Map`. Its behavior varies drastically by target:

| Target | Behavior |
| --- | --- |
| Local dev | Works; cleared on HMR reload |
| Single VPS / Docker (1 instance) | **Works as designed** |
| Multiple instances / autoscaling | Hit rate divided by instance count |
| Vercel / serverless | **Effectively disabled** — cold starts discard it; the 6-hour TTL is fiction |

Since your deployment target is **undecided**, this is precisely the decision to defer *safely* rather than accidentally. The mitigation is architectural and cheap:

> Put the cache behind a narrow interface — `get(key)` / `set(key, value, ttlMs)` — and inject the implementation. `createTtlCache()` is already close to this shape; it needs to become a *contract* that `search.ts`/`providers.ts` depend on, rather than a concrete module they import directly.

Then the in-process implementation ships today, and a shared implementation (Redis/Upstash, or a Next cache handler) can be swapped in when the target is chosen — **without touching domain code**.

**Cost of deciding late:** low, *if* the interface exists. High if it does not, because the cache is entangled with the same modules that will also be split for the adapter refactor.

## Exception 2 — the open proxy

Covered under Security. Restated because it is a hard deployment gate: **do not deploy publicly without rate limiting.** Prefer edge/platform rate limiting (Vercel Firewall, Cloudflare) over an in-app limiter — an in-app limiter on serverless has the same per-instance problem as the cache.

## Other production gaps

| Gap | Impact |
| --- | --- |
| **No logging/observability** | You cannot diagnose anything. Highest-value addition after rate limiting. Requires a redaction-safe logger — the current zero-`console` discipline must not be traded away carelessly. |
| No health/readiness endpoint | Blocks most orchestrators |
| No CI | Nothing prevents a broken `main` |
| No `error.tsx` / `not-found.tsx` | Default Next.js error pages, unbranded and untranslated |
| Empty `public/` | No favicon, no OG image — every social share renders blank |
| No security headers | CSP, `X-Content-Type-Options`, Referrer-Policy all unset; `next.config.ts` sets only `images` |
| No `engines` field in `package.json` | Nothing pins the Node version across environments |
| Hardcoded `tr-TR` / `TR` | A second market requires code changes, not config |

---

# Technical Debt

Ranked by *cost of delay* rather than size.

1. **Movies-only data model.** Cost grows fastest — it will eventually require model + route + cache-key + component + public-URL changes simultaneously. Cheapest to fix now.
2. **Untested classification rule.** Silent-wrongness risk. The app can confidently tell users a film is on Netflix when it is not, and nothing would notice.
3. **Adapter/service conflation.** Blocks both testing and any second provider.
4. **Cache with no interface.** Blocks the deployment-target decision.
5. **Half-applied theme.** Newly created debt. Grows with every component added before the token pass.
6. **`configuration` error conflation.** Produces actively misleading user guidance in production.
7. **Documentation rot — already present.** Three overlapping documents (`README.md`, `AI_README.md`, `WORK_SUMMARY.md`) describe the same project with different levels of accuracy. `AI_README.md` §7 cites **`src/lib/normalize.ts`**, a path that does not exist (the file is `src/lib/tmdb/normalize.ts`), and §5 recommends git-history secret cleanup for a leak that never happened. `WORK_SUMMARY.md` still calls the project "Movie Search Demo" and lists as pending work several items that are already complete. **Two of these three documents are now net-negative** — a future contributor (human or AI) reading them will act on false information. Consolidate into `README.md` + this audit, and delete the other two.
8. **Identity mismatch.** `package.json` name is `movie-search-demo`; the `<h1>` says "Film Abonelik Kontrolü". Trivial, but it is the kind of thing that quietly persists into production.
9. **`fetchJson` signal made optional.** `fetch-json.ts:24` weakened `signal: AbortSignal` to `signal?: AbortSignal`. The stated rationale — that a required parameter was causing a runtime error — does not hold: **both call sites pass a signal** (`MovieSearch.tsx:49` and `:83`). The change removed a compile-time guarantee that every request is cancellable, in exchange for nothing. Revert.
10. **Dead field `posterPath`.** Serialized to every client, consumed by nobody.

---

# Rewrite vs Refactor Decision

## The case for rebuilding (steelmanned)

- The codebase is only 1,499 lines. A rebuild is *affordable* in a way it will never be again.
- The desired target architecture has two layers that do not exist today (service, provider abstraction).
- The product scope changed — movies + TV, not movies — and the model does not reflect it.
- Design is being reworked anyway, so UI churn is already priced in.
- Only one commit exists; there is no history to preserve.

**This is a serious argument. I considered it properly rather than dismissing it.**

## Why it loses

The question is not "could a cleaner architecture exist?" — one always could. The question is **what does a rebuild buy that a refactor does not?**

Working through it:

| Target requirement | Rebuild needed? | Why not |
| --- | --- | --- |
| Server-side secret guarantee | **No** | Already enforced at build time |
| Internal data models | **No** | Already own their shapes; UI is decoupled |
| Normalized error taxonomy | **No** | ~90% present; needs one split + renaming |
| Centralized config | **No** | New file; one call site to update |
| Service / adapter split | **No** | Extract two pure functions from two files |
| Provider abstraction | **No** | Model shape is already provider-neutral; leak is vocabulary |
| Media-type dimension | **No** | Add a field, rename types, namespace cache keys |
| Testability | **No** | Blocked only by the adapter split above |
| Swappable cache | **No** | Interface extraction, ~20 lines |
| Monochrome theme | **No** | Token pass over existing components |

**Every single target requirement is reachable by addition, extraction, or renaming.** Not one requires inverting a dependency, relocating the trust boundary, or restructuring the data flow.

A rebuild would discard code that is **lint-clean, type-clean, builds successfully, has verified error paths, and has a correct and documented core business rule** — in order to converge on the same layering, while re-introducing the risk of getting the secret boundary and the availability-classification semantics wrong a second time. Those two are exactly the details that are easy to get subtly wrong and expensive to discover late.

Migration cost estimate: **~30–35% of files touched, 0% rewritten from scratch.** That is squarely refactor territory.

## The honest caveat

If the answer to *"is WatchMuse fundamentally a Turkish, movie-only, two-platform checker?"* is **no** — if it is really a multi-market, multi-media, multi-provider discovery product — then the *product* scope has changed more than the *code* has. Even then, the refactor path holds, because the expensive foundations still transfer. But the media-type work moves from "important" to "do it first," which is how I have ordered it below.

## DECISION

> ## **B) REFACTOR SELECTED PARTS**
>
> Keep: the secret boundary, the internal data models, normalization, the error taxonomy, the component structure, the client/server enforcement.
>
> Refactor: split adapter from service, add the media-type dimension, add a config layer, extract a cache interface, split the `configuration` error, unify the theme on tokens.
>
> Add: unit tests for the classification rule, rate limiting, logging, CI.
>
> Delete: `AI_README.md`, `WORK_SUMMARY.md`, `posterPath`.

---

# Proposed Target Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                             │
│                                                                      │
│   components/            hooks/                                      │
│    TitleSearch      ──►   useTitleSearch()    debounce · abort       │
│    TitleResultList        useAvailability()   keyed by input         │
│    AvailabilityPanel                                                 │
│         │                                                            │
│    Depends ONLY on  lib/contracts/*  (types, zero runtime)           │
└─────────┬────────────────────────────────────────────────────────────┘
          │  GET /api/titles/search?q=&type=
          │  GET /api/titles/{type}/{id}/availability
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  TRANSPORT   app/api/**/route.ts                                     │
│   · input validation      · rate limiting  ◄── NEW, pre-deploy gate   │
│   · AppError → HTTP       · request logging ◄── NEW                  │
│   Thin. No business logic.                                           │
└─────────┬────────────────────────────────────────────────────────────┘
          ▼
┌──────────────────────────────────────────────────────────────────────┐
│  SERVICE     lib/services/                                           │
│   titleService.search(query, opts)                                   │
│   availabilityService.forTitle(mediaType, id, region)                │
│                                                                      │
│   Owns: caching policy, orchestration, business rules                │
│   Knows NOTHING about TMDb.                                          │
└────┬────────────────────────────────────────────┬────────────────────┘
     │                                            │
     ▼                                            ▼
┌─────────────────────────┐          ┌────────────────────────────────┐
│ CACHE  lib/cache/       │          │ PROVIDER CONTRACT              │
│  interface CacheStore   │          │ lib/providers/types.ts         │
│   get / set / delete    │          │                                │
│                         │          │  interface ContentProvider {   │
│  ├ memory.ts  (today)   │          │    searchTitles(...)           │
│  └ shared.ts  (later,   │          │    getAvailability(...)        │
│     only if serverless) │          │  }                             │
│                         │          │                                │
│  Swappable WITHOUT      │          │  Returns CONTRACT types only.  │
│  touching services.     │          └───────────┬────────────────────┘
└─────────────────────────┘                      │
                                                 ▼
                              ┌──────────────────────────────────────┐
                              │ ADAPTER  lib/providers/tmdb/         │
                              │   ├ adapter.ts    implements iface   │
                              │   ├ http.ts       ★ TOKEN READ POINT │
                              │   │               import "server-only"│
                              │   ├ normalize.ts  PURE ── unit tested │
                              │   ├ mapping.ts    provider ID table   │
                              │   └ errors.ts     TMDB_* → AppError   │
                              └───────────────┬──────────────────────┘
                                              ▼
                                    https://api.themoviedb.org/3

┌──────────────────────────────────────────────────────────────────────┐
│  CROSS-CUTTING                                                       │
│   config/env.ts    typed, lazy, server-only, redaction-safe          │
│   lib/errors.ts    AppError + code union (TMDB_* / PROVIDER_* / APP_*)│
│   lib/contracts/   MediaType · TitleSummary · AvailabilityResult      │
│   lib/logging.ts   structured, redacting                             │
└──────────────────────────────────────────────────────────────────────┘

TRUST BOUNDARY ────────────────────────────────────────────────────────
  Everything above ADAPTER is token-free by construction.
  Exactly one module reads the secret. That property is preserved
  from the current design — it is the thing most worth keeping.
```

**Deliberate omissions from this target:** no dependency-injection container, no plugin registry, no repository pattern, no event bus, no CQRS. The `ContentProvider` interface is satisfied by a single exported object; a second provider would be a second object and one `if`. That is sufficient until a second provider actually exists.

---

# Priority Classification

## P0 — security / correctness blocker

**None in the current private-demo context.**

Conditional P0s that activate on public deployment:

- **P0-on-deploy:** unauthenticated, unthrottled proxy to your rate-limited TMDb quota.
- **P0-on-deploy:** no observability — an incident would be undiagnosable.

## P1 — architectural, before further feature development

| ID | Item |
| --- | --- |
| P1-1 | **Add the media-type dimension** (`MediaType`, `TitleSummary`, `/api/titles/*`). Cheapest now; touches model + routes + UI simultaneously later. |
| P1-2 | **Split adapter from service.** Extract pure normalization out of `search.ts`/`providers.ts` — this is the prerequisite for every test below. |
| P1-3 | **Unit-test the availability classification rule.** Highest correctness value in the repository. |
| P1-4 | **Extract a `CacheStore` interface.** Unblocks the deployment-target decision safely. |
| P1-5 | **Split `configuration` into `not_configured` and `auth_failed`.** Currently produces misleading user guidance in production. |
| P1-6 | **Rate limiting** — before the first public deploy, not after. |

## P2 — important improvement

| ID | Item |
| --- | --- |
| P2-1 | `src/config/env.ts` — typed, lazy, redaction-safe |
| P2-2 | Unify the theme on semantic tokens; remove the 58 hardcoded utilities; re-express the three status states monochromatically |
| P2-3 | Structured, redacting logger |
| P2-4 | Delete `AI_README.md` and `WORK_SUMMARY.md`; fold anything correct into `README.md` |
| P2-5 | Revert `fetchJson` `signal` to required |
| P2-6 | Rename `lib/tmdb/types.ts` → `lib/contracts/`; drop `posterPath`; `justWatchUrl` → `deepLinkUrl` |
| P2-7 | CI: lint + typecheck + build + test on push |
| P2-8 | Rename the package to `watchmuse`; fix the `<h1>` |
| P2-9 | Add `error.tsx` / `not-found.tsx` |
| P2-10 | ESLint rule banning `NEXT_PUBLIC_.*(TOKEN\|SECRET\|KEY)` |
| P2-11 | Thread caller `AbortSignal` into `tmdbRequest` |
| P2-12 | Bounded retry for `timeout` / `upstream` only — never for `rate_limited` |
| P2-13 | Move `img { filter: grayscale }` off the global element selector onto a class |

## P3 — optional polish

`engines` field · security headers · favicon + OG image · health endpoint · pagination · extract fetch hooks from `MovieSearch.tsx` · `server-only` on `errors.ts`/`normalize.ts` · implement or delete `.film-grain` · deliberate display typeface · UI copy extraction for future i18n

---

# Recommended Migration Order

Sequenced so each step is independently shippable and leaves the app working.

**Phase 1 — Make it testable (prerequisite for everything else)**
1. Extract pure normalization from `search.ts` / `providers.ts` into `normalize`-only modules with no `server-only` import. *(P1-2)*
2. Add Vitest. Write the classification-rule tests **against the current behavior** — this locks in correctness *before* renaming anything. *(P1-3)*

> Doing tests before renames is the whole point of this ordering: the tests become the safety net for Phase 2.

**Phase 2 — Model and naming, while the codebase is still small**
3. Introduce `MediaType`; rename `MovieSummary` → `TitleSummary`; namespace cache keys by media type. *(P1-1)*
4. Move routes to `/api/titles/*`. Free now — a breaking change once anything external consumes them. *(P1-1)*
5. Rename `lib/tmdb/types.ts` → `lib/contracts/`; drop `posterPath`; `justWatchUrl` → `deepLinkUrl`. *(P2-6)*
6. Split the `configuration` error code. *(P1-5)*

**Phase 3 — Structural seams**
7. Extract the `CacheStore` interface; keep the in-memory implementation as the default. *(P1-4)*
8. Introduce `config/env.ts`; move `TMDB_LANGUAGE`/`TMDB_REGION` into it. *(P2-1)*
9. Define the `ContentProvider` interface and make the TMDb module implement it. **One implementation only.** *(architecture)*

**Phase 4 — Correctness and hygiene**
10. Revert the `fetchJson` signal; thread caller signals into `tmdbRequest`. *(P2-5, P2-11)*
11. Add CI. *(P2-7)*
12. Delete the two stale AI docs; reconcile `README.md`. *(P2-4)*
13. Rename package; fix `<h1>`; add `error.tsx`. *(P2-8, P2-9)*

**Phase 5 — Visual identity (only after the structure settles)**
14. Semantic token pass; replace hardcoded utilities; monochrome status states. *(P2-2)*
15. Then, and only then, the actual retro-cinema visual design.

**Phase 6 — Deployment gate (do not skip)**
16. Rate limiting. *(P1-6)*
17. Structured logging. *(P2-3)*
18. Decide the deployment target → choose the `CacheStore` implementation.
19. Security headers, favicon, OG image, health endpoint.

**Phases 1–2 are the highest-value work in this document.** If only two days are available, spend them there.

---

# Things We Should NOT Build Yet

Explicitly out of scope. Each of these would be a plausible-sounding mistake at this size.

| Do not build | Why |
| --- | --- |
| **DI container / IoC framework** | 1,499 lines. Module imports *are* the injection mechanism. |
| **Plugin/provider registry** | There is one provider. Build the registry when there are two, and you will know what it needs. |
| **Second provider implementation** | The interface is worth defining; a speculative second implementation is not. |
| **GraphQL / tRPC / BFF** | Two GET endpoints. |
| **Database** | There is no state to persist. |
| **Redis / shared cache** | **Only if** you deploy serverless. The *interface* is the deliverable now; the implementation waits for the deployment decision. |
| **Authentication / user accounts** | No per-user data exists. Rate limiting solves the abuse problem without it. |
| **i18n framework** | One locale. Extract copy into a module first; adopt a framework at locale two. |
| **Playwright / E2E suite** | Disproportionate. Unit tests on the classification rule catch the failure that actually matters. |
| **Coverage thresholds** | Encourages testing trivia. Test the rules that can lie to users. |
| **Microservices / separate backend** | Explicitly excluded from the original brief and still correct. |
| **Server Components refactor of the search flow** | Search-as-you-type is genuinely client interaction. Converting would be a regression. |
| **`zod`** | Hand-written narrowing in `normalize.ts` already works and is smaller. Revisit past ~10 config fields. |
| **PWA / offline / service worker** | No offline use case. |
| **Design system / component library** | Five components. Tokens are enough. |
| **Monorepo / package splitting** | One app. |

---

# Final Verdict

**Refactor. Do not rebuild.**

This foundation is better than the audit brief anticipated. The brief was braced for scattered `process.env` access and possible secret leakage in logs or git history; **none of that exists.** The token is read once, behind a build-time guard, with a clean history and zero logging. The application already owns its data models, and the UI has never seen a raw TMDb object. Those two properties — the trust boundary and model ownership — are the ones that make late-discovered architectural mistakes expensive, and both were decided correctly.

What the foundation lacks is **not depth but breadth**: no config layer, no tests, no media-type dimension, no cache abstraction, no rate limiting, no observability. Every one of those is *additive*. None requires reversing a decision already made.

The honest risks, stated without softening:

- **The core business rule is untested.** The classification logic is correct today by inspection, not by verification. It is the one place where the app can confidently mislead a user, and nothing would catch a regression. Fix this first.
- **The media-type gap is a genuine product/code divergence.** The product claims movies and TV; the code is movies-only, from the model to the route paths to the component names. Every week this waits, the retrofit gets wider.
- **The styling layer regressed recently.** A theme was added to `globals.css` and never connected to the components — three unused classes, 58 hardcoded utilities, 16 colored utilities in a black-and-white brand, and an inverted light/dark default. This is *new* debt, and it will multiply if visual design proceeds before the token pass.
- **The documentation is already actively misleading.** Two AI-generated documents contain incorrect file paths and recommend remediation for a security incident that never happened. Delete them.

You said you would rather rebuild 30% now than find the foundation wrong in six months. **That is the correct instinct, and this report is telling you the number is roughly 30% — but it is 30% of *files touched*, not 30% thrown away.** The refactor is the same amount of work you were prepared to spend on a rewrite, invested in the parts that are actually wrong, while keeping the parts that are difficult to get right and already are.

Start with Phase 1. Make it testable, then lock in the current behavior with tests, then rename freely behind that net.
