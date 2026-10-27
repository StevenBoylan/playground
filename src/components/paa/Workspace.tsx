"use client";

import { useState } from "react";
import type { Envelope } from "@/lib/paa/schemas/bindings";
import type { ExperienceSpec } from "@/lib/paa/schemas/experience";
import type { Trace } from "@/lib/paa/schemas/trace";
import { DynamicRenderer } from "./DynamicRenderer";

export interface OrganizationSummary {
  id: string;
  name: string;
  domain: string;
  tagline: string;
  accent: string;
  available: boolean;
  roles: { id: string; label: string; description: string }[];
  prompts: { id: string; text: string }[];
}

interface RunResult {
  experience: ExperienceSpec;
  envelope: Envelope;
  trace: Trace;
}

export function Workspace({ organizations }: { organizations: OrganizationSummary[] }) {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [lastPrompt, setLastPrompt] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  const org = organizations.find((o) => o.id === orgId);

  function choose(id: string) {
    const next = organizations.find((o) => o.id === id);
    // Switching organizations isolates everything: role, results and trace are all reset.
    setOrgId(id);
    setRoleId(next?.roles[0]?.id ?? "");
    setResult(null);
    setError(null);
    setLastPrompt(null);
  }

  async function run(promptId: string, role = roleId) {
    if (!org) return;
    setLoading(true);
    setError(null);
    setLastPrompt(promptId);
    try {
      const res = await fetch("/api/paa/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: org.id, roleId: role, promptId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setResult(body as RunResult);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  if (!org) {
    return (
      <section aria-labelledby="pick-org">
        <h2 id="pick-org" className="text-lg font-semibold">
          Choose a fictional company
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {organizations.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={!o.available}
                onClick={() => choose(o.id)}
                className="h-full w-full rounded-lg border border-neutral-300 p-4 text-left enabled:hover:border-neutral-500 disabled:opacity-60 dark:border-neutral-700"
                style={{ borderTopColor: o.accent, borderTopWidth: 4 }}
              >
                <span className="block font-semibold">{o.name}</span>
                <span className="mt-1 block text-sm text-neutral-600 dark:text-neutral-400">{o.domain}</span>
                <span className="mt-2 block text-sm">{o.tagline}</span>
                {!o.available && <span className="mt-2 block text-xs font-medium">Coming soon</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div style={{ ["--accent" as string]: org.accent }}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-300 pb-4 dark:border-neutral-700">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "var(--accent)" }}>
            {org.name}
          </h2>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Fictional company. All data is synthetic.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            View as
            <select
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                if (lastPrompt) void run(lastPrompt, e.target.value);
              }}
              className="rounded border border-neutral-300 bg-transparent px-2 py-1 dark:border-neutral-700"
            >
              {org.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setOrgId(null)} className="text-sm underline">
            Switch company
          </button>
        </div>
      </div>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {org.roles.find((r) => r.id === roleId)?.description}
      </p>

      <section className="mt-6" aria-labelledby="prompts">
        <h3 id="prompts" className="text-sm font-semibold">
          Try a request
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {org.prompts.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => void run(p.id)}
                disabled={loading}
                aria-pressed={lastPrompt === p.id}
                className="rounded-full border border-neutral-300 px-3 py-1.5 text-left text-sm hover:border-neutral-500 aria-pressed:border-[var(--accent)] aria-pressed:font-medium dark:border-neutral-700"
              >
                {p.text}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6" aria-live="polite" aria-busy={loading}>
        {loading && <p className="text-sm">Selecting capabilities, fetching data and composing the view…</p>}
        {error && (
          <p role="alert" className="rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900">
            {error}
          </p>
        )}
        {!loading && !result && !error && (
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Pick a request to build a view.</p>
        )}
        {result && !loading && (
          <>
            <DynamicRenderer experience={result.experience} envelope={result.envelope} />
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowTrace((s) => !s)}
                aria-expanded={showTrace}
                className="text-sm font-medium underline"
              >
                {showTrace ? "Hide" : "Show"} how PAA built this
              </button>
              {showTrace && (
                <pre className="mt-3 max-h-96 overflow-auto rounded border border-neutral-300 p-3 text-xs dark:border-neutral-700">
                  {JSON.stringify(result.trace, null, 2)}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
