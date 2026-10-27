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

/** The branding skill is a capability too, so applying a company's look is authorized and recorded like any action. */
export function brandingCapability(organizationId: string) {
  return {
    id: `${organizationId}.action.apply_branding`,
    organizationId,
    requiredPermission: `${organizationId}.action.branding`,
  };
}

export interface BrandingDecision {
  /** Whether the documents in this request carry the company's branding. */
  branded: boolean;
  /** Present when branding was asked for: what the policy layer decided. */
  record?: ExecutionRecord;
}

/** Authorizes the branding skill. A role without it still gets its documents, just plain. */
export function applyBranding(session: Session, wanted: boolean): BrandingDecision {
  if (!wanted) return { branded: false };
  const started = performance.now();
  const capability = brandingCapability(session.organizationId);
  const access = authorizeAccess(session, capability);
  const base = { capabilityId: capability.id, params: { branded: true }, policyChecks: access.checks, durationMs: Math.round(performance.now() - started), warnings: [] };
  if (!access.allowed) return { branded: false, record: { ...base, status: "denied", error: access.checks.at(-1)?.detail ?? "Denied" } };
  return { branded: true, record: { ...base, status: "ok", resultSummary: "company name, colour and footer applied" } };
}

export interface ActionOutcome {
  record: ExecutionRecord;
  deliverable?: Deliverable;
}

/**
 * Runs a document action: authorize first, generate only if allowed, and record what happened.
 * Email produces an on-screen draft.
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
        record: done({ status: "ok", resultSummary: "draft shown on screen" }),
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
