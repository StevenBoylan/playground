import { Suspense } from "react";
import { UnlockForm } from "@/components/shared/UnlockForm";

export const metadata = { title: "Unlock the demo", robots: { index: false, follow: false } };

export default function UnlockPage() {
  return (
    <main className="relative">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-6xl px-4 pb-24 pt-20 sm:px-6 sm:pt-28">
        <Suspense fallback={null}>
          <UnlockForm />
        </Suspense>
      </div>
    </main>
  );
}
