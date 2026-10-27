import { DEPARTMENTS, LOCATIONS, getGroveDataset } from "./data/grove-seed";
import { FEATURES, PLANS, SEGMENTS, getOrbitDataset } from "./data/orbit-seed";
import { DATA_START, DATA_YEARS, DOWNTIME_CAUSES, REFERENCE_DATE, getNorthstarDataset } from "./data/seed";
import { getOrganization } from "./organizations";
import { MIN_COHORT } from "./policies/disclosure";
import { GROVE_PERMISSIONS, NORTHSTAR_PERMISSIONS, ORBIT_PERMISSIONS, type RoleDefinition } from "./policies/roles";

export interface AboutRole {
  id: string;
  label: string;
  description: string;
  scope: string;
  can: string[];
  cannot: string[];
  /** Plain-language notes about how the policy layer treats this role (redaction, suppression). */
  notes: string[];
}

export interface AboutInfo {
  overview: string;
  facts: { label: string; value: string }[];
  data: { range: string; granularities: string[]; datasets: { name: string; detail: string }[] };
  skills: { name: string; detail: string }[];
  roles: AboutRole[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const PRODUCT_PLURAL: Record<string, string> = {
  "drive-unit": "drive units",
  "control-board": "control boards",
  housing: "housing assemblies",
  "sensor-pack": "sensor packs",
};

function joinList(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

function longDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

const dataRange = () => `${longDate(DATA_START)} to ${longDate(REFERENCE_DATE)} (${DATA_YEARS} years). Treat ${longDate(REFERENCE_DATE)} as “today”.`;

/** What each permission means to a person. Only permissions that something in the demo actually uses are listed. */
type Labels = [string, string][];

const NORTHSTAR_LABELS: Labels = [
  [NORTHSTAR_PERMISSIONS.production, "View production output"],
  [NORTHSTAR_PERMISSIONS.defects, "View defect rates"],
  [NORTHSTAR_PERMISSIONS.downtime, "View downtime"],
  [NORTHSTAR_PERMISSIONS.exportPdf, "Create PDF reports"],
  [NORTHSTAR_PERMISSIONS.exportPptx, "Create slide decks"],
  [NORTHSTAR_PERMISSIONS.draftEmail, "Draft emails"],
  [NORTHSTAR_PERMISSIONS.applyBranding, "Apply company branding"],
];

const ORBIT_LABELS: Labels = [
  [ORBIT_PERMISSIONS.usage, "View product usage"],
  [ORBIT_PERMISSIONS.support, "View support tickets"],
  [ORBIT_PERMISSIONS.churn, "View customer churn"],
  [ORBIT_PERMISSIONS.accounts, "See named customer accounts"],
  [ORBIT_PERMISSIONS.revenue, "See revenue figures (MRR)"],
  [ORBIT_PERMISSIONS.exportPdf, "Create PDF reports"],
  [ORBIT_PERMISSIONS.exportPptx, "Create slide decks"],
  [ORBIT_PERMISSIONS.draftEmail, "Draft emails"],
  [ORBIT_PERMISSIONS.applyBranding, "Apply company branding"],
];

const GROVE_LABELS: Labels = [
  [GROVE_PERMISSIONS.headcount, "View headcount and attrition"],
  [GROVE_PERMISSIONS.hiring, "View the hiring funnel"],
  [GROVE_PERMISSIONS.training, "View training completion"],
  [GROVE_PERMISSIONS.leave, "View leave (aggregates)"],
  [GROVE_PERMISSIONS.engagement, "View engagement survey results"],
  [GROVE_PERMISSIONS.exportPdf, "Create PDF reports"],
  [GROVE_PERMISSIONS.exportPptx, "Create slide decks"],
  [GROVE_PERMISSIONS.draftEmail, "Draft emails"],
  [GROVE_PERMISSIONS.applyBranding, "Apply company branding"],
];

function describeRole(role: RoleDefinition, labels: Labels, scope: string, extraCannot: string[], notes: string[]): AboutRole {
  const held = new Set(role.permissions);
  return {
    id: role.id,
    label: role.label,
    description: role.description,
    scope,
    can: labels.filter(([p]) => held.has(p)).map(([, label]) => label),
    cannot: [...extraCannot, ...labels.filter(([p]) => !held.has(p)).map(([, label]) => label)],
    notes,
  };
}

function northstarAbout(): AboutInfo {
  const org = getOrganization("northstar")!;
  const ds = getNorthstarDataset();
  const plantNames = new Map(ds.factories.map((f) => [f.id, f.name]));
  return {
    overview: `${org.name} is a fictional industrial manufacturer. It makes ${joinList(ds.products.map((p) => PRODUCT_PLURAL[p.id] ?? p.name.toLowerCase()))} across ${ds.factories.length} plants. Everything you see is synthetic, generated for this demo.`,
    facts: [
      { label: "Plants", value: ds.factories.map((f) => `${f.name.replace(" Plant", "")} (${f.country})`).join(", ") },
      { label: "Production lines", value: `${ds.lines.length}, three at each plant` },
      { label: "Products", value: `${ds.products.length}: ${ds.products.map((p) => p.name).join(", ")}` },
    ],
    data: {
      range: dataRange(),
      granularities: ["Weekly", "Monthly", "Quarterly"],
      datasets: [
        { name: "Production output", detail: "Units produced every working day, for each line, with growth and seasonal patterns" },
        { name: "Quality", detail: "Defective units for each line and day, so defect rates can be tracked by line, plant or period" },
        { name: "Downtime", detail: `Every stoppage with its cause (${DOWNTIME_CAUSES.join(", ").toLowerCase()}) and its minutes` },
      ],
    },
    skills: [
      { name: "Production analysis", detail: "Output and defect rate by plant, line, week, month or quarter" },
      { name: "Quality analysis", detail: "Rank lines by defect rate and trace quality over time" },
      { name: "Downtime analysis", detail: "Compare periods, find the biggest causes and the worst locations" },
      { name: "Charts and tables", detail: "Bar, line and donut charts, KPI cards, comparisons and filters, chosen to fit your question" },
      { name: "Create a PDF report", detail: "A branded, downloadable report with charts and tables" },
      { name: "Create a slide deck", detail: "A branded PowerPoint with editable charts. You can supply your own wording" },
      { name: "Draft an email", detail: "Email text with the charts embedded, shown in a mail window" },
    ],
    roles: org.roles.map((r) => {
      const scoped = r.scope.factoryIds !== "all";
      const plants = scoped ? (r.scope.factoryIds as string[]).map((id) => plantNames.get(id) ?? id) : [];
      return describeRole(r, NORTHSTAR_LABELS, scoped ? `${plants.join(", ")} only` : `All ${ds.factories.length} plants`, scoped ? [`See other plants' data`] : [], []);
    }),
  };
}

function orbitAbout(): AboutInfo {
  const org = getOrganization("orbit")!;
  const ds = getOrbitDataset();
  const lastMonth = REFERENCE_DATE.slice(0, 7);
  const active = ds.accountMonths.filter((r) => r.month === lastMonth && !r.churned).length;
  return {
    overview: `${org.name} is a fictional B2B software company. It sells an analytics platform on ${PLANS.length} plans to businesses of three sizes, and tracks revenue, churn, product usage and support. Everything you see is synthetic, generated for this demo.`,
    facts: [
      { label: "Customers", value: `About ${Math.round(active / 10) * 10} active today, ${ds.accounts.length} over the four years` },
      { label: "Plans", value: PLANS.map((p) => p.name).join(", ") },
      { label: "Segments", value: SEGMENTS.map((s) => s.name).join(", ") },
      { label: "Product features", value: FEATURES.map((f) => f.name).join(", ") },
    ],
    data: {
      range: dataRange(),
      granularities: ["Monthly", "Quarterly"],
      datasets: [
        { name: "Revenue", detail: "Monthly recurring revenue for every customer, with new, expansion and churned revenue" },
        { name: "Churn", detail: "Every customer who left, with the plan they were on and the reason they gave" },
        { name: "Product usage", detail: "Which features each customer uses, month by month, from the launch of each feature" },
        { name: "Support", detail: "Tickets by category (bug, how-to, billing, feature request, outage) and product feature, with time to resolve" },
      ],
    },
    skills: [
      { name: "Revenue analysis", detail: "MRR growth, new and churned revenue, and where revenue comes from" },
      { name: "Churn analysis", detail: "Churn by plan, segment or period, and the reasons customers give" },
      { name: "Customer health", detail: "Support load against product adoption, by segment and plan" },
      { name: "Product usage and bugs", detail: "Feature adoption, and where bug tickets are concentrated" },
      { name: "Accounts at risk", detail: "Named customers most likely to leave, scored from usage and support" },
      { name: "Charts and tables", detail: "Bar, line and donut charts, KPI cards, comparisons and filters, chosen to fit your question" },
      { name: "Create a PDF, slide deck or email", detail: "Branded documents from any view. Email opens as a draft in a mail window" },
    ],
    roles: org.roles.map((r) => {
      const held = new Set(r.permissions);
      const notes: string[] = [];
      if (!held.has(ORBIT_PERMISSIONS.revenue) && (held.has(ORBIT_PERMISSIONS.churn) || held.has(ORBIT_PERMISSIONS.accounts))) {
        notes.push("Revenue figures appear as a dash wherever they would otherwise be shown: hidden, not blocked.");
      }
      if (held.has(ORBIT_PERMISSIONS.support)) notes.push("Groups with fewer than five customers are hidden from reports.");
      return describeRole(r, ORBIT_LABELS, r.scopeLabel ?? "All data", [], notes);
    }),
  };
}

function groveAbout(): AboutInfo {
  const org = getOrganization("grove")!;
  const ds = getGroveDataset();
  const lastMonth = REFERENCE_DATE.slice(0, 7);
  const today = ds.headcount.filter((r) => r.month === lastMonth).reduce((a, r) => a + r.headcount, 0);
  return {
    overview: `${org.name} is the people-operations team of a fictional company. It reports on headcount, hiring, training, leave and engagement, as aggregates only. Everything you see is synthetic, and the data store holds no individual employee records at all.`,
    facts: [
      { label: "People", value: `About ${Math.round(today / 10) * 10} employees today` },
      { label: "Departments", value: DEPARTMENTS.map((d) => d.name).join(", ") },
      { label: "Locations", value: LOCATIONS.map((l) => l.name).join(", ") },
      { label: "Privacy rule", value: `No figure describes fewer than ${MIN_COHORT} people. Small groups are combined into “Other”.` },
    ],
    data: {
      range: dataRange(),
      granularities: ["Monthly", "Quarterly"],
      datasets: [
        { name: "Headcount", detail: "Headcount, hires and leavers each month, by department, level and location" },
        { name: "Hiring", detail: "Candidates at each stage of the funnel, and the time to hire" },
        { name: "Training", detail: "Completion of four mandatory courses, at the end of each quarter" },
        { name: "Leave", detail: "Days of annual, sick, parental and other leave, as aggregates" },
        { name: "Engagement", detail: "Quarterly survey scores and response rates, by department and theme" },
      ],
    },
    skills: [
      { name: "Headcount and attrition", detail: "How teams grew or shrank, and how many people left" },
      { name: "Hiring analysis", detail: "Where candidates drop out of the funnel, and how long hiring takes" },
      { name: "Training and compliance", detail: "Who is behind on mandatory courses" },
      { name: "Leave and engagement", detail: "Patterns in leave, and what drives engagement" },
      { name: "Charts and tables", detail: "Bar, line and donut charts, KPI cards, comparisons and filters, chosen to fit your question" },
      { name: "Create a PDF, slide deck or email", detail: "Branded documents from any view. Email opens as a draft in a mail window" },
    ],
    roles: org.roles.map((r) => {
      const scoped = r.scope.departments !== undefined && r.scope.departments !== "all";
      const notes = [
        `Groups with fewer than ${MIN_COHORT} people are combined into “Other”, so nobody can be singled out, and the total stays correct.`,
      ];
      if (scoped) notes.push("A request for another department is blocked, and an unspecific one is narrowed to this department.");
      return describeRole(r, GROVE_LABELS, r.scopeLabel ?? "All departments", ["See individual employee records (no profile can)"], notes);
    }),
  };
}

/** A plain-language description of a company, generated from the data and policy configuration it runs on. */
export function aboutFor(organizationId: string): AboutInfo | null {
  if (organizationId === "northstar") return northstarAbout();
  if (organizationId === "orbit") return orbitAbout();
  if (organizationId === "grove") return groveAbout();
  return null;
}
