# PAA Playground — Product and Engineering Specification

**Version:** 1.0 (implementation brief)  
**Audience:** Claude Code running in VS Code  
**Project:** Post-Application Architecture (PAA) interactive public demo  
**Proposed deployment:** `playground.stevenboylan.com/paa` (domain and DNS to be confirmed)

## 1. Mission

Build a polished, publicly accessible interactive playground demonstrating **Post-Application Architecture**: a user states an intent, an AI orchestration layer chooses authorized capabilities, trusted services execute operations, and a purpose-built interface is rendered dynamically. Users refine the experience conversationally without navigating a fixed application.

**Core principle:** **Agents decide. Services execute. Policies constrain.**  
**Public-facing promise:** **Software without the learning curve.**

This is an architectural demonstration, **not** a generic chatbot that invents charts. All displayed business metrics must be computed from actual synthetic records through typed services. The model may select tools and propose UI composition, but must never invent business facts or bypass policy enforcement.

## 2. Outcomes and acceptance criteria

A visitor can:
1. Select one of three fictional organizations, each with distinct identity, data, capabilities, and policies.
2. Enter a natural-language task and receive a functional, dynamically composed UI.
3. Ask a follow-up that updates or replaces the UI while retaining conversational context.
4. Inspect how the system interpreted intent, selected capabilities, executed services, enforced policies, and rendered components.
5. Try representative read-only flows without signing up, entering an API key, or accessing real customer data.

**Definition of done:** The visitor can complete at least two verified workflows per organization; the UI renders only from service responses; the inspector shows a truthful trace; forbidden operations are blocked by backend authorization; errors are recoverable; and the demo deploys with basic monitoring and abuse limits.

## 3. Users and experience

**Primary audience:** founders, product and technology leaders, architects, AI practitioners, prospective consulting clients, and event attendees.

**Experience:** Landing screen with a short PAA explanation, three organization cards, and suggested prompts. Choosing a company opens a workspace with a conversational intent input, adaptive main canvas, and collapsible **“Show how PAA built this”** inspector. The inspector is useful but not required for casual visitors.

**Core flow:**
1. Choose a fictional company.
2. Select a suggested prompt or type an intent.
3. Show progress states: understanding request → selecting capabilities → fetching data → composing experience.
4. Display a functional UI, e.g. KPI cards, charts, tables, filters, or a form-like workflow preview.
5. Ask a follow-up; update the experience without resetting the entire session.
6. Open the inspector to view intent, selected skills/services, permissions, evidence, and UI composition.
7. Reset the session or switch companies (switching must isolate context).

**Interface principle: one control, not a chatbot with buttons.** The workspace is a canvas. The only primary control is the intent field; the generated view *is* the interface. There is no sidebar, no grid of suggestion cards, no follow-up chips and no conversation log. Example intents appear as cycling ghost text inside the field (Tab accepts one; a quiet "try an example" link serves touch screens), and further ideas live behind Help. Who you are is a small profile menu (an avatar chip) that re-runs what is on screen under that profile's permissions. This keeps the ad-hoc nature of PAA visible: nothing on screen looks like a fixed feature.

Avoid marketing-heavy animations. Prioritize fast response, legibility, accessibility, and clarity.

## 4. Fictional organizations and synthetic data

### A. Northstar Manufacturing
**Domain:** manufacturing and operations.  
**Datasets:** factories, production lines, products, daily output, defects, downtime events, inventory, purchase orders.  
**Capabilities:** production summaries, defect-rate comparison, downtime root-cause breakdown, inventory alerts, production trend charts.  
**Example prompts:**
- “Show production performance for the last quarter, by factory.”
- “Which production lines have the highest defect rates?”
- “Compare downtime this month with last month and show the biggest contributors.”

### B. Orbit Software
**Domain:** B2B SaaS.  
**Datasets:** accounts, subscriptions, plans, invoices, monthly recurring revenue snapshots, churn events, feature usage, support tickets.  
**Capabilities:** MRR and churn calculations, cohort comparison, account segmentation, funnel analysis, support trend summaries.  
**Example prompts:**
- “Show MRR growth over the last six months.”
- “Compare churn across subscription plans.”
- “Which customer segments have high support volume and low adoption?”

