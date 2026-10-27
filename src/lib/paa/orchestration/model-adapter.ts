import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { ModelPlanSchema, type ModelPlan } from "./plan";
import { buildRepairMessage, buildSystemPrompt, buildUserMessage, type PlanContext } from "./prompt";

export interface PlanRequest {
  organizationId: string;
  text: string;
  context?: PlanContext;
  /** Set on the single retry: the invalid plan and what was wrong with it. */
  repair?: { previous: ModelPlan; errors: string[] };
}

export interface ModelAdapter {
  plan(request: PlanRequest, signal?: AbortSignal): Promise<ModelPlan>;
}

export type ModelErrorKind = "unavailable" | "refused" | "invalid" | "timeout";

/** Failures from the model layer. Messages are safe to show; details stay in server logs. */
export class ModelError extends Error {
  constructor(
    message: string,
    readonly kind: ModelErrorKind,
  ) {
    super(message);
  }
}

const DEFAULT_MODEL = "claude-sonnet-5-5";
const MAX_OUTPUT_TOKENS = 8000;

export class AnthropicModelAdapter implements ModelAdapter {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    // Reads ANTHROPIC_API_KEY from the environment unless one is injected. The key never reaches the browser.
    this.client = new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: 60_000 });
    this.model = options.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;
  }

  async plan(request: PlanRequest, signal?: AbortSignal): Promise<ModelPlan> {
    const userMessage = buildUserMessage(request.text, request.context);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userMessage }];
    if (request.repair) {
      messages.push(
        { role: "assistant", content: JSON.stringify(request.repair.previous) },
        { role: "user", content: buildRepairMessage(request.repair.errors) },
      );
    }

    const params = {
      model: this.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      // The system prompt is stable per organization, so it is cached between requests.
      system: [{ type: "text" as const, text: buildSystemPrompt(request.organizationId), cache_control: { type: "ephemeral" as const } }],
      messages,
      output_config: { effort: "low" as const, format: zodOutputFormat(ModelPlanSchema) },
    };

    try {
      const response = await this.call(params, signal);
      if (response.stop_reason === "refusal") throw new ModelError("The model declined this request.", "refused");
      if (response.stop_reason === "max_tokens") throw new ModelError("The model's answer was cut off.", "invalid");
      if (!response.parsed_output) throw new ModelError("The model returned an unusable plan.", "invalid");
      return response.parsed_output;
    } catch (error) {
      if (error instanceof ModelError) throw error;
      if (signal?.aborted || error instanceof Anthropic.APIUserAbortError) {
        throw new ModelError("The model took too long to respond.", "timeout");
      }
      if (error instanceof Anthropic.APIConnectionTimeoutError) {
        throw new ModelError("The model took too long to respond.", "timeout");
      }
      console.error("[paa] model call failed:", error instanceof Error ? error.message : error);
      throw new ModelError("The AI service is unavailable right now.", "unavailable");
    }
  }

  /** Tries server-side refusal fallback first; if the API rejects that option, retries without it. */
  private async call(params: Parameters<Anthropic["messages"]["parse"]>[0], signal?: AbortSignal) {
    try {
      return await this.client.beta.messages.parse(
        { ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } as Parameters<
          Anthropic["beta"]["messages"]["parse"]
        >[0],
        { signal },
      );
    } catch (error) {
      if (!(error instanceof Anthropic.BadRequestError)) throw error;
      console.warn("[paa] fallback option rejected; retrying without it");
      return this.client.messages.parse(params, { signal });
    }
  }
}

/** The live model, or undefined when no API key is configured (the demo then uses curated requests). */
export function getModelAdapter(): ModelAdapter | undefined {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicModelAdapter() : undefined;
}
