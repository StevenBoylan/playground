import { northstarRoles, type RoleDefinition } from "./policies/roles";

export interface OrganizationConfig {
  id: string;
  name: string;
  domain: string;
  tagline: string;
  /** Theme is configuration: the same renderer is used for every organization. */
  accent: string;
  available: boolean;
  roles: RoleDefinition[];
}

export const organizations: OrganizationConfig[] = [
  {
    id: "northstar",
    name: "Northstar Manufacturing",
    domain: "Manufacturing and operations",
    tagline: "Production, quality and downtime across three factories.",
    accent: "#1d4ed8",
    available: true,
    roles: northstarRoles,
  },
  {
    id: "orbit",
    name: "Orbit Software",
    domain: "B2B SaaS",
    tagline: "Revenue, churn and customer health.",
    accent: "#7c3aed",
    available: false,
    roles: [],
  },
  {
    id: "grove",
    name: "Grove People",
    domain: "People operations",
    tagline: "Headcount, hiring and engagement (aggregates only).",
    accent: "#15803d",
    available: false,
    roles: [],
  },
];

export function getOrganization(id: string): OrganizationConfig | undefined {
  return organizations.find((o) => o.id === id);
}