### C. Grove People / HR
**Domain:** people operations.  
**Datasets:** departments, anonymized employees, headcount snapshots, hiring pipeline, leave aggregates, training completion, employee survey aggregates.  
**Capabilities:** department headcount trends, hiring funnel analysis, training completion, aggregate leave and engagement metrics.  
**Example prompts:**
- “Show headcount changes by department this year.”
- “Where are candidates dropping out of the hiring funnel?”
- “Compare training completion across departments.”

**Privacy design:** Grove must use synthetic or anonymized aggregate data only. No sensitive individual profiles. Apply minimum cohort thresholds (e.g. suppress metrics for groups under five) in backend services, not only the UI.

### Data rules
- Generate deterministic seeded synthetic datasets with a documented reference date, realistic distributions, and intentional anomalies that make the suggested prompts interesting.
- Give every organization **four years of history** ending on the reference date, queryable weekly, monthly and quarterly, so there is depth to explore: underlying trends (growth, improving quality), seasonality, shutdown periods, and a few dated incidents (one or two historical, one current) that questions can discover. Incidents are documented in the seed code, and tests pin them down so they cannot silently disappear.
- Make date windows explicit and use the dataset reference date for reproducible demo answers.
- Document every metric formula and unit (MRR, churn, defect rate, etc.).
- Compute values in services or SQL, never by asking the LLM to make up numbers.
- Preserve provenance: service name, input parameters, dataset version, returned result identifiers.
- Switching organizations must not leak data or conversation context across tenants.

## 5. Architecture

```text
Visitor / Natural-language intent
            |
            v
Session & company context
            |
            v
AI orchestrator / intent interpretation
            |
            +----> Capability registry (typed contracts)
            |
            +----> Policy decision & enforcement
            |
            v
Authorized service calls ---> Seeded synthetic database
            |
            v
Structured results + provenance
            |
            v
Validated UI composition specification
            |
            v
Shared renderer (allowlisted components)
            |
            v
Adaptive experience + inspectable trace
```

### Architectural invariants
1. **Agents decide:** The orchestration layer maps intent to capability calls and UI composition. It does not own authoritative business logic.
2. **Services execute:** Deterministic, typed services query data and calculate metrics.
3. **Policies constrain:** Backend validation enforces organization, operation, data scope, and result disclosure, including direct API calls.
4. **Interfaces are ephemeral:** The UI is generated as a structured specification from the current task and results; it is not a collection of hardcoded dashboard pages.
5. **The substrate persists:** Data, capabilities, schemas, policies, identity/session and audit traces are durable architectural layers.
6. **No arbitrary generated code execution:** The model emits declarative UI JSON, not HTML, JavaScript, SQL, or executable components.

## 6. Proposed technology stack

Use this as a default, not a rigid mandate. Before implementation, inspect the repository and preserve existing conventions when appropriate.

