/**
 * Content for The Four Gates demo (stevenboylan.eu). Wording for the gate questions, evidence ladders,
 * exit lines and failure examples is taken verbatim from the published guide; the short explanations are
 * condensed from it. The MVP ladder is a DRAFT derived from the guide's text and worksheet (the guide
 * only gives the gate question and "not enough on their own" for MVP) and needs the author's sign-off.
 */

export type LevelId = "gold" | "strong" | "useful";

export interface Gate {
  id: string;
  number: string;
  name: string;
  question: string;
  /** What passing this gate reduces. */
  reduces: string;
  /** The label of the "yes, move on" decision in the guide's worksheet. */
  proceedLabel: string;
  /** The label of the "not yet" decision. */
  retryLabel: string;
  /** Condensed explanation, one paragraph per entry. */
  summary: string[];
  /** A line from the guide worth pulling out. */
  pullQuote: string;
  /** "Seen in the wild" / "Real world failure examples". */
  failures: { heading: string; items: string[] };
  levels: Record<LevelId, string>;
  notEnough: string;
  /** Shown when only weak or no evidence is present. */
  exitLine: string;
  earns: string;
  /** Worksheet prompt for the pre-declared bar. */
  thresholdLabel: string;
  thresholdHint: string;
  /** Extra questions the guide asks (Productisation). */
  askYourself?: string[];
}

export const PRINCIPLE = {
  formula: "Evidence − Uncertainty = Justified Investment",
  intro: "Each gate asks one question and requires enough evidence before you've earned the right to move on. The gates are not milestones. They are decision points. Passing is good. Failing is good. Going backwards is often the smartest decision you'll make.",
  warning: "The expensive mistake is not failing, it's pretending you've passed when you haven't.",
  chain: [
    { stage: "Discovery", evidence: "evidence of demand", invest: "invest in MVP" },
    { stage: "MVP", evidence: "evidence of willingness to pay", invest: "invest in Pilot" },
    { stage: "Pilot", evidence: "evidence of measurable value", invest: "invest in Productisation" },
    { stage: "Productisation", evidence: "evidence of repeatability", invest: "invest in Scale" },
  ],
};

