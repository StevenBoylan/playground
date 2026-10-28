import Link from "next/link";
import { ArrowRightIcon, LayersIcon } from "@/components/shared/icons";
import { projects } from "@/lib/shared/projects";

export default function PlaygroundHome() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Open-source concept demos
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          <span className="text-gradient">Ideas you can use,</span>
          <br />
          not just read about.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
          A small collection of working prototypes exploring how software could behave when AI, trusted services and policy work together.
        </p>

        <ul className="mt-14 grid gap-5 sm:grid-cols-2">
          {projects.map((p) => {
            const cardClass = "card card-lift focus-ring group block h-full overflow-hidden";
            const inner = (
              <>
                <div
                  className="relative h-36 overflow-hidden"
                  style={{ background: "linear-gradient(110deg, #006d77 0%, #008a98 55%, #007fad 100%)" }}
                  aria-hidden="true"
                >
                  <div className="grid-fade absolute inset-0 opacity-60" style={{ filter: "invert(1)" }} />
                  <div className="absolute bottom-4 left-5 flex items-center gap-2 text-white/90">
                    <LayersIcon width={22} height={22} />
                    <span className="text-sm font-medium">Interactive demo</span>
                  </div>
                </div>
                <div className="p-6">
                  <h2 className="text-xl font-semibold tracking-tight">{p.name}</h2>
                  <p className="mt-1 font-medium text-accent">{p.tagline}</p>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{p.description}</p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-1">
                    Open the demo <ArrowRightIcon width={16} height={16} />
                  </span>
                </div>
              </>
            );
            return (
              <li key={p.slug}>
                {p.href ? (
                  // A static build under /public: a plain link, not client-side navigation.
                  <a href={p.href} className={cardClass}>
                    {inner}
                  </a>
                ) : (
                  <Link href={`/${p.slug}`} className={cardClass}>
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </main>
  );
}
