"use client";

// ============================================================================
// RMIS — Applicant home loading skeleton. Extracted verbatim from
// applicant-home.tsx (architecture candidate ⑥).
// ============================================================================

// Mirrors the layout at both breakpoints: phones see the compact banner +
// applications list; lg+ sees [Job Openings hero + stat cards | mini profile
// + applications rail], then the bookmark carousel.

export function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skel h-52 rounded-3xl lg:hidden" />
      <div className="hidden space-y-6 lg:grid lg:grid-cols-12 lg:gap-8">
        <div className="space-y-5 lg:col-span-7">
          <div className="skel h-56 rounded-3xl" />
          <div className="grid grid-cols-2 gap-5">
            {[0, 1].map((i) => (
              <div key={i} className="dlg-card flex items-center gap-3 rounded-2xl p-4">
                <div className="skel h-11 w-11 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skel h-3 w-16" />
                  <div className="skel h-4 w-24" />
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            <div className="skel h-6 w-44" />
            {[0, 1].map((i) => (
              <div key={i} className="skel h-36 rounded-xl" />
            ))}
          </div>
        </div>
        <div className="space-y-5 lg:col-span-5">
          <div className="skel h-44 rounded-2xl" />
          <div className="space-y-4">
            <div className="skel h-6 w-40" />
            {[0, 1].map((i) => (
              <div key={i} className="skel h-48" />
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4 lg:hidden">
        <div className="skel h-6 w-40" />
        {[0, 1].map((i) => (
          <div key={i} className="skel h-56" />
        ))}
      </div>
    </div>
  );
}
