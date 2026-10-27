"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronIcon } from "@/components/shared/icons";

export interface Profile {
  id: string;
  label: string;
  description: string;
}

function initials(label: string): string {
  const words = label.split(/\s+/).filter(Boolean);
  return (words.length > 1 ? `${words[0][0]}${words.at(-1)![0]}` : label.slice(0, 2)).toUpperCase();
}

function Avatar({ label }: { label: string }) {
  return (
    <span
      aria-hidden="true"
      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold tracking-wide text-white"
      style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 55%, #0b1020))" }}
    >
      {initials(label)}
    </span>
  );
}

/**
 * Who you are in this company. Switching profile re-runs what is on screen under that profile's permissions,
 * so the same question can be answered in full, with fields withheld, or refused.
 */
export function ProfileMenu({ profiles, currentId, disabled, onSelect }: { profiles: Profile[]; currentId: string; disabled: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = profiles.find((p) => p.id === currentId);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!current) return null;

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="focus-ring card flex items-center gap-2.5 py-1.5 pl-1.5 pr-3 text-left transition-colors enabled:hover:border-accent disabled:opacity-60"
      >
        <Avatar label={current.label} />
        <span className="leading-tight">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-muted">Viewing as</span>
          <span className="block text-sm font-medium">{current.label}</span>
        </span>
        <span className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <ChevronIcon width={16} height={16} />
        </span>
      </button>

      {open && (
        <div role="menu" aria-label="Choose a profile" className="card rise absolute right-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] p-1.5 shadow-[var(--shadow-lift)]">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Switch profile</p>
          {profiles.map((p) => {
            const selected = p.id === currentId;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onSelect(p.id);
                }}
                className={`focus-ring flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${selected ? "bg-accent/8" : "hover:bg-surface-2"}`}
              >
                <Avatar label={p.label} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{p.description}</span>
                </span>
                {selected && (
                  <span className="mt-1 text-accent">
                    <CheckIcon width={16} height={16} strokeWidth={2.6} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
