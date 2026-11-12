export interface ProjectSection {
  heading: string;
  paragraphs: string[];
}

export interface PlaygroundProject {
  slug: string;
  /** The question shown as the card's headline. */
  headline: string;
  /** Concept name and format, shown directly under the headline. */
  subtitle: string;
  /** Left column on desktop: "Where the idea came from" or "The starting question". */
  origin: ProjectSection;
  /** Right column on desktop. */
  idea: ProjectSection;
  /** Follows "The idea" in the right column, with its call to action. */
  example: ProjectSection & { cta: string };
  /** Where the card's button goes when it is not `/<slug>`: an explainer page that sits in front of a gated demo. */
  intro?: string;
  /** Set for demos that are static builds under /public rather than Next routes. */
  href?: string;
  /** The demo asks for a password, so its call to action carries an "Access required" note. */
  gated?: boolean;
}

/** In the order they appear on the landing page. */
export const projects: PlaygroundProject[] = [
  {
    slug: "lim",
    href: "/lim",
    intro: "/life",
    headline: "What happens when customers stop searching?",
    subtitle: "Latent Intent Marketing · Interactive demo",
    origin: {
      heading: "Where the idea came from",
      paragraphs: [
        "Click-throughs from search results have seen a significant fall as AI summaries answer queries directly. This got me thinking about what comes next.",
        "If people increasingly get answers and recommendations from AI without visiting a website, how will businesses reach their next customer? How can established businesses adapt, and where do the next opportunities lie?",
      ],
    },
    idea: {
      heading: "The idea",
      paragraphs: [
        "AI assistants could spot an opportunity before someone explicitly searches for it, then assemble a suitable offer for them to consider. That possibility is the starting point for Latent Intent Marketing.",
        "This demo shows an example implementation and then walks through the wider architectural concept.",
      ],
    },
    example: {
      heading: "Try an example",
      paragraphs: [
        "A running enthusiast has recently increased their distance from 7 km to 12 km, has been watching running training videos and has an upcoming long weekend in their calendar.",
        "Follow this fictional example as their assistants connect these and other signals, identify the possibility of a half-marathon trip, and assemble a suitable offer.",
      ],
      cta: "Find out more",
    },
  },
  {
    slug: "paa",
    intro: "/paa-concept",
    gated: true,
    headline: "Why use multiple applications to complete one task?",
    subtitle: "Post-Application Architecture · Interactive demo",
    origin: {
      heading: "The starting question",
      paragraphs: [
        "Most software asks us to learn its menus, screens and workflows. Completing one task can mean moving between several applications, carrying information from one to another.",
        "What if we could describe what we wanted to achieve, and the software assembled the tools and interface around that task?",
        "We’ve spent decades teaching people to understand software, now it’s time to teach software to understand people.",
      ],
    },
    idea: {
      heading: "The idea",
      paragraphs: [
        "AI interprets the request and coordinates a layer of services that carry out the work. Policies and permissions govern which information it can access, which actions it can take and when approval is needed.",
        "The interface is assembled around the request: the controls, information or dashboard needed to complete the task.",
      ],
    },
    example: {
      heading: "Explore the demo",
      paragraphs: [
        "See how a request becomes a working interface, with AI coordinating the task, services executing actions and policies setting the boundaries.",
      ],
      cta: "Find out more",
    },
  },
  {
    slug: "4gates",
    headline: "How do you know your idea is ready for the next step?",
    subtitle: "The Four Gates · Interactive guide",
    origin: {
      heading: "Where the idea came from",
      paragraphs: [
        "I’ve seen many teams treat research as proof of demand, a working prototype as proof of a business, and a successful pilot as a reason to scale. I’ve made those mistakes too.",
        "When you’ve invested time, money and belief in something, it becomes easy to find reasons to keep going. Sometimes, we simply don’t have the evidence, and moving forward too early can become very costly.",
        "That got me thinking: what evidence should we require before committing more?",
      ],
    },
    idea: {
      heading: "The idea",
      paragraphs: [
        "Four Gates brings together lessons from product development and venture building into four investment decisions: Discovery, MVP, Pilot and Productisation.",
        "Each gate asks what you can demonstrate before moving forward. When the evidence falls short, the decision might be to run another test, change direction or stop.",
        "The hardest part is being willing to act on an answer you didn’t want.",
      ],
    },
    example: {
      heading: "Try it with your own project",
      paragraphs: [
        "Choose an idea or product you’re working on and check the evidence you have at each gate. Identify what remains uncertain and the smallest test that could justify the next investment.",
      ],
      cta: "Check your evidence",
    },
  },
];
