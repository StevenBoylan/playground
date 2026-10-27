export interface PlaygroundProject {
  slug: string;
  name: string;
  tagline: string;
  description: string;
}

export const projects: PlaygroundProject[] = [
  {
    slug: "paa",
    name: "Post-Application Architecture",
    tagline: "Software without the learning curve.",
    description:
      "State an intent. An AI layer chooses authorized capabilities, trusted services run them, and a purpose-built interface is composed on the fly. All companies and data are fictional.",
  },
];
