import { authorizeAccess } from "../policies/authorize";
import type { Session } from "../schemas/capability";
import type { ExecutionRecord } from "../schemas/trace";
import { buildPdf } from "../documents/pdf";
import { buildPptx } from "../documents/pptx";
import { MIME, slugify, type Deliverable, type DocKind, type ResolvedDocument } from "../documents/types";

const ACTION_NAME: Record<DocKind, string> = { pdf: "export_pdf", pptx: "build_deck", email: "draft_email" };
const PERMISSION_NAME: Record<DocKind, string> = { pdf: "pdf", pptx: "pptx", email: "email" };

/** Actions are capabilities too: same registry-style id, same permission model, same audit record. */
export function actionCapability(organizationId: string, kind: DocKind) {
  return {
    id: `${organizationId}.action.${ACTION_NAME[kind]}`,
    organizationId,
    requiredPermission: `${organizationId}.action.${PERMISSION_NAME[kind]}`,
  };
}

export interface ActionOutcome {
  record: ExecutionRecord;
  deliverable?: Deliverable;
}

/**
 * Runs a document action: authorize first, generate only if allowed, and record what happened.
 * Email is simulated. It produces an on-screen draft and never sends anything.
 */
export async function runAction(session: Session, document: ResolvedDocument): Promise<ActionOutcome> {
  const started = performance.now();
  const capability = actionCapability(session.organizationId, document.kind);
  const params = { kind: document.kind, title: document.title, blocks: document.blocks.length };
  const done = (partial: Pick<ExecutionRecord, "status"> & Partial<ExecutionRecord>, checks = access.checks): ExecutionRecord => ({
    capabilityId: capability.id,
    params,
    policyChecks: checks,
    durationMs: Math.round(performance.now() - started),
    warnings: [],
    ...partial,
  });

  const access = authorizeAccess(session, capability);
  if (!access.allowed) return { record: done({ status: "denied", error: access.checks.at(-1)?.detail ?? "Denied" }) };

  try {
    if (document.kind === "email") {
      return {
        record: done({ status: "ok", resultSummary: "draft shown on screen; nothing was sent" }),
        deliverable: { kind: "email", document },
      };
    }
    const bytes = document.kind === "pdf" ? await buildPdf(document) : await buildPptx(document);
    const filename = `${slugify(document.title)}.${document.kind}`;
    return {
      record: done({ status: "ok", resultSummary: `${filename}, ${Math.round(bytes.length / 1024)} KB` }),
      deliverable: { kind: document.kind, document, file: { filename, mime: MIME[document.kind], base64: Buffer.from(bytes).toString("base64") } },
    };
  } catch (error) {
    console.error("[paa] document generation failed:", error);
    return { record: done({ status: "error", error: "The document could not be generated" }) };
  }
}
