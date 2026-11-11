import Link from "next/link";
import { LockIcon } from "@/components/shared/icons";
import { projects, type PlaygroundProject, type ProjectSection } from "@/lib/shared/projects";

function Section({ section, className = "" }: { section: ProjectSection; className?: string }) {
  return (
    <div className={className}>
      <h3 className="text-base font-semibold tracking-tight">{section.heading}</h3>
      {section.paragraphs.map((p) => (
        <p key={p.slice(0, 32)} className="mt-2 max-w-[36rem] leading-relaxed text-muted">
          {p}
        </p>
      ))}
    </div>
  );
}

/** The only link on a card: the call to action. The card itself is not clickable. */
function Cta({ project }: { project: PlaygroundProject }) {
  const className = "focus-ring inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white shadow-sm";
  const style = { background: "linear-gradient(135deg, var(--accent), var(--accent-end))" };
  const label = (
    <>
      {project.example.cta}
      <span aria-hidden="true">→</span>
    </>
  );
  return project.href && !project.intro ? (
    // A static build under /public: a plain link, not client-side navigation.
    <a href={project.href} className={className} style={style}>
      {label}
    </a>
  ) : (
    <Link href={project.intro ?? `/${project.slug}`} className={className} style={style}>
      {label}
    </Link>
  );
}

export default function PlaygroundHome() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
        <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-muted backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
          Open-source concept demos and product ideas
        </p>
        <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-tight sm:text-6xl">
          <span className="text-gradient">Ideas you can use,</span>
          <br />
          not just read about.
        </h1>
        <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-accent">Why a playground?</h2>
        <p className="mt-2 max-w-2xl text-lg leading-relaxed text-muted">
          Some ideas are easier to explore when you can interact with them. This is where I turn questions from my work in AI, product and strategy into tools and demonstrations: some about how software and markets might change, others about decisions teams face today.
        </p>

        <ul className="mt-14 space-y-8">
          {projects.map((p) => (
            <li key={p.slug}>
              <article className="card overflow-hidden">
                {/* Compact header: the question, then the concept and format. Height follows the text. */}
                <header
                  className="relative overflow-hidden px-5 py-4 sm:px-6 sm:py-5"
                  style={{ background: "linear-gradient(110deg, #005f69 0%, #007a88 55%, #006f99 100%)" }}
                >
                  <div className="grid-fade pointer-events-none absolute inset-0 opacity-60" style={{ filter: "invert(1)" }} aria-hidden="true" />
                  <h2 className="relative text-xl font-bold leading-tight tracking-tight text-white sm:text-2xl">
                    {p.subtitle.split(" · ")[0]}
                    <span className="ml-2 text-sm font-medium text-white/80 sm:text-base">· {p.subtitle.split(" · ")[1]}</span>
                  </h2>
                  <p className="relative mt-2 text-sm font-medium text-white sm:text-base">{p.headline}</p>
                </header>

                <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-2 md:gap-10">
                  <Section section={p.origin} />
                  <Section section={p.idea} />
                </div>
                {/* Full-width row: the only link on the card. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-5 py-4 sm:px-6">
                  <Cta project={p} />
                  {p.gated && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                      <LockIcon width={14} height={14} />
                      Access required
                    </span>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
