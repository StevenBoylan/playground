import { monthLabel } from "../dates";
import { REFERENCE_DATE } from "../data/seed";
import type { CuratedPrompt } from "./curated";
import { lastMonths, lastQuarter } from "./windows";

const six = () => lastMonths(REFERENCE_DATE, 6);
const three = () => lastMonths(REFERENCE_DATE, 3);
const twelve = () => lastMonths(REFERENCE_DATE, 12);
const span = (r: { from: string; to: string }) => `${monthLabel(r.from.slice(0, 7))} to ${monthLabel(r.to.slice(0, 7))}`;

const PLAN_OPTIONS = [
  { value: "", label: "All plans" },
  { value: "starter", label: "Starter" },
  { value: "growth", label: "Growth" },
  { value: "scale", label: "Scale" },
  { value: "enterprise", label: "Enterprise" },
];
const SEGMENT_OPTIONS = [
  { value: "", label: "All segments" },
  { value: "smb", label: "SMB" },
  { value: "mid-market", label: "Mid-market" },
  { value: "enterprise", label: "Enterprise" },
];

/**
 * Orbit's suggested requests. They are the same for every profile on purpose: what changes is what each
 * profile is allowed to see, which is the point of the demo.
 */
export const orbitPrompts: CuratedPrompt[] = [
  {
    id: "mrr-growth",
    organizationId: "orbit",
    text: "Show MRR growth over the last six months.",
    title: "MRR growth",
    assumptions: ['"The last six months" means whole calendar months up to the reference month.'],
    subtitle: () => span(six()),
    plan: () => [
      {
        key: "mrr",
        capabilityId: "orbit.mrr_trend",
        input: { dateFrom: six().from, dateTo: REFERENCE_DATE, granularity: "month" },
        rationale: "Rebuilds monthly recurring revenue and splits movement into new, expansion and churned MRR.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "MRR reached {{results.mrr.summary.currentMrr|currency}}, a change of {{results.mrr.summary.growthPct|percent}} over the period, which is an annual run rate of {{results.mrr.summary.annualRunRate|currency}}.",
      },
      {
        type: "FilterBar",
        id: "filters",
        filters: [
          { param: "planId", label: "Plan", callKey: "mrr", options: PLAN_OPTIONS },
          { param: "segment", label: "Segment", callKey: "mrr", options: SEGMENT_OPTIONS },
        ],
      },
      { type: "KpiCard", id: "kpi-mrr", title: "Current MRR", dataRef: "results.mrr.summary.currentMrr", format: "currency" },
      { type: "KpiCard", id: "kpi-customers", title: "Active customers", dataRef: "results.mrr.summary.activeCustomers", format: "integer" },
      { type: "LineChart", id: "mrr-line", title: "MRR by month", dataRef: "results.mrr.rows", xField: "label", yField: "mrr", format: "currency" },
      { type: "BarChart", id: "net-new", title: "Net new MRR by month", dataRef: "results.mrr.rows", xField: "label", yField: "netNewMrr", format: "currency" },
      {
        type: "DataTable",
        id: "mrr-table",
        title: "Month by month",
        dataRef: "results.mrr.rows",
        columns: [
          { field: "label", label: "Month" },
          { field: "mrr", label: "MRR", format: "currency" },
          { field: "newMrr", label: "New", format: "currency" },
          { field: "expansionMrr", label: "Expansion", format: "currency" },
          { field: "churnedMrr", label: "Churned", format: "currency" },
          { field: "activeCustomers", label: "Customers", format: "integer" },
        ],
      },
    ],
  },
  {
    id: "churn-by-plan",
    organizationId: "orbit",
    text: "Compare churn across subscription plans.",
    title: "Churn by plan",
    assumptions: ["Compared over the most recent complete quarter, as an average monthly rate, so plans of different sizes are comparable."],
    subtitle: () => span(lastQuarter(REFERENCE_DATE)),
    plan: () => [
      {
        key: "churn",
        capabilityId: "orbit.churn",
        input: { dateFrom: lastQuarter(REFERENCE_DATE).from, dateTo: lastQuarter(REFERENCE_DATE).to, groupBy: "plan" },
        rationale: "Average monthly churn for each plan over the window.",
      },
      {
        key: "reasons",
        capabilityId: "orbit.churn",
        input: { dateFrom: lastQuarter(REFERENCE_DATE).from, dateTo: lastQuarter(REFERENCE_DATE).to, groupBy: "reason" },
        rationale: "The recorded reasons customers gave for leaving.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.churn.summary.highestLabel|text}} has the highest monthly churn at {{results.churn.summary.highestRate|percent}}, against {{results.churn.summary.churnRate|percent}} across all plans.",
      },
      { type: "KpiCard", id: "kpi-churned", title: "Customers lost", dataRef: "results.churn.summary.churnedCustomers", format: "integer" },
      { type: "KpiCard", id: "kpi-rate", title: "Average monthly churn", dataRef: "results.churn.summary.churnRate", format: "percent" },
      { type: "BarChart", id: "churn-by-plan", title: "Monthly churn rate by plan", dataRef: "results.churn.rows", xField: "label", yField: "churnRate", format: "percent" },
      { type: "DonutChart", id: "reasons", title: "Why customers left", dataRef: "results.reasons.rows", nameField: "label", valueField: "churnedCustomers", format: "integer" },
      {
        type: "DataTable",
        id: "churn-table",
        title: "Plan detail",
        dataRef: "results.churn.rows",
        columns: [
          { field: "label", label: "Plan" },
          { field: "churnedCustomers", label: "Customers lost", format: "integer" },
          { field: "churnRate", label: "Monthly churn", format: "percent" },
          { field: "churnedMrr", label: "Revenue lost", format: "currency" },
        ],
      },
    ],
  },
  {
    id: "segment-support-adoption",
    organizationId: "orbit",
    text: "Which customer segments have high support volume and low adoption?",
    title: "Support load against adoption",
    assumptions: ["Compared over the most recent complete quarter. Groups with fewer than five customers are hidden."],
    subtitle: () => span(lastQuarter(REFERENCE_DATE)),
    plan: () => [
      {
        key: "health",
        capabilityId: "orbit.segment_health",
        input: { dateFrom: lastQuarter(REFERENCE_DATE).from, dateTo: lastQuarter(REFERENCE_DATE).to },
        rationale: "Puts tickets per customer next to feature adoption for every segment and plan.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.health.summary.highestSupportLabel|text}} raises the most tickets per customer at {{results.health.summary.highestSupportRate|number}} a month, while {{results.health.summary.lowestAdoptionLabel|text}} has the lowest feature adoption at {{results.health.summary.lowestAdoptionRate|percent}}.",
      },
      { type: "BarChart", id: "tickets", title: "Support tickets per customer per month", dataRef: "results.health.rows", xField: "label", yField: "ticketsPerCustomer", format: "number" },
      { type: "BarChart", id: "adoption", title: "Feature adoption", dataRef: "results.health.rows", xField: "label", yField: "adoptionRate", format: "percent" },
      {
        type: "DataTable",
        id: "health-table",
        title: "Segment detail",
        dataRef: "results.health.rows",
        columns: [
          { field: "label", label: "Segment and plan" },
          { field: "customers", label: "Customers", format: "integer" },
          { field: "ticketsPerCustomer", label: "Tickets per customer", format: "number" },
          { field: "adoptionRate", label: "Adoption", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "bugs-by-feature",
    organizationId: "orbit",
    text: "Where are the bugs? Show bug tickets by feature for the last three months.",
    title: "Bug tickets by feature",
    assumptions: ["Only tickets categorised as bugs are counted. The trend covers the last twelve months."],
    subtitle: () => span(three()),
    plan: () => [
      {
        key: "bugs",
        capabilityId: "orbit.support_load",
        input: { dateFrom: three().from, dateTo: REFERENCE_DATE, groupBy: "feature", category: "bug" },
        rationale: "Counts bug tickets for each product feature over the last three months.",
      },
      {
        key: "trend",
        capabilityId: "orbit.support_load",
        input: { dateFrom: twelve().from, dateTo: REFERENCE_DATE, groupBy: "month", category: "bug" },
        rationale: "Shows whether bug volume has changed over the last twelve months.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.bugs.summary.topLabel|text}} accounts for the most bug tickets, {{results.bugs.summary.topTickets|integer}} of {{results.bugs.summary.totalTickets|integer}} in the period.",
      },
      { type: "BarChart", id: "bugs-by-feature", title: "Bug tickets by feature", dataRef: "results.bugs.rows", xField: "label", yField: "tickets", format: "integer" },
      { type: "LineChart", id: "bug-trend", title: "Bug tickets by month", dataRef: "results.trend.rows", xField: "label", yField: "tickets", format: "integer" },
      {
        type: "DataTable",
        id: "bug-table",
        title: "Feature detail",
        dataRef: "results.bugs.rows",
        columns: [
          { field: "label", label: "Feature" },
          { field: "tickets", label: "Bug tickets", format: "integer" },
          { field: "avgResolutionHours", label: "Avg hours to resolve", format: "number" },
        ],
      },
    ],
  },
  {
    id: "accounts-at-risk",
    organizationId: "orbit",
    text: "Which customer accounts are most at risk of leaving?",
    title: "Accounts at risk",
    assumptions: ["Risk is scored from low feature usage, tickets in the last 90 days, and the Growth plan price change."],
    subtitle: () => monthLabel(REFERENCE_DATE.slice(0, 7)),
    plan: () => [
      {
        key: "risk",
        capabilityId: "orbit.accounts_at_risk",
        input: { asOf: REFERENCE_DATE, limit: 8 },
        rationale: "Scores each current customer and lists the riskiest.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template: "{{results.risk.summary.topName|text}} is the account most at risk, with a risk score of {{results.risk.summary.topRisk|percent}}.",
      },
      { type: "KpiCard", id: "kpi-listed", title: "Accounts listed", dataRef: "results.risk.summary.listed", format: "integer" },
      { type: "KpiCard", id: "kpi-mrr", title: "Revenue at risk", dataRef: "results.risk.summary.listedMrr", format: "currency" },
      {
        type: "DataTable",
        id: "risk-table",
        title: "Riskiest accounts",
        dataRef: "results.risk.rows",
        columns: [
          { field: "name", label: "Account" },
          { field: "plan", label: "Plan" },
          { field: "mrr", label: "MRR", format: "currency" },
          { field: "featuresUsed", label: "Features used", format: "integer" },
          { field: "tickets90Days", label: "Tickets (90 days)", format: "integer" },
          { field: "riskScore", label: "Risk", format: "percent" },
        ],
      },
    ],
  },
];
