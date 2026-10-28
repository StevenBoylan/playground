import type { ReactNode } from "react";
import { BoxIcon, CogIcon, FrameworkIcon, MegaphoneIcon, SparklesIcon } from "@/components/shared/icons";
import { TAG_LABELS, type ProjectTag } from "@/lib/shared/projects";

const ICONS: Record<ProjectTag, ReactNode> = {
  ai: <SparklesIcon width={14} height={14} />,
  software: <CogIcon width={14} height={14} />,
  marketing: <MegaphoneIcon width={14} height={14} />,
  framework: <FrameworkIcon width={14} height={14} />,
  product: <BoxIcon width={14} height={14} />,
};

/** What a demo is about: a short row of pills, each with an icon and a text label. */
export function ProjectTags({ tags }: { tags: ProjectTag[] }) {
  return (
    <ul className="mt-4 flex flex-wrap gap-2" aria-label="Topics">
      {tags.map((t) => (
        <li key={t} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
          <span className="text-accent">{ICONS[t]}</span>
          {TAG_LABELS[t]}
        </li>
      ))}
    </ul>
  );
}
