import { getOrganization } from "../organizations";
import type { Brand } from "./types";

/** Branding is configuration: every company's documents come from the same generators. */
export function brandFor(organizationId: string): Brand {
  const org = getOrganization(organizationId);
  const name = org?.name ?? "Playground";
  return {
    name,
    shortName: name.split(" ")[0],
    accent: org?.accent ?? "#2563eb",
    footer: `${name} · Fictional company · Synthetic data`,
    emailDomain: `${name.split(" ")[0].toLowerCase()}.example`,
  };
}