export const GATES: Gate[] = [
  {
    id: "discovery",
    number: "01",
    name: "Discovery",
    question: "Does anyone care enough to act?",
    reduces: "market risk",
    proceedLabel: "Proceed",
    retryLabel: "Test again, threshold declared first",
    summary: [
      "If you give something away for free, you are not measuring demand, you are measuring how many people are willing to accept free stuff. Discovery looks for evidence that people care enough to act before you spend months or years building.",
      "Payment is the cleanest signal, but at a very early stage “pay” can also mean someone's time or effort. What matters is that it costs them something. Decide in advance what success looks like and write it down: the metric, the threshold and why you chose it.",
    ],
    pullQuote: "Better to learn the answer for €500 than €500,000.",
    failures: {
      heading: "Real world failure examples",
      items: [
        "The survey where 80% said they'd use the product. Live conversion was 4%. The survey measured politeness.",
        "The waitlist that grew for months and converted to nothing. Signing up cost nothing, so it proved nothing.",
        "The internal tool with three enthusiastic champions, none of whom held a budget.",
      ],
    },
    levels: {
      gold: "Pre-payment, deposits, paid reservations or customers paying to move to the front of a waiting list.",
      strong: "Signed letters of intent, pilot agreements or senior decision-makers investing significant time and organisational effort.",
      useful: "Waiting lists, newsletter subscriptions, completed surveys or qualified email sign-ups.",
    },
    notEnough: "Clicks, likes, shares, positive comments or compliments.",
    exitLine: "not enough to proceed — go back and collect stronger evidence",
    earns: "Successful discovery earns the right to build an MVP.",
    thresholdLabel: "Your threshold",
    thresholdHint: "The number you declared before testing. If you declared nothing, write nothing.",
  },
  {
    id: "mvp",
    number: "02",
    name: "MVP",
    question: "What is the smallest thing worth paying for?",
    reduces: "solution risk",
    proceedLabel: "Proceed",
    retryLabel: "Find the buyer before building more",
    summary: [
      "The MVP is not your product with fewer features. It is the smallest thing that allows a named customer to solve one valuable problem and decide it is worth paying for. Its purpose isn't to save development time. It's to reduce risk.",
      "Every feature should justify its own existence: if removing a feature doesn't stop the customer buying, it doesn't belong in the MVP. An MVP is allowed to be simple, it's not allowed to be broken.",
    ],
    pullQuote: "Every feature you build before you know someone will pay for it is a gamble.",
    failures: {
      heading: "Real world failure examples",
      items: [
        "The six-month build that a two-week concierge test would have answered.",
        "The feature list taken from the loudest customer's solution, not their problem.",
        "The corporate MVP that took a year because it had to satisfy every stakeholder before meeting a single user.",
      ],
    },
    // DRAFT: the guide gives no ladder for MVP. Derived from the gate question and worksheet 02
    // ("Name the buyer. Name the budget it comes from." / "Real conditions and real stakes, or a favour?").
    levels: {
      gold: "A named customer uses your solution to solve a real problem and is paying for it, from a budget you can name.",
      strong: "A named buyer with a budget line has committed in writing to pay for this solution, under real conditions and real stakes.",
      useful: "A named customer uses it and says they would pay, but nothing is committed yet. Or a manual version is running with real users.",
    },
    notEnough: "A working demo nobody has committed to. Enthusiasm without a named buyer or a budget line.",
    exitLine: "not enough to proceed — find the buyer before building more",
    earns: "A successful MVP earns the right to run a Pilot.",
    thresholdLabel: "What they're actually committing to",
    thresholdHint: "Real conditions and real stakes, or a favour? Name the buyer and the budget it comes from.",
  },
  {
    id: "pilot",
    number: "03",
    name: "Pilot",
    question: "Does it create measurable value?",
    reduces: "delivery risk",
    proceedLabel: "Convert",
    retryLabel: "Renegotiate as a real pilot, stakes attached",
    summary: [
      "The MVP proved your product worked. The pilot proves it works in the real world, under real operating conditions: not just for spherical cows in a vacuum. A pilot isn't a trial, it's an experiment, with a hypothesis, criteria you can measure against and an agreed end.",
      "Decide the metrics in advance, and choose ones the person holding the budget will buy on: 15% lower costs, 12 hours saved every week. Time-bound it. Feedback is welcome; feature upgrades during the pilot are not.",
    ],
    pullQuote: "A free pilot with no end date and no success metric is not a pilot. It's a hobby you're running inside someone else's company.",
    failures: {
      heading: "Seen in the wild",
      items: [
        "The free pilot that ran eighteen months, produced great engagement, and never a signature.",
        "The pilot judged on enthusiasm while the CFO waited for a number that never came.",
        "The pilot that succeeded because your best people were inside it every day, patching quietly.",
      ],
    },
    levels: {
      gold: "Paid pilot measured against agreed business metrics (cost reduction, hours saved, throughput increased, revenue generated or errors reduced), with a commercial rollout or contract agreed if those targets are met.",
      strong: "Pilot successfully meets agreed metrics. Executive sponsor validates the business case. Procurement or commercial negotiations are underway.",
      useful: "Strong user adoption, positive operational feedback, improving metrics that weren't agreed beforehand, customer requesting enhancements before rollout.",
    },
    notEnough: "“The team loved it.” High engagement. Endless feature requests. Pilots that never end. Founders manually keeping the system running.",
    exitLine: "not enough to proceed — renegotiate as a real pilot, stakes attached",
    earns: "A successful pilot earns the right to Productise.",
    thresholdLabel: "Your metric and target",
    thresholdHint: "The number, agreed in writing, before the pilot started. And what was agreed to happen when it ends.",
  },
  {
    id: "productisation",
    number: "04",
    name: "Productisation",
    question: "Can we deliver this repeatedly?",
    reduces: "commercial risk",
    proceedLabel: "Scale",
    retryLabel: "Second deployment first",
    summary: [
      "The problem is that customers don't buy your best week. They buy your average Tuesday. Productisation is about understanding why the pilot succeeded: because the product genuinely works, or because your team quietly filled the gaps?",
      "A product is something your company can deliver consistently, regardless of which customer is buying it or which employee is supporting it: repeatedly, by ordinary people, under ordinary conditions.",
    ],
    pullQuote: "Customers don't buy your best week. They buy your average Tuesday.",
    failures: {
      heading: "Seen in the wild",
      items: [
        "Deployment two, run without the founding team, is where most “products” turn back into projects.",
        "Unit economics that only worked because heroics were free.",
        "The second product launched straight into build because “we know our market now.” New product, new gates – back to 01.",
      ],
    },
    levels: {
      gold: "The product works even when you're on holiday. New customers can be onboarded through a documented, repeatable process with minimal customisation. Support requests are predictable and manageable. The product can be delivered profitably at the agreed price.",
      strong: "Standard onboarding and deployment process documented. Multiple customers using the product successfully without founder involvement. Most issues resolved through the product or support documentation rather than engineering intervention. Customer implementations becoming faster over time.",
      useful: "Existing customers are happy, but each deployment still requires bespoke work. The founder or lead engineer is still heavily involved in onboarding. Manual workarounds exist but are well understood. The roadmap to remove these dependencies is clear.",
    },
    notEnough: "“It works for our current customers.” Every implementation feels like a new project. Customers depend on the founder to make the product work. Engineers are regularly patching problems behind the scenes.",
    exitLine: "not enough to proceed — new product, new gates: back to 01",
    earns: "A repeatable product earns the right to scale.",
    thresholdLabel: "Renewal and reference",
    thresholdHint: "What ran without you, and what did it cost when effort was priced honestly? Did the first customer come back, and would they say so publicly?",
    askYourself: [
      "Is the product only working because your engineers are manually fixing problems behind the scenes?",
      "Does it rely on perfectly clean, well-structured data that your customers won't actually have?",
      "Does it require your founders to answer support calls at midnight?",
      "Does every new customer require weeks of custom configuration?",
      "Does the product depend on a third-party data source or API that could disappear tomorrow?",
    ],
  },
];

