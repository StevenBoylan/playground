"use client";

import { useEffect, useRef, useState } from "react";
import { SendIcon, SparklesIcon } from "@/components/shared/icons";

interface IntentBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  /** Example intents shown as ghost text. Tab accepts the one on screen. */
  suggestions: string[];
  /** A slim bar once a view exists; a large, centred one when the screen is empty. */
  compact: boolean;
  placeholderPrefix?: string;
}

const ROTATE_MS = 4500;

/**
 * The one control. There are no suggestion buttons: examples appear as ghost text that cycles, and Tab (or a
 * quiet "try an example" link on touch screens) fills the field. Everything else is just asking.
 */
export function IntentBar({ value, onChange, onSubmit, disabled, suggestions, compact, placeholderPrefix = "Try: " }: IntentBarProps) {
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const empty = value === "";
  const current = suggestions.length > 0 ? suggestions[index % suggestions.length] : "";

  useEffect(() => {
    if (!empty || disabled || suggestions.length < 2) return;
    const timer = setInterval(() => setIndex((i) => i + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [empty, disabled, suggestions.length]);

  const accept = () => {
    if (!current) return;
    onChange(current);
    input.current?.focus();
  };

  return (
    <div>
      <form
        className={`card flex items-center gap-3 transition-shadow focus-within:border-accent ${
          compact ? "p-1.5 pl-4" : "p-2.5 pl-5 shadow-[0_0_0_6px_color-mix(in_srgb,var(--accent)_9%,transparent),var(--shadow-lift)]"
        }`}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span className="text-accent" aria-hidden="true">
          <SparklesIcon width={compact ? 20 : 24} height={compact ? 20 : 24} />
        </span>
        <label htmlFor="intent" className="sr-only">
          What would you like to see?
        </label>
        <input
          id="intent"
          ref={input}
          value={value}
          maxLength={500}
          disabled={disabled}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && !e.shiftKey && empty && current) {
              e.preventDefault();
              accept();
            }
          }}
          placeholder={current ? `${placeholderPrefix}${current}` : "Ask for anything…"}
          className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted/80 ${compact ? "py-2.5 text-base" : "py-3.5 text-lg"}`}
        />
        {empty && current && (
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface-2 px-2 py-1 font-mono text-[11px] text-muted sm:inline-block" aria-hidden="true">
            Tab
          </kbd>
        )}
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={`focus-ring inline-flex shrink-0 items-center gap-2 rounded-xl font-semibold text-white shadow-sm transition-opacity disabled:opacity-40 ${
            compact ? "px-4 py-2.5 text-sm" : "px-5 py-3 text-base"
          }`}
          style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-end))" }}
        >
          Build
          <SendIcon width={16} height={16} />
        </button>
      </form>
      {!compact && current && (
        <p className="mt-3 text-center text-xs text-muted">
          <span className="hidden sm:inline">
            Press <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px]">Tab</kbd> to use the example, or just type.{" "}
          </span>
          <button type="button" onClick={accept} disabled={disabled} className="focus-ring rounded underline decoration-dotted underline-offset-4 hover:text-ink sm:hidden">
            Try an example
          </button>
        </p>
      )}
    </div>
  );
}
