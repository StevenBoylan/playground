import { monthLabel } from "../dates";
import { DATA_START, REFERENCE_DATE } from "../data/seed";
import type { CuratedPrompt } from "./curated";
import { lastQuarter, lastYears, yearToDate } from "./windows";

const span = (r: { from: string; to: string }) => `${monthLabel(r.from.slice(0, 7))} to ${monthLabel(r.to.slice(0, 7))}`;
const year = () => lastYears(REFERENCE_DATE, 1);

const DEPARTMENT_OPTIONS = [
  { value: "", label: "All departments" },
  { value: "engineering", label: "Engineering" },
  { value: "product", label: "Product" },
  { value: "sales", label: "Sales" },
  { value: "customer-success", label: "Customer Success" },
  { value: "operations", label: "Operations" },
  { value: "finance", label: "Finance" },
  { value: "marketing", label: "Marketing" },
  { value: "people", label: "People" },
];

/**
 * Grove's suggested requests. Every one is an aggregate, and a few show the privacy rules at work: Legal, with four
 * people, is always folded into "Other", and leave and engagement are refused to profiles that may not see them.
 */
export const grovePrompts: CuratedPrompt[] = [
  {
    id: "headcount-changes",
    organizationId: "grove",
    text: "Show headcount changes by department this year.",
    title: "Headcount changes by department",
    assumptions: ['"This year" runs from the first of January to the dataset reference date. Departments with fewer than five people are combined into "Other".'],
    subtitle: () => span(yearToDate(REFERENCE_DATE)),
    plan: () => [
      {
        key: "change",
        capabilityId: "grove.headcount_change",
        input: { dateFrom: yearToDate(REFERENCE_DATE).from, dateTo: REFERENCE_DATE, groupBy: "department" },
        rationale: "Compares headcount at the start and end of the year for each department.",
      },
      {
        key: "trend",
        capabilityId: "grove.headcount_trend",
        input: { dateFrom: yearToDate(REFERENCE_DATE).from, dateTo: REFERENCE_DATE, granularity: "month" },
        rationale: "Month-by-month headcount, hires and leavers for the whole company.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "Headcount moved from {{results.change.summary.totalStart|integer}} to {{results.change.summary.totalEnd|integer}} this year, a change of {{results.change.summary.totalChangePct|percent}}. {{results.change.summary.largestGrowthLabel|text}} grew the most, and annualised attrition is {{results.trend.summary.attritionRate|percent}}.",
      },
      { type: "KpiCard", id: "kpi-now", title: "Headcount today", dataRef: "results.trend.summary.currentHeadcount", format: "integer" },
      { type: "KpiCard", id: "kpi-change", title: "Net change this year", dataRef: "results.change.summary.totalChange", format: "integer" },
      { type: "KpiCard", id: "kpi-attrition", title: "Annualised attrition", dataRef: "results.trend.summary.attritionRate", format: "percent" },
      { type: "BarChart", id: "change-by-department", title: "Change in headcount by department", dataRef: "results.change.rows", xField: "label", yField: "change", format: "integer" },
      { type: "LineChart", id: "headcount-by-month", title: "Headcount by month", dataRef: "results.trend.rows", xField: "label", yField: "headcount", format: "integer" },
      {
        type: "DataTable",
        id: "department-table",
        title: "Department detail",
        dataRef: "results.change.rows",
        columns: [
          { field: "label", label: "Department" },
          { field: "startHeadcount", label: "Start", format: "integer" },
          { field: "endHeadcount", label: "Now", format: "integer" },
          { field: "change", label: "Change", format: "integer" },
          { field: "hires", label: "Hires", format: "integer" },
          { field: "leavers", label: "Leavers", format: "integer" },
        ],
      },
    ],
  },
  {
    id: "hiring-dropout",
    organizationId: "grove",
    text: "Where are candidates dropping out of the hiring funnel?",
    title: "Hiring funnel",
    assumptions: ["Covers the last twelve months. Stages reached by fewer than five candidates are not reported."],
    subtitle: () => span(year()),
    plan: () => [
      {
        key: "funnel",
        capabilityId: "grove.hiring_funnel",
        input: { dateFrom: year().from, dateTo: REFERENCE_DATE },
        rationale: "Counts candidates at each stage and how many are lost between stages.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "The biggest loss is at {{results.funnel.summary.biggestDropLabel|text}}, where {{results.funnel.summary.biggestDropRate|percent}} of candidates fall away. Offers are accepted {{results.funnel.summary.offerAcceptanceRate|percent}} of the time, and a hire takes {{results.funnel.summary.avgDaysToHire|integer}} days on average.",
      },
      { type: "FilterBar", id: "filters", filters: [{ param: "department", label: "Department", callKey: "funnel", options: DEPARTMENT_OPTIONS }] },
      { type: "KpiCard", id: "kpi-applied", title: "Candidates applied", dataRef: "results.funnel.summary.applied", format: "integer" },
      { type: "KpiCard", id: "kpi-hired", title: "Hires", dataRef: "results.funnel.summary.hires", format: "integer" },
      { type: "BarChart", id: "funnel-bars", title: "Candidates at each stage", dataRef: "results.funnel.rows", xField: "label", yField: "candidates", format: "integer" },
      {
        type: "DataTable",
        id: "funnel-table",
        title: "Stage detail",
        dataRef: "results.funnel.rows",
        columns: [
          { field: "label", label: "Stage" },
          { field: "candidates", label: "Candidates", format: "integer" },
          { field: "conversionFromPrevious", label: "Converted", format: "percent" },
          { field: "dropOffFromPrevious", label: "Lost", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "training-completion",
    organizationId: "grove",
    text: "Compare training completion across departments.",
    title: "Mandatory training completion",
    assumptions: ["All four mandatory courses together, as at the end of the most recent quarter. Departments with fewer than five people are combined into \"Other\"."],
    subtitle: () => span(lastQuarter(REFERENCE_DATE)),
    plan: () => [
      {
        key: "training",
        capabilityId: "grove.training_completion",
        input: { asOf: REFERENCE_DATE, groupBy: "department" },
        rationale: "Completion of mandatory training for each department at quarter end.",
      },
      {
        key: "courses",
        capabilityId: "grove.training_completion",
        input: { asOf: REFERENCE_DATE, groupBy: "course" },
        rationale: "Completion by course, to see whether one course is the problem.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.training.summary.lowestLabel|text}} is furthest behind at {{results.training.summary.lowestRate|percent}}, against {{results.training.summary.overallRate|percent}} across the company.",
      },
      { type: "BarChart", id: "by-department", title: "Completion by department", dataRef: "results.training.rows", xField: "label", yField: "completionRate", format: "percent" },
      { type: "BarChart", id: "by-course", title: "Completion by course", dataRef: "results.courses.rows", xField: "label", yField: "completionRate", format: "percent" },
      {
        type: "DataTable",
        id: "training-table",
        title: "Department detail",
        dataRef: "results.training.rows",
        columns: [
          { field: "label", label: "Department" },
          { field: "enrolled", label: "Enrolments", format: "integer" },
          { field: "completed", label: "Completed", format: "integer" },
          { field: "completionRate", label: "Completion", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "engagement-drivers",
    organizationId: "grove",
    text: "How engaged are people, and what is driving it?",
    title: "Engagement",
    assumptions: ["Uses the most recent quarterly survey. Groups with fewer than five respondents are combined into \"Other\"."],
    subtitle: () => span(lastQuarter(REFERENCE_DATE)),
    plan: () => [
      {
        key: "teams",
        capabilityId: "grove.engagement",
        input: { dateFrom: lastQuarter(REFERENCE_DATE).from, dateTo: lastQuarter(REFERENCE_DATE).to, groupBy: "department" },
        rationale: "Engagement score and response rate for each department.",
      },
      {
        key: "themes",
        capabilityId: "grove.engagement",
        input: { dateFrom: lastQuarter(REFERENCE_DATE).from, dateTo: lastQuarter(REFERENCE_DATE).to, groupBy: "theme" },
        rationale: "Which themes score highest and lowest across the company.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "Overall engagement is {{results.teams.summary.overallScore|number}} out of one hundred, with a response rate of {{results.teams.summary.responseRate|percent}}. It is lowest in {{results.teams.summary.lowestLabel|text}} at {{results.teams.summary.lowestScore|number}}.",
      },
      { type: "BarChart", id: "score-by-department", title: "Engagement score by department", dataRef: "results.teams.rows", xField: "label", yField: "score", format: "number" },
      { type: "BarChart", id: "score-by-theme", title: "Score by theme", dataRef: "results.themes.rows", xField: "label", yField: "score", format: "number" },
      {
        type: "DataTable",
        id: "engagement-table",
        title: "Department detail",
        dataRef: "results.teams.rows",
        columns: [
          { field: "label", label: "Department" },
          { field: "score", label: "Score", format: "number" },
          { field: "responses", label: "Responses", format: "integer" },
          { field: "responseRate", label: "Response rate", format: "percent" },
        ],
      },
    ],
  },
  {
    id: "leave-overview",
    organizationId: "grove",
    text: "How much leave is being taken, and of what kind?",
    title: "Leave",
    assumptions: ["Covers the last twelve months, as aggregates. Periods or groups with fewer than five people are combined or withheld."],
    subtitle: () => span(year()),
    plan: () => [
      {
        key: "types",
        capabilityId: "grove.leave_summary",
        input: { dateFrom: year().from, dateTo: REFERENCE_DATE, groupBy: "type" },
        rationale: "Days of leave for each kind of leave.",
      },
      {
        key: "months",
        capabilityId: "grove.leave_summary",
        input: { dateFrom: year().from, dateTo: REFERENCE_DATE, groupBy: "month" },
        rationale: "Leave over time, to see seasonal patterns.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "{{results.types.summary.totalDays|integer}} days of leave were taken, about {{results.types.summary.daysPerEmployee|number}} per person. {{results.types.summary.highestLabel|text}} is the largest category.",
      },
      { type: "BarChart", id: "by-type", title: "Days of leave by type", dataRef: "results.types.rows", xField: "label", yField: "leaveDays", format: "integer" },
      { type: "LineChart", id: "by-month", title: "Days of leave by month", dataRef: "results.months.rows", xField: "label", yField: "leaveDays", format: "integer" },
    ],
  },
  {
    id: "headcount-four-years",
    organizationId: "grove",
    text: "How have headcount and attrition changed over the four years?",
    title: "Headcount and attrition over four years",
    assumptions: ["Quarterly, across the whole four years of history."],
    subtitle: () => span({ from: DATA_START, to: REFERENCE_DATE }),
    plan: () => [
      {
        key: "trend",
        capabilityId: "grove.headcount_trend",
        input: { dateFrom: DATA_START, dateTo: REFERENCE_DATE, granularity: "quarter" },
        rationale: "Headcount, hires and leavers for each quarter across the whole history.",
      },
    ],
    compose: () => [
      {
        type: "Narrative",
        id: "summary",
        template:
          "Headcount moved from {{results.trend.summary.startHeadcount|integer}} to {{results.trend.summary.currentHeadcount|integer}} over the four years, with {{results.trend.summary.hires|integer}} hires and {{results.trend.summary.leavers|integer}} leavers.",
      },
      {
        type: "FilterBar",
        id: "filters",
        filters: [{ param: "department", label: "Department", callKey: "trend", options: DEPARTMENT_OPTIONS }],
      },
      { type: "KpiCard", id: "kpi-now", title: "Headcount today", dataRef: "results.trend.summary.currentHeadcount", format: "integer" },
      { type: "KpiCard", id: "kpi-attrition", title: "Annualised attrition", dataRef: "results.trend.summary.attritionRate", format: "percent" },
      { type: "LineChart", id: "headcount-line", title: "Headcount by quarter", dataRef: "results.trend.rows", xField: "label", yField: "headcount", format: "integer" },
      { type: "BarChart", id: "leavers-bars", title: "Leavers by quarter", dataRef: "results.trend.rows", xField: "label", yField: "leavers", format: "integer" },
    ],
  },
];
