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
}

export const projects: PlaygroundProject[] = [
  {
    slug: "paa",
    name: "Post-Application Architecture",
    tagline: "Software without the learning curve.",
    description:
      "State an intent. An AI layer chooses authorized capabilities, trusted services run them, and a purpose-built interface is composed on the fly. All companies and data are fictional.",
    tags: ["framework", "ai", "software"],
  },
  {
    slug: "lim",
    name: "LIM Explorer",
    tagline: "How did this offer come to exist?",
    description:
      "An illustrative, fictional walkthrough of Latent Intent Marketing: how permissioned buyer-side agents could arrive at a personalised offer.",
    href: "/lim",
    tags: ["framework", "ai", "marketing"],
  },
  {
    slug: "4gates",
    name: "The Four Gates",
    tagline: "What earns you the right to move from idea to product.",
    description:
      "A self-assessment guide for product teams. Four gates, each asking one question and needing evidence before you move on. Check your own evidence at each stage.",
    tags: ["framework", "product"],
  },
];
