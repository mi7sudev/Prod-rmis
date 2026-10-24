import { Compass } from "lucide-react";

// ============================================================================
// RMIS — 404 boundary (audit 2026-10-22): unmatched routes get a branded
// recovery page instead of a bare Next.js default.
// ============================================================================

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-cloud/70 text-stone">
        <Compass className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-lg font-medium text-ink">Page not found</h1>
        <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-body-gray">
          The page you are looking for does not exist or has moved. Head back
          to the home page to continue.
        </p>
      </div>
      <a
        href="/#/"
        className="inline-flex min-h-[44px] items-center rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        Go home
      </a>
    </div>
  );
}
