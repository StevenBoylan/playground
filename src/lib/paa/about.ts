import { DATA_START, DATA_YEARS, DOWNTIME_CAUSES, REFERENCE_DATE, getNorthstarDataset } from "./data/seed";
import { getOrganization } from "./organizations";
import { NORTHSTAR_PERMISSIONS, type RoleDefinition } from "./policies/roles";

export interface AboutRole {
  id: string;
  label: string;
  description: string;
  scope: string;
  can: string[];
  cannot: string[];
}

export interface AboutInfo {
  overview: string;
  facts: { label: string; value: string }[];
  data: { range: string; granularities: string[]; datasets: { name: string; detail: string }[] };
  skills: { name: string; detail: string }[];
  roles: AboutRole[];
}

const PRODUCT_PLURAL: Record<string, string> = {
  "drive-unit": "drive units",
  "control-board": "control boards",
  housing: "housing assemblies",
  "sensor-pack": "sensor packs",
};

function joinList(items: string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function longDate(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/** What each permission means to a person. Only permissions that something in the demo actually uses are listed. */
const PERMISSION_LABEL: [string, string][] = [
  [NORTHSTAR_PERMISSIONS.production, "View production output"],
  [NORTHSTAR_PERMISSIONS.defects, "View defect rates"],
  [NORTHSTAR_PERMISSIONS.downtime, "View downtime"],
  [NORTHSTAR_PERMISSIONS.exportPdf, "Create PDF reports"],
  [NORTHSTAR_PERMISSIONS.exportPptx, "Create slide decks"],
  [NORTHSTAR_PERMISSIONS.draftEmail, "Draft emails (simulated)"],
];

function describeRole(role: RoleDefinition, plantNames: Map<string, string>, allPlants: number): AboutRole {
  const held = new Set(role.permissions);
  const scoped = role.scope.factoryIds !== "all";
  const plants = scoped ? (role.scope.factoryIds as string[]).map((id) => plantNames.get(id) ?? id) : [];
  const can = PERMISSION_LABEL.filter(([p]) => held.has(p)).map(([, label]) => label);
  const cannot = PERMISSION_LABEL.filter(([p]) => !held.has(p)).map(([, label]) => label);
  if (scoped) cannot.unshift(`See other plants' data`);
  return {
    id: role.id,
    label: role.label,
    description: role.description,
    scope: scoped ? `${plants.join(", ")} only` : `All ${allPlants} plants`,
    can,
    cannot,
  };
}

/** A plain-language description of a company, generated from the data and policy configuration it runs on. */
export function aboutFor(organizationId: string): AboutInfo | null {
  const org = getOrganization(organizationId);
  if (organizationId !== "northstar" || !org) return null;

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
      range: `${longDate(DATA_START)} to ${longDate(REFERENCE_DATE)} (${DATA_YEARS} years). Treat ${longDate(REFERENCE_DATE)} as “today”.`,
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
      { name: "Draft an email", detail: "Email text with the charts embedded, shown in a simulated window. Nothing is sent" },
    ],
    roles: org.roles.map((r) => describeRole(r, plantNames, ds.factories.length)),
  };
}
