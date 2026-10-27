import type { DocBlock, ResolvedDocument } from "./types";

export const MAX_SLIDES = 12;

export interface Slide {
  kind: "title" | "content";
  title: string;
  subtitle?: string;
  blocks: DocBlock[];
}

/**
 * One slide plan shared by the real PPTX generator and the on-screen slide preview, so what is previewed is
 * exactly what the file contains.
 */
export function buildSlides(doc: ResolvedDocument): Slide[] {
  const slides: Slide[] = [{ kind: "title", title: doc.title, subtitle: doc.subtitle ?? doc.brand.name, blocks: [] }];
  let current: Slide | undefined;
  let textWeight = 0;

  const start = (title: string) => {
    current = { kind: "content", title, blocks: [] };
    textWeight = 0;
    slides.push(current);
  };

  for (const block of doc.blocks) {
    if (block.type === "heading") {
      start(block.text);
      continue;
    }
    if (block.type === "chart" || block.type === "table") {
      slides.push({ kind: "content", title: block.title, blocks: [block] });
      current = undefined;
      continue;
    }
    // Text-like blocks accumulate on the current slide, spilling onto a continuation when it fills up.
    const weight = block.type === "bullets" ? block.items.length : block.type === "kpi" ? 1 : Math.ceil(block.text.length / 180);
    if (!current) start("Overview");
    else if (textWeight + weight > 6) start(`${current.title} (continued)`);
    current!.blocks.push(block);
    textWeight += weight;
  }
  return slides.slice(0, MAX_SLIDES);
}