- **Frontend:** Next.js with TypeScript, React, Tailwind CSS, accessible UI primitives, and a charting library such as Recharts.
- **Backend:** Next.js server routes for orchestration and service APIs, with explicit module boundaries so services can later be extracted.
- **Data:** SQLite for a portable demo and deterministic seeding; Prisma or Drizzle for typed access. Prefer Postgres if the existing deployment environment already provides it.
- **LLM:** Claude via the Anthropic API, using the official `@anthropic-ai/sdk` TypeScript SDK server-side only. Model ID comes from an env var (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`; `claude-opus-5-5` is the step-up option) so it can be changed without code changes. Never expose `ANTHROPIC_API_KEY` in the browser. Support a deterministic demo fallback for the curated prompts if no key is configured.
  - Use structured outputs (`output_config.format` / `messages.parse` with Zod schemas) for orchestration decisions and UI specs, and `strict: true` on capability tools. Forced `tool_choice` (`any`/`tool`) is not supported on current models; use `auto` and instruct via the system prompt.
  - Set `output_config.effort` explicitly (start at `low`; raise only if measured quality requires it). Do not send `temperature`/`top_p`/`top_k`.
  - Check `stop_reason` before reading content (handle `refusal` and `max_tokens`), and enable server-side refusal fallbacks (`fallbacks: "default"`).
  - Use prompt caching for the stable system prompt and capability/tool definitions.
  - Set a monthly spend limit in the Anthropic Console in addition to app-level rate limits.
- **Validation:** Zod schemas for service inputs, outputs, orchestration decisions, and UI specs.
- **Testing:** Vitest for unit/integration tests, Playwright for end-to-end scenarios.
- **Deployment:** Vercel (Hobby tier) deploying from a public GitHub repository; the project is an open-source concept demo. The main site stays on SiteGround, which manages DNS: add a `playground` CNAME record pointing to Vercel. Develop and test locally first; Vercel is only the deployment target. Because Vercel's filesystem is read-only, generate the seeded dataset at build time and ship it read-only (or generate it in memory from the seed). Keep session state on the client and use a shared store (e.g. Upstash Redis) for rate limiting. Avoid Vercel-specific APIs where practical so the app can move to another host later.

Do not introduce a heavyweight multi-agent framework unless a concrete need emerges. One orchestrator with typed capabilities is enough for the first version.

## 7. Capability registry and service contracts

Implement an explicit registry of named capabilities, including:
- `id`, `description`, `organization`, `inputSchema`, `outputSchema`
- required permissions, disclosure rules, allowed data scope
- handler function and human-readable explanation

Example capability:

```ts
interface Capability<I, O> {
  id: string;
  organizationId: string;
  description: string;
  inputSchema: unknown;
  outputSchema: unknown;
  requiredPermission: string;
  execute(input: I, context: AuthorizedContext): Promise<O>;
}
```

Example requests should use validated parameters such as `dateFrom`, `dateTo`, `groupBy`, and `metric`. Do not allow the model to pass arbitrary SQL, table names, filesystem paths, or external URLs.

Service outputs should carry `data`, `metricDefinitions`, `timeRange`, `provenance`, and optional `warnings` such as suppressed small groups.

### Roles and policies

Each organization defines demo roles. The visitor picks a role with a **“View as”** switch in the workspace; changing role keeps the conversation but re-runs the current experience under the new role's policies. Roles are enforced in backend policy checks exactly like real permissions (the frontend only displays them). Roles are a demonstration of policy enforcement, not authentication: the real security boundaries remain tenant isolation and read-only access.

| Organization | Role | Allowed | Denied / restricted |
|---|---|---|---|
| Northstar | Line Supervisor | Output, defects and downtime for one assigned factory | Other factories; purchase order values |
| Northstar | Operations Director | All factories, inventory, purchase orders | — |
| Orbit | CEO | Everything: MRR, churned revenue, churn, named accounts, usage, support | — |
| Orbit | Head of Operations | Usage, support, churn, named at-risk accounts | **Revenue is redacted** (shown as a dash, never as zero); revenue services are denied |
| Orbit | Junior Software Developer | Product usage and support tickets | Revenue, churn and named customer accounts (denied) |
| Grove | HR Business Partner | Every department aggregate, including leave and engagement | Individual employee records (unavailable to every profile) |
| Grove | Executive | Company-wide headcount, hiring, training and engagement | Leave data (denied); individual records |
| Grove | Hiring Manager (Engineering) | Headcount, hiring and training for Engineering only (unspecific requests are narrowed; other departments are blocked) | Leave and engagement (denied); other departments; individual records |

**Disclosure control (Grove).** No figure may describe fewer than five people, enforced in the services. A breakdown never publishes a small group on its own, and never merely hides one row (a hidden row could be recovered by subtracting the visible rows from the published total). Instead every small group is **combined with the next-smallest into an "Other (small groups)" row**, so the total stays exact and no single figure describes a small group. Group size means *distinct people*, not accumulated counts: a department of four who answer a survey every quarter is still four people, however many responses accumulate. A single small group asked for directly is withheld, with every figure null (a dash on screen). Periods that cannot be merged are withheld. Individual employee records do not exist anywhere in the data store, so no profile can reach them and any attempt to name such a capability is denied.

Policy has three outcomes, not two: a request can be **allowed**, **denied** outright, or allowed with **redaction or suppression** (a field the role may not see is withheld, or a group too small to report is hidden). Withholding is recorded as a policy event, shown to the visitor as a scope notice, and rendered honestly (a dash, never a zero). Orbit demonstrates redaction (the Head of Operations sees churn but not the revenue lost); Grove demonstrates suppression (see below).

Every capability declares its required permission and data scope; policy checks narrow queries (e.g. to one factory or department) as well as allow/deny. Denials and narrowing appear in the inspector. Canonical tests must include at least one denied and one narrowed request per organization.

## 8. Orchestration lifecycle

1. Parse intent in the context of the selected company and recent conversation.
2. Determine whether the request is supported, ambiguous, or prohibited.
3. If ambiguity materially affects the result, ask a concise clarification; otherwise apply transparent defaults.
4. Select one or more registered capabilities with validated arguments.
5. Enforce permissions before each call; reject unauthorized or unknown capabilities.
6. Execute services with timeouts and bounded result sizes.
7. Compose a declarative UI specification referencing **only returned data**.
8. Validate the UI specification; reject unknown components and malformed bindings.
9. Return the experience and a sanitized execution trace.
10. Preserve sufficient session context for follow-up intents and refinements.

Use bounded tool calls and one retry for schema correction. If the model fails, show a meaningful error or fall back to a curated supported example; do not silently fabricate success.

## 9. Declarative UI renderer

Create a small, safe, extensible component registry. MVP components:
- `PageHeading`, `Narrative`, `KpiCard`, `LineChart`, `BarChart`, `DonutChart`
- `DataTable`, `FilterBar`, `Comparison`, `Notice`, `EmptyState`

The model should return a typed JSON document, for example:

```json
{
  "version": "1",
  "title": "Revenue overview",
  "components": [
    {
      "type": "KpiCard",
      "id": "mrr-total",
      "title": "Current MRR",
      "dataRef": "results.mrr.summary.currentMrr",
      "format": "currencyEUR"
    },
    {
      "type": "LineChart",
      "id": "mrr-trend",
      "title": "MRR trend",
      "dataRef": "results.mrr.series",
      "xField": "month",
      "yField": "mrr"
    }
  ]
}
```

`dataRef` is resolved against a server-approved result envelope, never evaluated as arbitrary code. Unknown references fail validation. Escape user text and model-produced labels. Limit chart series, table rows and component counts.

**Narrative text and numbers:** `Narrative` text must not contain free-typed figures. The model writes text with typed slots that resolve against the result envelope (e.g. `"Defect rate rose by {{results.defects.delta|percent}}"`). The validator rejects any narrative containing a digit-bearing number outside a slot, and any slot whose reference does not resolve. Every displayed figure therefore comes from a service result.

**Interaction:** Filters must trigger typed service re-execution or safe client-side filtering of already authorized results. Follow-up prompts should update the composition and data; no fake clickable controls.

## 9a. Deliverables and actions

A view is not the end of a task. The playground can also **produce** things, so it behaves like an application and not a report viewer. Three deliverables exist, each available from a one-click button on any view (no model) and from free text ("make a branded pptx with this text…", "email this to the leadership team"):

| Kind | What it is | Real or simulated |
|---|---|---|
| `pdf` | Branded A4 report with vector charts and tables | Real downloadable file, previewed inline |
| `pptx` | Branded 16:9 deck with native, editable PowerPoint charts | Real downloadable file, previewed as slide cards |
| `email` | Draft in a simulated mail window with the charts embedded as images | **Simulated.** Nothing is ever sent |

Rules, matching the rest of the architecture:
- **Declarative and validated.** The model (or the one-click path) produces a *document spec* of blocks (heading, paragraph, bullets, kpi, chart, table). Data comes only from bound references, and numbers in text only from `{{slots}}`, exactly as for views. The one exception is wording the visitor typed themselves, which may be reproduced verbatim. The model never writes files.
- **Actions are capabilities.** Each action (`<org>.action.export_pdf`, `build_deck`, `draft_email`) has a required permission, is authorized by the backend before anything is generated, and appears in the inspector as a recorded event. Example policy: a Line Supervisor may export PDFs but may not build decks or draft email; an Operations Director may do all three.
- **Documents cannot disagree with the screen.** One-click exports re-run the plan under the caller's role and re-validate the view, so a document only ever contains data that role may see.
- **No external writes.** Email is a simulation, and the demo never contacts a mail service. Branding is configuration, not code, so the same generators serve every company.
- A deliverable that needs no data (for example a deck from supplied placeholder text) plans zero service calls.
- **Actions are not a toolbar.** PAA's point is that nothing is a fixed feature: the visitor states an intent. So the demo does not show permanent buttons for these actions. They live behind a **Help** button whose panel has two tabs: *Take it further* (actions on the current view, and things to simply ask) and *About* (who the company is, what data exists and over what period, what skills are available, and each role's permissions). The About content is generated from the real dataset, capability and role configuration, so it cannot drift from what actually works. In a company's own implementation such actions could become ordinary per-user features; the demo hides them to keep the ad-hoc nature visible.

## 10. Inspector: “Show how PAA built this”

The inspector is a core teaching tool. Display:
1. **Intent:** interpreted user goal and any assumptions.
2. **Decisions:** selected capability IDs and why they were relevant.
3. **Policies:** permissions checked, allowed/denied status, redactions or aggregation thresholds.
4. **Execution:** service names, sanitized parameters, duration, result summaries and provenance.
5. **Experience:** the validated UI component tree and bindings.
6. **Architecture:** a compact visual distinction between ephemeral experience and persistent substrate.

Keep two kinds of content visibly separate in the inspector: **recorded events** (capability calls, policy checks, timings, provenance, validated UI tree), shown as fact; and the **model's stated rationale** for why a capability was chosen, labelled as such. Never present the rationale as if it were a logged event.

The inspector must reflect **actual execution events**, not a model-generated fictional chain of thought. Show concise decision summaries, never hidden reasoning, secrets, raw prompts containing credentials, or sensitive server logs.

## 11. Themes and branding

Each fictional company should have a distinct visual theme (colors, typography accents, logo treatment) but use the same renderer and capability architecture. Theme selection is data/configuration, not separate UI codebases.

**Optional later feature:** derive a theme from a visitor-supplied public website. This is out of MVP scope. If implemented, perform controlled server-side retrieval with SSRF protection, limits, sanitization, and user confirmation; never inject fetched CSS or scripts.

## 12. Safety, security and cost controls

- Read-only public demo; no external writes, real email, real HR actions or payments.
- Server-side API key storage; no keys in source control or client bundles.
- Rate limiting by session/IP where appropriate, request size limits, bounded model tokens and service results.
- Validate all model outputs and capability inputs with schemas.
- Backend authorization for every service invocation, even if the frontend hides a capability.
- Prevent cross-organization data leakage through scoped queries and tests.
- Sanitize trace output; avoid exposing internal environment variables or raw stack traces.
- Treat prompts and returned text as untrusted input; do not let prompt injection redefine policies or capability schemas.
- Accessible keyboard navigation, contrast, reduced-motion support, mobile-friendly layout.
- Explain clearly that all companies and data are fictional.

## 13. Proposed code structure

PAA is the first project in a multi-project **playground**: one GitHub repository (`playground`), one Next.js app and one Vercel project, served at `playground.stevenboylan.com`. Each project lives under its own path (`/paa`, later `/project-two`, …), and the root page lists all projects.

Rules that keep projects separable:
- Project folders never import from each other; anything shared lives in `shared/` folders.
- Each project's API routes stay under its own path (`/api/paa/...`).
- Project-specific environment variables are prefixed with the project name (e.g. `PAA_...`); shared ones (e.g. `ANTHROPIC_API_KEY`) are not.
- A project that later needs a different framework or very different dependencies can be split into its own app and still be served under the same domain.

```text
docs/
  paa-spec.md                  ← this specification
src/
  app/
    page.tsx                   ← playground landing page listing all projects
    layout.tsx                 ← shared shell
    paa/
      page.tsx
    api/paa/
      session/route.ts
      intent/route.ts
  components/shared/           ← header, layout, common UI
  lib/shared/                  ← rate limiting, Claude client, observability
  components/paa/
    Workspace.tsx
    IntentComposer.tsx
    DynamicRenderer.tsx
    ArchitectureInspector.tsx
    ui-registry/
  lib/paa/
    orchestration/
      orchestrator.ts
      model-adapter.ts
      ui-composer.ts
    capabilities/
      registry.ts
      northstar.ts
      orbit.ts
      grove.ts
    policies/
      authorize.ts
      disclosure.ts
    schemas/
      capability.ts
      experience.ts
      trace.ts
    data/
      seed.ts
      metrics.ts
    session/
      store.ts
    observability/
      trace.ts
  tests/
    unit/
    integration/
    e2e/
```

The orchestrator's model adapter should build on the shared Claude client in `lib/shared/` rather than creating its own. Adapt the structure to the existing repository rather than imposing duplicate frameworks.

## 14. MVP implementation phases

### Phase 0 — Repository and environment audit
- Inspect repository, package manager, framework, deployment target, and existing design system.
- Record assumptions and unresolved infrastructure decisions.
- Present a short plan before major changes.

### Phase 1 — Trusted substrate
- Define organization configs, schemas, policy engine and capability registry.
- Build deterministic synthetic datasets and service-level metrics.
- Add tests for formulas, permissions, organization isolation and small-cohort suppression.

### Phase 2 — Adaptive UI
- Build component registry, schema validator, result bindings and responsive renderer.
- Implement a curated non-LLM path to demonstrate the renderer with real service data.

### Phase 3 — AI orchestration
- Add model adapter, intent interpretation, typed capability selection, UI composition and follow-up context.
- Add failure handling, bounded calls, logging and cost limits.

### Phase 4 — Inspector and presentation
- Build the execution trace and architecture inspector.
- Add distinct company themes, suggested prompts and explanatory copy.

### Phase 5 — Quality and deployment
- Test six canonical journeys, forbidden operations, mobile and accessibility.
- Confirm hosting, domain routing, persistent database, environment secrets and observability.
- Deploy staging first; production only after verification.

## 15. Canonical end-to-end tests

1. Northstar: production by factory → follow up to isolate lowest-performing line.
2. Northstar: downtime trend → compare periods and top causes.
3. Orbit: MRR trend → compare plans and identify churn contributors.
4. Orbit: support load → segment by adoption.
5. Grove: headcount trend → drill down to department aggregates.
6. Grove: hiring funnel → identify stage with largest drop-off.

For every test, verify that the underlying service returns the displayed values, the inspector shows actual calls, and follow-up context works. Also test an unsupported intent, an attempted unauthorized action, malformed UI JSON, model timeout, and cross-tenant access attempt.

## 16. Non-goals for MVP

- Real enterprise integrations, account provisioning, user-uploaded datasets.
- Autonomous background tasks or agent-to-agent delegation.
- Arbitrary application/code generation.
- Production-grade HR decision automation.
- Visitor-defined workflows that write to external systems.
- Website-based automatic branding and custom themes.
- A full workflow builder or plugin marketplace.

These can be explored later without compromising the core architecture.

## 17. Decisions requiring confirmation

Claude Code should surface these rather than silently assume:
- ~~Actual hosting and repository framework.~~ Decided: Next.js on Vercel Hobby, public GitHub repo, local-first development (see §6).
- ~~Confirmed domain/subdomain.~~ Decided: `playground.stevenboylan.com/paa`, via a CNAME record in SiteGround's DNS.
- ~~Model provider.~~ Decided: Claude via the Anthropic API (see §6). Default model is Sonnet 5.5; re-test the canonical journeys on Opus 5.5 and Haiku 5.5 before launch. Still open: the monthly budget ceiling.
- ~~Roles.~~ Decided: per-organization demo roles with a “View as” switch (see §7, Roles and policies).
- Whether demo visitors can share session URLs.
- Desired degree of write-action simulation (MVP defaults to read-only).
- Final public company names and visual identities.

## 18. Instructions for Claude Code

You are implementing this specification in the currently open VS Code workspace.

1. **Inspect first.** Read repository files and conventions; do not overwrite an existing project blindly.
2. **Produce a concise implementation plan** with architecture, files to create/change, dependencies, risks, and explicit questions that block implementation.
3. **Build in vertical slices.** Start with one complete Northstar flow (intent → authorized capability → computed data → validated UI → inspector), then generalize to Orbit and Grove.
4. **Keep trust boundaries real.** The model cannot compute authoritative metrics, execute SQL, create executable frontend code, or override backend policies.
5. **Use typed contracts and tests.** Validate service calls and UI JSON at runtime; unit-test metrics and policy enforcement.
6. **Avoid unnecessary complexity.** No premature microservices, multi-agent framework, or third-party workflow engine.
7. **Run checks.** After each phase, run available lint, typecheck and tests; report results and unresolved failures.
8. **Document operations.** Provide `.env.example`, seed instructions, local run commands, deployment notes, and a README describing the PAA principles.
9. **Do not claim completion without verification.** List implemented functionality, tests executed, known limitations and next steps.
10. **Ask before destructive changes or production deployment.**

**First action:** Inspect the repository and respond with a proposed implementation plan. If the workspace is empty, scaffold the recommended stack and deliver the first working Northstar vertical slice before expanding the full demo.
