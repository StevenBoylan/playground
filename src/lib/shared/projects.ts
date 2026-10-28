/** A fixed vocabulary, so tags can become filters later. */
export type ProjectTag = "ai" | "software" | "marketing" | "framework" | "product";

export const TAG_LABELS: Record<ProjectTag, string> = {
  ai: "AI",
  software: "Software",
  marketing: "Marketing",
  framework: "Framework",
  product: "Product",
};

export interface PlaygroundProject {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Set for demos that are static builds under /public rather than Next routes. */
  href?: string;
  /** Two or three of the vocabulary above. */
  tags: ProjectTag[];
  /** Why the author built it: shown on the card as secondary text. */
  why: string;
}

export const projects: PlaygroundProject[] = [
  {
    slug: "paa",
    name: "Post-Application Architecture",
    tagline: "Software without the learning curve.",
    description:
      "State an intent. An AI layer chooses authorized capabilities, trusted services run them, and a purpose-built interface is composed on the fly. All companies and data are fictional.",
    tags: ["framework", "ai", "software"],
    why: "If AI becomes the starting point for getting things done, how should the software underneath it work? I built this demo to explore the relationship between user intent, permissions, trusted services and the interface someone actually needs. It makes the proposed architecture tangible enough to discuss its benefits, limits and trade-offs.",
  },
  {
    slug: "lim",
    name: "LIM Explorer",
    tagline: "How did this offer come to exist?",
    description:
      "An illustrative, fictional walkthrough of Latent Intent Marketing: how permissioned buyer-side agents could arrive at a personalised offer.",
    href: "/lim",
    tags: ["framework", "ai", "marketing"],
    why: "Much of marketing assumes that customers will search, browse or respond to an advert. What changes if their personal agents help identify a need and bring suitable offers to them? I created this walkthrough to make that possibility concrete and explore what businesses would need to do to participate.",
  },
  {
    slug: "4gates",
    name: "The Four Gates",
    tagline: "What earns you the right to move from idea to product.",
    description:
      "A self-assessment guide for product teams. Four gates, each asking one question and needing evidence before you move on. Check your own evidence at each stage.",
    tags: ["framework", "product"],
    why: "I\u2019ve seen teams move from research to development, or from a promising pilot to scaling, without enough evidence to justify the investment. I\u2019ve made those mistakes too. Four Gates turns those lessons into a practical check: what do we actually know, what remains uncertain, and what is the smallest test worth funding next?",
  },
];
