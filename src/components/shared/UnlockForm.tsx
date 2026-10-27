"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, LockIcon } from "@/components/shared/icons";

/** Only ever send a visitor back into the demo itself. */
function destination(requested: string | null): string {
  return requested && /^\/paa(\/|$|\?)/.test(requested) && !requested.includes("//") ? requested : "/paa";
}

export function UnlockForm() {
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.assign(destination(params.get("next")));
        return;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong. Please try again.");
      setPassword("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="card mx-auto w-full max-w-md p-7"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/12 text-accent">
        <LockIcon width={22} height={22} />
      </span>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">This demo is private</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Enter the access password to continue. If you were sent here from a talk or a demo, the password came with the invitation.
      </p>

      <label htmlFor="password" className="mt-6 block text-xs font-semibold uppercase tracking-wider text-muted">
        Password
      </label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={password}
        maxLength={200}
        disabled={busy}
        onChange={(e) => setPassword(e.target.value)}
        className="focus-ring mt-2 w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-base"
      />

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !password}
        className="focus-ring mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm transition-opacity disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #7c3aed))" }}
      >
        Unlock
        <ArrowRightIcon width={16} height={16} />
      </button>
    </form>
  );
}
