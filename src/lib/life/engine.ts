import type { Flag, LifeData, Offer } from "./types";

/** An offer needs at least this share of its evidence switched on to be shown. */
export const MIN_STRENGTH = 0.5;

export interface ShownOffer {
  offer: Offer;
  /** 0 to 1: the share of the offer's evidence that is currently available. */
  strength: number;
  active: Flag[];
  missing: Flag[];
}

export interface WithheldOffer {
  offer: Offer;
  reason: "budget" | "evidence";
  detail: string;
}

export interface Evaluation {
  shown: ShownOffer[];
  withheld: WithheldOffer[];
}

/**
 * Works out which offers the commerce agent can stand behind, given the sources the person has left on.
 * Switching a source off removes its flags, which weakens or removes the offers that rested on them.
 */
export function evaluate(data: LifeData, enabled: ReadonlySet<string>): Evaluation {
  const flagById = new Map(data.flags.map((f) => [f.id, f]));
  const sourceName = new Map(data.sources.map((s) => [s.id, s.name]));
  const budgetOn = enabled.has(data.budgetSourceId);
  const shown: ShownOffer[] = [];
  const withheld: WithheldOffer[] = [];

  for (const offer of data.offers) {
    const parts = offer.flags.flatMap((ref) => {
      const flag = flagById.get(ref.flagId);
      return flag ? [{ flag, weight: ref.weight }] : [];
    });
    const total = parts.reduce((sum, p) => sum + p.weight, 0);
    const live = parts.filter((p) => enabled.has(p.flag.sourceId));
    const strength = total > 0 ? live.reduce((sum, p) => sum + p.weight, 0) / total : 0;
    const active = live.map((p) => p.flag);
    const missing = parts.filter((p) => !enabled.has(p.flag.sourceId)).map((p) => p.flag);

    if (budgetOn && offer.price > data.budgetCap) {
      withheld.push({ offer, reason: "budget", detail: `Costs €${offer.price}, over the €${data.budgetCap} low-cost limit.` });
    } else if (strength < MIN_STRENGTH) {
      const needs = [...new Set(missing.map((f) => sourceName.get(f.sourceId) ?? f.sourceId))].join(", ");
      withheld.push({ offer, reason: "evidence", detail: `Not enough evidence without ${needs}.` });
    } else {
      shown.push({ offer, strength, active, missing });
    }
  }

  shown.sort((a, b) => b.strength - a.strength || a.offer.price - b.offer.price);
  return { shown, withheld };
}
