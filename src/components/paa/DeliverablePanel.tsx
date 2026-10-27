"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { CheckIcon, CloseIcon, DownloadIcon, FileIcon, MailIcon, SlidesIcon } from "@/components/shared/icons";
import { chartDataUri } from "@/lib/paa/documents/chart-svg";
import { buildSlides, type Slide } from "@/lib/paa/documents/slides";
import type { Brand, Deliverable, DocBlock } from "@/lib/paa/documents/types";

function useBlobUrl(file: Deliverable["file"]): string | null {
  const url = useMemo(() => {
    if (!file) return null;
    const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: file.mime }));
  }, [file]);
  useEffect(() => () => (url ? URL.revokeObjectURL(url) : undefined), [url]);
  return url;
}

const kb = (base64: string) => Math.max(1, Math.round((base64.length * 3) / 4 / 1024));

// --- Shared block rendering (light, document-style; used by the email and the slide previews) --------------------

function ChartImage({ block, accent }: { block: Extract<DocBlock, { type: "chart" }>; accent: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt={block.title} src={chartDataUri({ chart: block.chart, labels: block.labels, values: block.values, format: block.format, accent })} className="block w-full" />;
}

function EmailBlocks({ blocks, brand }: { blocks: DocBlock[]; brand: Brand }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "kpi") {
      const group = [b];
      while (blocks[i + 1]?.type === "kpi") group.push(blocks[++i] as Extract<DocBlock, { type: "kpi" }>);
      out.push(
        <div key={i} className="my-4 flex flex-wrap gap-3">
          {group.map((k, j) => (
            <div key={j} className="min-w-[9rem] flex-1 rounded-lg border border-neutral-200 bg-neutral-50 p-3" style={{ borderTop: `3px solid ${brand.accent}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{k.title}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums" style={{ color: brand.accent }}>
                {k.value}
              </p>
            </div>
          ))}
        </div>,
      );
      continue;
    }
    if (b.type === "heading") out.push(<h3 key={i} className="mb-1 mt-5 text-base font-semibold text-neutral-900">{b.text}</h3>);
    else if (b.type === "paragraph") out.push(<p key={i} className="my-3 text-sm leading-relaxed text-neutral-800">{b.text}</p>);
    else if (b.type === "bullets")
      out.push(
        <ul key={i} className="my-3 list-disc space-y-1 pl-5 text-sm text-neutral-800">
          {b.items.map((t, j) => (
            <li key={j}>{t}</li>
          ))}
        </ul>,
      );
    else if (b.type === "chart")
      out.push(
        <figure key={i} className="my-4 overflow-hidden rounded-lg border border-neutral-200">
          <figcaption className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700">{b.title}</figcaption>
          <ChartImage block={b} accent={brand.accent} />
        </figure>,
      );
    else if (b.type === "table")
      out.push(
        <div key={i} className="my-4 overflow-x-auto rounded-lg border border-neutral-200">
          <p className="border-b border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-700">{b.title}</p>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-neutral-500">
                {b.columns.map((c, j) => (
                  <th key={j} className={`px-3 py-1.5 font-semibold ${c.numeric ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.slice(0, 8).map((r, j) => (
                <tr key={j} className="border-t border-neutral-100 text-neutral-800">
                  {r.map((cell, k) => (
                    <td key={k} className={`px-3 py-1.5 ${b.columns[k]?.numeric ? "text-right tabular-nums" : k === 0 ? "font-medium" : ""}`}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
  }
  return <>{out}</>;
}

// --- Email ---------------------------------------------------------------------------------------------------

function EmailPreview({ deliverable }: { deliverable: Deliverable }) {
  const { document: doc } = deliverable;
  const [state, setState] = useState<"draft" | "sent" | "discarded">("draft");
  const email = doc.email;
  if (!email) return null;
  const attachments = email.attachments ?? [];

  if (state !== "draft") {
    return (
      <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-good/15 text-good">
          {state === "sent" ? <CheckIcon width={22} height={22} strokeWidth={2.4} /> : <CloseIcon width={22} height={22} />}
        </span>
        <p className="font-semibold">{state === "sent" ? "Message sent" : "Draft discarded"}</p>
        <button type="button" onClick={() => setState("draft")} className="focus-ring mt-2 rounded-lg border border-line px-3 py-1.5 text-sm font-medium hover:border-accent">
          Reopen draft
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white text-neutral-900 shadow-[var(--shadow-lift)]" role="group" aria-label="Email draft">
      <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-100 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <i className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <i className="h-3 w-3 rounded-full bg-[#28c840]" />
        </span>
        <p className="mx-auto truncate text-xs font-medium text-neutral-600">New message{email.subject ? ` — ${email.subject}` : ""}</p>
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-y-1.5 border-b border-neutral-200 px-5 py-3 text-sm">
        <dt className="text-neutral-500">From</dt>
        <dd className="truncate">{email.from}</dd>
        <dt className="text-neutral-500">To</dt>
        <dd className="flex flex-wrap gap-1.5">
          {email.to.map((t) => (
            <span key={t} className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs">
              {t}
            </span>
          ))}
        </dd>
        <dt className="text-neutral-500">Subject</dt>
        <dd className="font-medium">{email.subject}</dd>
        {attachments.length > 0 && (
          <>
            <dt className="text-neutral-500">Attached</dt>
            <dd className="flex flex-wrap gap-1.5">
              {attachments.map((a) => (
                <span key={a.filename} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium">
                  <FileIcon width={14} height={14} />
                  {a.filename}
                </span>
              ))}
            </dd>
          </>
        )}
      </dl>
      <div className="max-h-[34rem] overflow-y-auto px-5 py-4">
        <h2 className="text-lg font-semibold" style={{ color: doc.brand.accent }}>
          {doc.title}
        </h2>
        {doc.subtitle && <p className="text-xs text-neutral-500">{doc.subtitle}</p>}
        <EmailBlocks blocks={doc.blocks} brand={doc.brand} />
        <p className="mt-6 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
          {doc.brand.shortName} Reporting
          <br />
          {doc.brand.footer}
        </p>
      </div>
      <div className="flex items-center justify-end gap-3 border-t border-neutral-200 bg-neutral-50 px-5 py-3">
        <span className="flex gap-2">
          <button type="button" onClick={() => setState("discarded")} className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-200">
            Discard
          </button>
          <button
            type="button"
            onClick={() => setState("sent")}
            className="focus-ring rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: doc.brand.accent }}
          >
            Send
          </button>
        </span>
      </div>
    </div>
  );
}

// --- Slides --------------------------------------------------------------------------------------------------

/** All sizes use container-query units, so each slide scales to its card like a thumbnail of the real file. */
const cq = (n: number): CSSProperties["fontSize"] => `${n}cqw`;

function SlideCard({ slide, index, brand }: { slide: Slide; index: number; brand: Brand }) {
  const frame: CSSProperties = { containerType: "inline-size" };
  if (slide.kind === "title") {
    return (
      <div className="aspect-video overflow-hidden rounded-lg border border-line shadow-sm" style={{ ...frame, background: brand.accent }}>
        <div className="flex h-full flex-col justify-center text-white" style={{ padding: cq(6) }}>
          <p className="font-semibold uppercase tracking-widest" style={{ fontSize: cq(2) }}>
            {brand.name}
          </p>
          <p className="mt-[3cqw] font-bold leading-tight" style={{ fontSize: cq(5.4) }}>
            {slide.title}
          </p>
          {slide.subtitle && (
            <p className="mt-[2cqw] opacity-90" style={{ fontSize: cq(2.6) }}>
              {slide.subtitle}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="relative aspect-video overflow-hidden rounded-lg border border-line bg-white text-neutral-900 shadow-sm" style={frame}>
      <span className="absolute inset-x-0 top-0" style={{ height: cq(1.2), background: brand.accent }} />
      <div style={{ padding: `${cq(4)} ${cq(4.5)}` }}>
        <p className="font-bold leading-tight" style={{ fontSize: cq(3.4) }}>
          {slide.title}
        </p>
        <span className="mt-[1cqw] block" style={{ height: cq(0.6), width: cq(6), background: brand.accent }} />
        <div style={{ marginTop: cq(2.4), fontSize: cq(2) }} className="space-y-[1.2cqw]">
          {slide.blocks.map((b, i) => {
            if (b.type === "paragraph") return <p key={i} className="leading-snug">{b.text}</p>;
            if (b.type === "bullets")
              return (
                <ul key={i} className="list-disc pl-[3cqw]">
                  {b.items.map((t, j) => (
                    <li key={j}>{t}</li>
                  ))}
                </ul>
              );
            if (b.type === "kpi")
              return (
                <span key={i} className="mr-[1.5cqw] inline-block rounded-md bg-neutral-100 align-top" style={{ padding: cq(1.4), borderTop: `${cq(0.5)} solid ${brand.accent}` }}>
                  <span className="block font-semibold uppercase text-neutral-500" style={{ fontSize: cq(1.3) }}>
                    {b.title}
                  </span>
                  <span className="block font-bold" style={{ fontSize: cq(3.2), color: brand.accent }}>
                    {b.value}
                  </span>
                </span>
              );
            if (b.type === "chart")
              return (
                // The chart image is 560x260; this width keeps its whole height inside the slide.
                <div key={i} style={{ width: cq(70), marginTop: cq(-0.5) }} className="mx-auto">
                  <ChartImage block={b} accent={brand.accent} />
                </div>
              );
            if (b.type === "table")
              return (
                <table key={i} className="w-full text-left" style={{ fontSize: cq(1.5) }}>
                  <thead>
                    <tr className="bg-neutral-100 text-neutral-500">
                      {b.columns.map((c, j) => (
                        <th key={j} className={`px-[1cqw] py-[0.6cqw] ${c.numeric ? "text-right" : ""}`}>
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(0, 7).map((r, j) => (
                      <tr key={j} className="border-t border-neutral-100">
                        {r.map((cell, k) => (
                          <td key={k} className={`px-[1cqw] py-[0.6cqw] ${b.columns[k]?.numeric ? "text-right" : "font-medium"}`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            return null;
          })}
        </div>
      </div>
      <p className="absolute text-neutral-400" style={{ bottom: cq(1.4), right: cq(2.4), fontSize: cq(1.4) }}>
        {index + 1}
      </p>
    </div>
  );
}

function SlidePreview({ deliverable }: { deliverable: Deliverable }) {
  const slides = useMemo(() => buildSlides(deliverable.document), [deliverable.document]);
  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Slide previews">
      {slides.map((s, i) => (
        <li key={i}>
          <SlideCard slide={s} index={i} brand={deliverable.document.brand} />
        </li>
      ))}
    </ul>
  );
}

// --- Panel ---------------------------------------------------------------------------------------------------

const META = {
  pdf: { label: "PDF report", icon: <FileIcon width={20} height={20} /> },
  pptx: { label: "Slide deck", icon: <SlidesIcon width={20} height={20} /> },
  email: { label: "Email draft", icon: <MailIcon width={20} height={20} /> },
} as const;

/** The output of an action: a real file with a preview, or an email draft. */
export function DeliverablePanel({ deliverable, onClose }: { deliverable: Deliverable; onClose: () => void }) {
  const url = useBlobUrl(deliverable.file);
  const meta = META[deliverable.kind];
  return (
    <section className="card rise overflow-hidden" aria-label={meta.label}>
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{deliverable.document.title}</h3>
          <p className="truncate text-xs text-muted">
            {meta.label}
            {deliverable.file ? ` · ${deliverable.file.filename} · ${kb(deliverable.file.base64)} KB` : ""}
          </p>
        </div>
        {url && deliverable.file && (
          <a
            href={url}
            download={deliverable.file.filename}
            className="focus-ring inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm"
            style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #7c3aed))" }}
          >
            <DownloadIcon width={16} height={16} />
            Download
          </a>
        )}
        <button type="button" onClick={onClose} aria-label="Close output" className="focus-ring grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink">
          <CloseIcon width={18} height={18} />
        </button>
      </header>
      <div className="bg-surface-2/60 p-4 sm:p-5">
        {deliverable.kind === "pdf" && url && (
          <iframe src={url} title={`${deliverable.document.title} (PDF preview)`} className="h-[42rem] w-full rounded-lg border border-line bg-white" />
        )}
        {deliverable.kind === "pptx" && <SlidePreview deliverable={deliverable} />}
        {deliverable.kind === "email" && <EmailPreview deliverable={deliverable} />}
      </div>
    </section>
  );
}
