"use client";

// ============================================================================
// RMIS — Profile builder · Section 06 Awards (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// Points field REMOVED per user (not needed on the form; legacy rows keep
// their stored value — the tile no longer displays it either).
// AddEntryButton: dashed "Add additional entry" slot at the foot of the
// list — reachable at any list length.
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with entries on file the section opens as a quiet preview —
// entry tiles render WITHOUT the per-row Edit/Delete cluster and without any
// Add affordance. "Edit Profile" reveals the row actions and the foot
// dashed slot — the Task 15 header Add button is RETIRED (user request):
// the foot "Add additional entry" slot is the single add path
// (mutations still persist immediately, per entry); "Done Editing" returns to the preview. An EMPTY section boots
// straight into edit mode (the inline first-entry form IS the add path) —
// there is nothing to preview yet, mirroring section 01's new-record boot.
// No draft state exists here, so the view-level unsaved navigation guard
// does not apply to this section.
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { Pencil } from "lucide-react";
import { AwardIcon } from "@/components/icons/section-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SectionCard } from "@/components/ui/shell";
import { ghostBadBtn, cancelBtn, sectionCtaBtn } from "@/components/ui/buttons";
import { SectionEditActions } from "./section-edit-actions";
import { formatDate } from "@/lib/client";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { announceSectionSaved, useSectionMutations } from "./section-mutations";
import { EntryTile, EntryTileActions } from "./preview-kit";
import { ItemGroup } from "@/components/ui/item";
import type { AwardRow } from "./section-types";

const RECOGNITION_TYPES = ["Award", "Accomplishment"];
const SCOPES = ["Individual", "Group", "Local", "Foreign", "International"];

// Shared field config — powers both the add/edit dialog and the inline
// first-entry form shown while the section is empty (Task 25).
const FIELDS: FormFieldConfig[] = [
  {
    key: "recognitionType",
    label: "Recognition Type",
    type: "select",
    options: RECOGNITION_TYPES.map((t) => ({ value: t, label: t })),
  },
  {
    key: "scope",
    label: "Scope",
    type: "select",
    options: SCOPES.map((s) => ({ value: s, label: s })),
  },
  { key: "details", label: "Details", type: "textarea", required: true, placeholder: "What was conferred, and why" },
  { key: "category", label: "Category", type: "text" },
  { key: "provider", label: "Awarding Body", type: "text" },
  { key: "dateGranted", label: "Date Granted", type: "date" },
];

export default function AwardsSection({
  items,
  onChanged,
}: {
  items: AwardRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AwardRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, parent
  // refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "awards",
    noun: "Award",
    onChanged,
  });

  const initial = editing
    ? {
        recognitionType: editing.recognitionType ?? "",
        scope: editing.scope ?? "",
        details: editing.details ?? "",
        category: editing.category ?? "",
        provider: editing.provider ?? "",
        dateGranted: editing.dateGranted ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    // Dialog closes the moment the POST settles (hook onSuccess), BEFORE
    // the refresh runs — exact legacy ordering; failures keep it open.
    await saveEntry(values, editing, () => {
      setOpen(false);
      setEditing(null);
    });
  };

  const remove = (id: number) =>
    removeEntry(id, () => setDeleteId(null));

  return (
    <SectionCard
      variant="plain"
      bareOnMobile
      iconArt={<AwardIcon className="size-9" />}
      title="Awards"
      description={
        editMode
          ? "Editing — entries save as you add or change them."
          : "Read-only preview — click Edit Profile to make changes."
      }
      /* User QA 2026-10-21: BOTH header controls — "Edit Profile" AND "Done
         Editing" — stay top-right beside the
         heading on phones in both states (same anatomy as sm+) — the Done
         Editing pill occupies the exact Edit Profile slot. */
      actionsInlineOnMobile
      actions={
        editMode ? (
          <SectionEditActions
            onCancel={() => setEditMode(false)}
            onDone={() => {
              setEditMode(false);
              announceSectionSaved("Awards");
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditMode(true)}
            className={sectionCtaBtn}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit Profile
          </button>
        )
      }
    >
      {items.length === 0 ? (
        <InlineEntryForm
          fields={FIELDS}
          busy={busy}
          submitLabel="Add Award"
          onSubmit={save}
          title="Add your first award"
        />
      ) : (
        <ItemGroup className="gap-3" aria-label="Award entries">
          {items.map((row) => (
            <EntryTile
              key={row.id}
              title={row.details ?? "Award not specified"}
              meta={[
                row.recognitionType,
                row.scope,
                row.category,
                row.provider,
                row.dateGranted ? formatDate(row.dateGranted) : null,
              ]}
              actions={
                editMode ? (
                  <EntryTileActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => setDeleteId(row.id)}
                    editLabel="Edit award entry"
                    deleteLabel="Delete award"
                  />
                ) : undefined
              }
            />
          ))}
          {/* Add additional entry — always reachable at the foot of the list,
              however many entries exist (mirrors the header Add Award).
              Task 41: hidden in the read-only preview. */}
          {editMode && (
            <AddEntryButton
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            />
          )}
        </ItemGroup>
      )}

      <FormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
        title={editing ? "Edit Award" : "Add Award"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={FIELDS}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this award?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={cancelBtn}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) void remove(deleteId);
              }}
              className={`${ghostBadBtn} px-5 py-2.5`}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
