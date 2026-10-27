import type { Scope } from "../schemas/capability";

export interface RoleDefinition {
  id: string;
  label: string;
  description: string;
  permissions: string[];
  scope: Scope;
  /** How the role's data scope is described to people, where it is not simply a list of plants. */
  scopeLabel?: string;
}

export const NORTHSTAR_PERMISSIONS = {
  production: "northstar.production.read",
  defects: "northstar.defects.read",
  downtime: "northstar.downtime.read",
  purchaseOrders: "northstar.purchase_orders.read",
  /** Actions: producing documents and sharing them. Sharing outside a plant is a director privilege. */
  exportPdf: "northstar.action.pdf",
  exportPptx: "northstar.action.pptx",
  draftEmail: "northstar.action.email",
} as const;

export const northstarRoles: RoleDefinition[] = [
  {
    id: "operations_director",
    label: "Operations Director",
    description: "All factories, including inventory and purchase orders. Can export PDF, build slide decks and draft emails.",
    permissions: Object.values(NORTHSTAR_PERMISSIONS),
    scope: { factoryIds: "all" },
  },
  {
    id: "line_supervisor",
    label: "Line Supervisor",
    description: "Output, defects and downtime for the Dublin Plant only. Can export PDF reports; no slide decks, no email, no purchase order values.",
    permissions: [
      NORTHSTAR_PERMISSIONS.production,
      NORTHSTAR_PERMISSIONS.defects,
      NORTHSTAR_PERMISSIONS.downtime,
      NORTHSTAR_PERMISSIONS.exportPdf,
    ],
    scope: { factoryIds: ["dublin"] },
  },
];

/**
 * Orbit's permissions. What a profile can see is layered: some data is denied outright, and some is shown with
 * the revenue fields withheld (redacted), which is a different thing from being blocked.
 */
export const ORBIT_PERMISSIONS = {
  usage: "orbit.usage.read",
  support: "orbit.support.read",
  churn: "orbit.churn.read",
  accounts: "orbit.accounts.read",
  revenue: "orbit.revenue.read",
  exportPdf: "orbit.action.pdf",
  exportPptx: "orbit.action.pptx",
  draftEmail: "orbit.action.email",
} as const;

export const orbitRoles: RoleDefinition[] = [
  {
    id: "ceo",
    label: "CEO",
    description: "The whole picture: revenue, churn, customers and product health. Can produce PDFs, slide decks and email drafts.",
    permissions: Object.values(ORBIT_PERMISSIONS),
    scope: { factoryIds: "all" },
    scopeLabel: "Everything, including revenue and named customers",
  },
  {
    id: "head_of_operations",
    label: "Head of Operations",
    description: "Product usage, support, churn and named at-risk customers, but revenue figures are hidden. Can produce PDFs and email drafts.",
    permissions: [
      ORBIT_PERMISSIONS.usage,
      ORBIT_PERMISSIONS.support,
      ORBIT_PERMISSIONS.churn,
      ORBIT_PERMISSIONS.accounts,
      ORBIT_PERMISSIONS.exportPdf,
      ORBIT_PERMISSIONS.draftEmail,
    ],
    scope: { factoryIds: "all" },
    scopeLabel: "Operations data and named customers, with revenue hidden",
  },
  {
    id: "junior_developer",
    label: "Junior Software Developer",
    description: "Product usage and support tickets only. No revenue, no churn, no customer accounts. Can produce PDFs.",
    permissions: [ORBIT_PERMISSIONS.usage, ORBIT_PERMISSIONS.support, ORBIT_PERMISSIONS.exportPdf],
    scope: { factoryIds: "all" },
    scopeLabel: "Product usage and support only",
  },
];

/**
 * Grove's permissions. Everything is an aggregate: there is no permission for individual employee records because
 * no capability exposes them, so they are unavailable to every profile.
 */
export const GROVE_PERMISSIONS = {
  headcount: "grove.headcount.read",
  hiring: "grove.hiring.read",
  training: "grove.training.read",
  leave: "grove.leave.read",
  engagement: "grove.engagement.read",
  exportPdf: "grove.action.pdf",
  exportPptx: "grove.action.pptx",
  draftEmail: "grove.action.email",
} as const;

export const groveRoles: RoleDefinition[] = [
  {
    id: "hr_business_partner",
    label: "HR Business Partner",
    description: "Every department aggregate, including leave and engagement. Can produce PDFs and email drafts. Individual records are not available to anyone.",
    permissions: [
      GROVE_PERMISSIONS.headcount,
      GROVE_PERMISSIONS.hiring,
      GROVE_PERMISSIONS.training,
      GROVE_PERMISSIONS.leave,
      GROVE_PERMISSIONS.engagement,
      GROVE_PERMISSIONS.exportPdf,
      GROVE_PERMISSIONS.draftEmail,
    ],
    scope: { factoryIds: "all", departments: "all" },
    scopeLabel: "All departments, including leave and engagement",
  },
  {
    id: "executive",
    label: "Executive",
    description: "Company-wide headcount, hiring, training and engagement. No leave data. Can produce PDFs, slide decks and email drafts.",
    permissions: [
      GROVE_PERMISSIONS.headcount,
      GROVE_PERMISSIONS.hiring,
      GROVE_PERMISSIONS.training,
      GROVE_PERMISSIONS.engagement,
      GROVE_PERMISSIONS.exportPdf,
      GROVE_PERMISSIONS.exportPptx,
      GROVE_PERMISSIONS.draftEmail,
    ],
    scope: { factoryIds: "all", departments: "all" },
    scopeLabel: "All departments, without leave data",
  },
  {
    id: "hiring_manager",
    label: "Hiring Manager (Engineering)",
    description: "Headcount, hiring and training for the Engineering department only. No leave or engagement data. Can produce PDFs.",
    permissions: [GROVE_PERMISSIONS.headcount, GROVE_PERMISSIONS.hiring, GROVE_PERMISSIONS.training, GROVE_PERMISSIONS.exportPdf],
    scope: { factoryIds: "all", departments: ["engineering"] },
    scopeLabel: "Engineering only",
  },
];
