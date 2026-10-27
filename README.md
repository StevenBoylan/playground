# Playground

Open-source concept demos by Steven Boylan. The first is **Post-Application Architecture (PAA)**: a working
prototype of software without a fixed interface. You state an intent, an AI layer chooses authorized capabilities,
trusted services compute the answer, and a purpose-built interface is composed on the fly.

> **Agents decide. Services execute. Policies constrain.**

Everything in the demo is fictional and synthetic. Nothing is real data, and nothing is ever sent anywhere.

## What it shows

Three fictional companies, each with its own data, capabilities and profiles, all served by the same engine:

| Company | Domain | Profiles | What it demonstrates |
|---|---|---|---|
| **Northstar Manufacturing** | Manufacturing | Operations Director, Line Supervisor | Data **scope**: a supervisor is narrowed to one plant, and asking for another is blocked |
| **Orbit Software** | B2B SaaS | CEO, Head of Operations, Junior Software Developer | **Redaction**: the same churn question shows revenue to the CEO, a dash to Operations, and is refused to the developer |
| **Grove People** | People operations | HR Business Partner, Executive, Hiring Manager | **Disclosure control**: groups under five people are combined, never singled out; no individual records exist |

Each company has four years of deterministic synthetic data with planted stories (an incident, a price rise, a
hiring freeze) so there is something real to discover.

The interface is deliberately one control: say what you want. There is no dashboard to navigate. Anything you can
see can also be turned into a branded **PDF**, a branded **PowerPoint** with native charts, or a simulated **email
draft** (never sent). Who you are is a profile menu; switching it re-runs what is on screen under that profile's
permissions.

## How it works

```
intent ─▶ AI planner (Claude) ─▶ capability calls + layout (JSON)
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
   authorize ▸ validate ▸ execute services              validate the layout
   (role, scope, redaction, small groups)               (refs, fields, no typed numbers)
              └───────────────────────┬───────────────────────┘
                                      ▼
                       allowlisted components render it
                                      ▼
                  inspector: what actually happened
```

The invariants that make it trustworthy:

1. **The model never computes a figure.** Charts and cards point at service results; narrative text may contain
   numbers only through bound `{{slots}}`, and anything typed is rejected.
2. **The model never writes code or files.** It emits declarative JSON (a view, or a document spec). The backend
   validates it, binds it to real results, and renders from an allowlist of components.
3. **Policy is enforced on the server, on every call**, including the calls the model plans and any direct API
   call. Outcomes are allow, deny, or allow-with-redaction, and each is recorded.
4. **The inspector is truthful.** It shows recorded events, kept visibly apart from the model's stated reasons.
5. **Read-only.** No external writes. Email is a simulation.

The full specification is in [`docs/paa-spec.md`](docs/paa-spec.md).

## Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
cp .env.example .env.local      # then add your Anthropic API key
npm run dev                     # http://localhost:3000
```

With no API key the demo still works: type one of the example requests exactly (press **Tab** in an empty field to
fill one) and it runs through the curated path. Free-form questions need the key.

### Environment

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Server-side only; never sent to the browser. Without it the live AI path is off |
| `ANTHROPIC_MODEL` | Model for planning. Default `claude-sonnet-5-5` |
| `DEMO_PASSWORD` | When set, the page and every API route require this password. Leave it empty locally |
| `ACCESS_HOURS` | How long an unlock lasts. Default 12 |
| `AI_DAILY_CAP` | Ceiling on AI requests per UTC day. Default 300 |

### Keeping a public demo private

A public link to a demo that calls a paid API can be found and used up in minutes, so the demo has a gate. When
`DEMO_PASSWORD` is set:

- The page **and every `/api/paa/*` route** require it, so the API cannot be called directly to spend credits.
  Without access, pages redirect to an unlock screen and API calls get a `401`.
- Entering the password issues a signed, `HttpOnly`, expiring cookie. The password is the signing key, so
  **changing it signs everyone out at once**: rotate it after a talk.
- Guessing is limited to eight attempts per ten minutes per visitor, and wrong guesses are slowed down.
- The unlock link can only lead back into the demo, and search engines are told not to index anything.
- `AI_DAILY_CAP` is a second backstop on how many model calls the demo will make in a day.

None of this replaces a spend limit. Set one for your key in the Anthropic Console before exposing the demo to
anyone. The in-memory limits (rate limiter, daily cap) count per server instance, so on serverless hosting each
instance counts separately.

### Deploying (for example to Vercel)

Set `ANTHROPIC_API_KEY`, `DEMO_PASSWORD` (and optionally `ACCESS_HOURS`, `AI_DAILY_CAP`) as environment variables in
the hosting project, never in the repository. To use a subdomain of your own site, add a `CNAME` record for it
pointing at the host.

## Tests

```bash
npm run typecheck
npm run lint
npm test                 # unit and integration (scripted fake model, no API calls, no cost)
npm run test:e2e         # browser tests (Playwright); the live model route is stubbed
npm run build
```

The tests cover the formulas, tenant isolation, every profile's permissions, redaction, disclosure control, UI
validation (including malformed and hostile model output), document generation, and the browser journeys. A scripted
fake model stands in for Claude, so the suite is deterministic and free to run.

## Project layout

```
src/
  app/                      Next.js routes: the page and /api/paa/{intent,run,rerun,export}
  components/paa/           workspace, intent bar, profile menu, renderer, inspector, document previews
  lib/paa/
    data/                   seeded synthetic datasets (one per company)
    capabilities/           typed services and the registry that runs them
    policies/               roles, authorization, scope, disclosure control
    orchestration/          prompt, model adapter, orchestrator, curated fallback
    schemas/                UI spec, bindings, validation, trace
    documents/              PDF, PPTX and chart generation
    actions/                authorized document actions
docs/paa-spec.md            the specification
tests/                      unit, integration and end-to-end
```

## Status

A working concept demo, not a product. Known limits: the rate limiter and daily cap are in-memory (use a shared
store when deploying to serverless hosting), and the access control is one shared password, which is right for a
talk or a private demo but is not user authentication.

## Licence

MIT. See [`LICENSE`](LICENSE).
