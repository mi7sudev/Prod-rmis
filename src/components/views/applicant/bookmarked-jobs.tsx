"use client";

// ============================================================================
// RMIS — Bookmarked Jobs (desktop, lg+ only). Extracted verbatim from
// applicant-home.tsx (architecture candidate ⑥). Cards are THE SAME row
// card the Job Opportunities board uses (exported JobListCard) minus the
// quick-view dropdown; selecting a card deep-links into the board with that
// posting preselected; the gold Applied pill shows when an application
// exists; the bookmark toggle uses the shared client store.
// ============================================================================

import { ArrowRight, Bookmark } from "lucide-react";
import { IconChip } from "@/components/ui/shell";
import { navigate, type JobWire } from "@/lib/router";
import { JobListCard as BoardJobCard } from "@/components/views/jobs/applicant-jobs-board";

export function BookmarkedJobs({
  savedJobs,
  saved,
  appliedJobIds,
  onToggleSave,
}: {
  savedJobs: JobWire[];
  saved: number[];
  appliedJobIds: Set<number>;
  onToggleSave: (id: number) => void;
}) {
  return (
    <section id="bookmarked-jobs" aria-labelledby="bookmarked-jobs-title" className="hidden scroll-mt-24 lg:block lg:flex lg:flex-1 lg:min-h-0 lg:flex-col">
      <h2 id="bookmarked-jobs-title" className="font-display text-xl font-medium tracking-[0.01em] text-ink sm:text-2xl">
        Bookmarked Jobs
      </h2>
      {savedJobs.length === 0 ? (
        <div className="mt-4 flex flex-col items-start gap-3 rounded-2xl border border-dashed border-divider bg-fog/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <IconChip icon={Bookmark} tone="rose" size={36} iconSize={16} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-ink">No bookmarked jobs yet</p>
              <p className="mt-0.5 text-sm text-stone">
                Tap the bookmark icon on any posting to pin it here for quick access.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate("job-opportunities")}
            className="dlg-ghost focus-ring inline-flex min-h-[44px] w-fit shrink-0 items-center gap-2 px-5 py-2 text-sm"
          >
            Browse Jobs <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4 overflow-y-auto scroll-thin pb-1 pr-1 lg:min-h-[160px] lg:flex-1">
          {savedJobs.map((j) => (
            <BoardJobCard
              key={j.id}
              job={j}
              saved={saved.includes(j.id)}
              applied={appliedJobIds.has(j.id)}
              interactive
              onSelect={() => navigate("job-opportunities", { job: String(j.id) })}
              onSave={() => onToggleSave(j.id)}
              onOpenDetails={() => navigate("job-opportunities", { job: String(j.id) })}
            />
          ))}
        </div>
      )}
    </section>
  );
}