export const CLOSING = {
  title: "Four decisions",
  paras: [
    "If you answer Proceed four times, one of two things is true. You're at Productisation, or you graded generously.",
    "There's a simple test for which. Give the worksheet, blank, to the person on your team most likely to disagree with you. Compare answers. The gap between them is the most accurate map of where you actually are.",
    "The gates tell you what to prove, not how to prove it. What counts as evidence will differ by market and by product, and that is a judgement call. The one thing that does not flex is deciding what passing looks like before you run the test.",
  ],
  line: "Your idea isn't worth anything until somebody pays for it, repeatedly, without you in the room.",
};

export type Verdict =
  | { kind: "empty" }
  | { kind: "pass" }
  | { kind: "needs-threshold" }
  | { kind: "retry" }
  | { kind: "stop" };

/**
 * Turns what the user has ticked into a decision, using the guide's own logic: strong evidence passes,
 * but only if the bar was declared first; weaker evidence means test again; nothing means stop.
 */
export function verdictFor(selected: Set<LevelId>, threshold: string, touched: boolean): Verdict {
  if (!touched) return { kind: "empty" };
  const strongEnough = selected.has("gold") || selected.has("strong");
  if (strongEnough) return threshold.trim() ? { kind: "pass" } : { kind: "needs-threshold" };
  if (selected.has("useful")) return { kind: "retry" };
  return { kind: "stop" };
}
