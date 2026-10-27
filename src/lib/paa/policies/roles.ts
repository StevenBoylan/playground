import type { Scope } from "../schemas/capability";

export interface RoleDefinition {
  id: string;
  label: string;
  description: string;
  permissions: string[];
  scope: Scope;
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
