"use client";

// ============================================================================
// RMIS — Profile builder · the edit-session header control pair (Task 27,
// user direction): while a section is being edited the header carries
//   desktop (sm+)   →  [Cancel]  [Done Editing]   side by side
//   mobile (<sm)    →  [Done Editing]             stacked, compact
//                      [Cancel]
// DOM order is Cancel → Done Editing; `flex-col-reverse sm:flex-row` puts
// Done Editing on TOP for phones and Cancel on the LEFT from sm up. Both
// pills use the shared compact header geometry (sectionCtaBtn blue /
// sectionGhostBtn white — already the pointer-first sizes that fit thin
// screens; tap-44 keeps the 44px hit area on touch).
// "Cancel" leaves the edit session WITHOUT the "{Section} saved" toast —
// each section owns what leaving means (autosave flush for PI, plain exit
// for the immediate-mutation sections).
// ============================================================================

import { Check } from "lucide-react";
import { sectionCtaBtn, sectionGhostBtn } from "@/components/ui/buttons";

export function SectionEditActions({
  onCancel,
  onDone,
  doneLabel = "Done Editing",
  cancelDisabled,
  doneDisabled,
}: {
  onCancel: () => void;
  onDone: () => void;
  doneLabel?: string;
  cancelDisabled?: boolean;
  doneDisabled?: boolean;
}) {
  return (
    <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
      <button
        type="button"
        onClick={onCancel}
        disabled={cancelDisabled}
        className={`${sectionGhostBtn} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onDone}
        disabled={doneDisabled}
        className={`${sectionCtaBtn} justify-center disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <Check className="h-4 w-4" aria-hidden="true" /> {doneLabel}
      </button>
    </div>
  );
}
