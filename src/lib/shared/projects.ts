export interface PlaygroundProject {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  /** Set for demos that are static builds under /public rather than Next routes. */
  href?: string;
}

export const projects: PlaygroundProject[] = [
  {
    slug: "paa",
    name: "Post-Application Architecture",
    tagline: "Software without the learning curve.",
    description:
      "State an intent. An AI layer chooses authorized capabilities, trusted services run them, and a purpose-built interface is composed on the fly. All companies and data are fictional.",
  },
  {
    slug: "lim",
    name: "LIM Explorer",
    tagline: "How did this offer come to exist?",
    description:
      "An illustrative, fictional walkthrough of Latent Intent Marketing: how permissioned buyer-side agents could arrive at a personalised offer.",
    href: "/lim",
  },
];
