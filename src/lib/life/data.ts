import type { LifeData } from "./types";

/**
 * Server-side only: this module is imported by the gated page and its contents reach the browser as page data,
 * never as a public script bundle.
 *
 * Illustrative signals for the worked example in the Latent Intent Marketing article: several unrelated signals
 * converge on one inferred intent, a half marathon abroad. Each flag is a coarse statement, never a raw record, so
 * real versions can take the same shape.
 */
export const lifeData: LifeData = {
  title: "Your life offers",
  note: "Illustrative signals, shaped like the data these services hold. Merchants and offers are fictional.",
  budgetCap: 100,
  budgetSourceId: "prefs",
  categories: [
    { id: "trip", label: "Trips" },
    { id: "move", label: "Move" },
  ],
  sources: [
    {
      id: "garmin",
      name: "Garmin Connect",
      role: "How and how much you train",
      sees: "Weekly distance and pace bands",
      neverSees: "GPS routes, home location, exact timestamps",
    },
    {
      id: "youtube",
      name: "YouTube",
      role: "What you choose to watch",
      sees: "Topics of videos watched",
      neverSees: "Individual titles, comments, account details",
    },
    {
      id: "search",
      name: "Google Search",
      role: "What you look up",
      sees: "Broad topics, such as travel to a coastal city",
      neverSees: "Exact queries, results clicked",
    },
    {
      id: "calendar",
      name: "Google Calendar",
      role: "When you are free",
      sees: "Free and busy blocks over the next two months",
      neverSees: "Event titles, attendees, locations",
    },
    {
      id: "prefs",
      name: "Money rules",
      role: "The finance agent's limits",
      sees: "A spending limit you set yourself",
      neverSees: "Balances, transactions, anything from your bank",
    },
  ],
  flags: [
    { id: "g-volume", sourceId: "garmin", short: "Mileage rising", label: "Weekly running distance has climbed steadily for six weeks.", sensitivity: "low", weeksAgo: 6 },
    { id: "y-doc", sourceId: "youtube", short: "Marathon documentary", label: "Watched a marathon documentary and related race videos.", sensitivity: "low", weeksAgo: 4 },
    { id: "s-coast", sourceId: "search", short: "Looking at flights to a coastal city", label: "Searched for flights to a Mediterranean coastal city.", sensitivity: "medium", weeksAgo: 2 },
    { id: "c-april", sourceId: "calendar", short: "Free weekend in April", label: "A free weekend opens up in April, after a busy stretch.", sensitivity: "low", weeksAgo: 1 },
    { id: "c-sat", sourceId: "calendar", short: "Saturday free", label: "Saturday morning is free.", sensitivity: "low", weeksAgo: 0 },
    { id: "p-limit", sourceId: "prefs", short: "Spending limit set", label: "You have set a firm limit on one-off spending.", sensitivity: "medium", weeksAgo: 0 },
  ],
  intents: [
    {
      id: "i-race",
      label: "Run a half marathon abroad",
      summary: "Training volume, race content, coastal-city searches and a free weekend all point the same way. You have not said so yourself.",
    },
    { id: "i-base", label: "Build a running base", summary: "Distance is rising and a Saturday is free, so the next step is consistency." },
  ],
  offers: [
    {
      id: "o-cyprus",
      categoryId: "trip",
      title: "Cyprus",
      merchant: "Coastline Trips",
      blurb: "A half marathon weekend in Limassol: race entry, return flights and two nights by the seafront, assembled in one booking.",
      price: 389,
      was: 470,
      ends: "Early-bird closes soon",
      intentId: "i-race",
      flags: [
        { flagId: "g-volume", weight: 0.3 },
        { flagId: "y-doc", weight: 0.15 },
        { flagId: "s-coast", weight: 0.3 },
        { flagId: "c-april", weight: 0.25 },
      ],
      shortlistOnBudget: true,
      reasoning:
        "No single signal asks for this. Together they do: your training is climbing, you have been watching race content and looking at coastal flights, and a weekend is free. The finance agent holds it for approval because it is over the spending limit you set.",
    },
    {
      id: "o-plan",
      categoryId: "move",
      title: "Six-week half-marathon base plan",
      merchant: "Stride Lab",
      blurb: "A structured plan that builds to 21 km at an easy pace. A cheaper first step toward the same goal.",
      price: 12,
      ends: "Starts Monday",
      intentId: "i-race",
      flags: [
        { flagId: "g-volume", weight: 0.5 },
        { flagId: "y-doc", weight: 0.25 },
        { flagId: "p-limit", weight: 0.25 },
      ],
      reasoning: "The same intent, but within your spending limit. The finance agent proposes it as the stepping stone while the trip waits.",
    },
    {
      id: "o-5k",
      categoryId: "move",
      title: "Saturday 5K social run",
      merchant: "Riverside Runners",
      blurb: "A friendly, untimed group run. All paces, coffee after.",
      price: 0,
      ends: "This Saturday",
      intentId: "i-base",
      flags: [
        { flagId: "c-sat", weight: 0.6 },
        { flagId: "g-volume", weight: 0.4 },
      ],
      reasoning: "Saturday morning is free and mileage is climbing, so a free group run adds consistency without adding cost.",
    },
  ],
};
