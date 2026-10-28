import { getOrganization } from "../organizations";
import type { Brand } from "./types";

/**
 * Branding is configuration: every company's documents come from the same generators. A plain document uses the
 * same layout with a neutral name and colour, and no company footer.
 */
export function brandFor(organizationId: string, branded = true): Brand {
  const org = getOrganization(organizationId);
  const name = org?.name ?? "Playground";
  if (!branded) {
    return { name: "Report", shortName: "Report", accent: "#475569", footer: "Synthetic data", emailDomain: `${name.split(" ")[0].toLowerCase()}.example` };
  }
  return {
    name,
    shortName: name.split(" ")[0],
    accent: org?.accent ?? "#007f86",
    footer: `${name} · Fictional company · Synthetic data`,
    emailDomain: `${name.split(" ")[0].toLowerCase()}.example`,
  };
}
