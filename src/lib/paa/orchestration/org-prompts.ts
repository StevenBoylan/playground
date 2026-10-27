import { FEATURES, PLANS, SEGMENTS } from "../data/orbit-seed";
import { DOWNTIME_CAUSES, getNorthstarDataset } from "../data/seed";

export interface OrgPrompt {
  /** What the model needs to know about the company: ids, names and units. */
  facts: string;
  /** Patterns in the data, and a reminder not to invent causes. */
  dataNotes: string;
  /** What a FilterBar may change for this company's capabilities. */
  filters: string;
  /** A short, valid example reply. */
  example: string;
}

function northstar(): OrgPrompt {
  const ds = getNorthstarDataset();
  return {
    facts: `Factories: ${ds.factories.map((f) => `${f.id} (${f.name})`).join(", ")}.
Lines: ${ds.lines.map((l) => `${l.id} (${l.name})`).join(", ")}.
Downtime causes: ${DOWNTIME_CAUSES.join(", ")}.
Rates (defect rate, change in rate, change percentage) are fractions: 0.012 means 1.2%. Use the "percent" format for them.`,
    dataNotes: `Data has a seasonal pattern (quieter summers and December, plants closed from Christmas Eve to New Year's Day), a steady improvement in quality and growth in volume over the years, plus a few one-off incidents; do not assert causes you were not given, only report what the services return.`,
    filters: `param is "factoryId" (options: "" for all factories, then dublin, gdansk, monterrey) or "granularity" (options: week, month, quarter).`,
    example: `{"status":"ok","intent":"Show how Gdansk Line 2's defect rate changed week by week.","assumptions":["Used the last quarter."],"calls":[{"key":"trend","capabilityId":"northstar.defect_trend","rationale":"Defect rate over time for one line.","input":{"dateFrom":"2026-07-01","dateTo":"2026-09-30","granularity":"week","lineId":"gdansk-2"}}],"experience":{"title":"Gdansk Line 2 quality","components":[{"type":"PageHeading","id":"heading","text":"Gdansk Line 2 quality","subtitle":"Weekly defect rate"},{"type":"Narrative","id":"summary","template":"The defect rate moved from {{results.trend.summary.firstPeriodRate|percent}} to {{results.trend.summary.lastPeriodRate|percent}}."},{"type":"LineChart","id":"rate-line","title":"Defect rate by week","dataRef":"results.trend.rows","xField":"label","yField":"defectRate","format":"percent"}]}}`,
  };
}

function orbit(): OrgPrompt {
  return {
    facts: `Plans: ${PLANS.map((p) => `${p.id} (${p.name}, about €${p.price} a month)`).join(", ")}. Enterprise launched in January 2023.
Segments: ${SEGMENTS.map((s) => `${s.id} (${s.name})`).join(", ")}.
Product features: ${FEATURES.map((f) => `${f.id} (${f.name}${f.launch > "2022-10" ? `, from ${f.launch}` : ""})`).join(", ")}.
Support ticket categories: how-to, bug, billing, feature-request, outage.
Customers and accounts mean the same thing. Orbit's data is monthly, so a date range selects whole months.
Money is in euros: use the "currency" format for MRR and any revenue figure. Rates are fractions: 0.012 means 1.2%; use "percent".
Some fields (revenue) come back as null for roles that may not see them. Never treat null as zero, and when the answer does not need revenue, prefer counts and rates so the view still works for every role.`,
    dataNotes: `Data shows steady customer growth, plan upgrades, higher churn in January, an Enterprise plan from January 2023, and a few one-off incidents; do not assert causes you were not given, only report what the services return (a recorded churn reason such as "Price" is data and may be reported).`,
    filters: `param is "granularity" (options: month, quarter), "planId" (options: "" for all plans, then starter, growth, scale, enterprise) or "segment" (options: "" for all segments, then smb, mid-market, enterprise).`,
    example: `{"status":"ok","intent":"Show MRR growth over the last six months.","assumptions":["Six months means April to September 2026."],"calls":[{"key":"mrr","capabilityId":"orbit.mrr_trend","rationale":"Month-by-month revenue with new, expansion and churned MRR.","input":{"dateFrom":"2026-04-01","dateTo":"2026-09-30","granularity":"month"}}],"experience":{"title":"MRR growth","components":[{"type":"PageHeading","id":"heading","text":"MRR growth","subtitle":"Last six months"},{"type":"Narrative","id":"summary","template":"MRR reached {{results.mrr.summary.currentMrr|currency}}, a change of {{results.mrr.summary.growthPct|percent}} over the period."},{"type":"LineChart","id":"mrr-line","title":"MRR by month","dataRef":"results.mrr.rows","xField":"label","yField":"mrr","format":"currency"}]}}`,
  };
}

export function orgPrompt(organizationId: string): OrgPrompt {
  return organizationId === "orbit" ? orbit() : northstar();
}
