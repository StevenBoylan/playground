/**
 * Things a visitor might simply say, shown in the Help panel. They are examples of ad-hoc requests, not
 * features: each goes through the same path as anything typed.
 */
const PLACEHOLDER_DECK = "Make a branded pptx with this text: Lorem ipsum dolor sit amet, consectetur adipiscing elit";

const IDEAS: Record<string, string[]> = {
  northstar: [
    "How has downtime changed by quarter over the last two years?",
    "Which factory improved its defect rate the most since 2023?",
    "Compare last year's production with this year's, by factory",
    "Show Gdansk downtime by cause in early 2024",
    PLACEHOLDER_DECK,
  ],
  orbit: [
    "Which plan has grown MRR the fastest since 2024?",
    "How has churn changed by quarter over the last two years?",
    "Which features do Enterprise customers use least?",
    "Show billing tickets around the billing migration in early 2024",
    PLACEHOLDER_DECK,
  ],
};

export function ideasFor(organizationId: string): string[] {
  return IDEAS[organizationId] ?? [PLACEHOLDER_DECK];
}
