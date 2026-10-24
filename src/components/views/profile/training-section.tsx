"use client";

// ============================================================================
// RMIS — Profile builder · Section 04 Training (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (§6.3).
// "Specify" field appears for Non-Technical / Others training types.
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
import { TrainingIcon } from "@/components/icons/section-icons";
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
import { TRAINING_TYPES } from "@/lib/constants";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { announceSectionSaved, useSectionMutations } from "./section-mutations";
import { EntryTile, EntryTileActions } from "./preview-kit";
import { ItemGroup } from "@/components/ui/item";
import { dateInput, type TrainingRow } from "./section-types";

const TRAINING_OPTIONS = [...TRAINING_TYPES, "Others"];

// Shared field config — powers both the add/edit dialog and the inline
// first-entry form shown while the section is empty (Task 25).
const FIELDS: FormFieldConfig[] = [
  { key: "title", label: "Title of Training", type: "text", required: true, full: true },
  {
    key: "typeOfTraining",
    label: "Type of Training",
    type: "select",
    options: TRAINING_OPTIONS.map((t) => ({ value: t, label: t })),
  },
  {
    key: "specifyTraining",
    label: "Specify",
    type: "text",
    showIf: (v) => v.typeOfTraining === "Non-Technical" || v.typeOfTraining === "Others",
  },
  { key: "numberHours", label: "Number of Hours", type: "number", placeholder: "0" },
  {
    key: "dateFrom",
    toKey: "dateTo",
    label: "Inclusive dates",
    type: "daterange",
    placeholder: "Select training period",
    full: true,
  },
];

export default function TrainingSection({
  items,
  onChanged,
}: {
  items: TrainingRow[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TrainingRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, parent
  // refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "trainings",
    noun: "Training entry",
    onChanged,
  });

  const initial = editing
    ? {
        title: editing.title ?? "",
        typeOfTraining: editing.typeOfTraining ?? "",
        specifyTraining: editing.specifyTraining ?? "",
        numberHours: editing.numberHours ?? "",
        dateFrom: dateInput(editing.dateFrom),
        dateTo: dateInput(editing.dateTo),
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
      iconArt={<TrainingIcon className="size-9" />}
      title="Training"
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
              announceSectionSaved("Training");
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
          submitLabel="Add Training"
          onSubmit={save}
          title="Add your first training"
        />
      ) : (
        <ItemGroup className="gap-3" aria-label="Training entries">
          {items.map((row) => (
            <EntryTile
              key={row.id}
              title={row.title ?? "Training not specified"}
              meta={[
                row.typeOfTraining
                  ? row.specifyTraining
                    ? `${row.typeOfTraining} (${row.specifyTraining})`
                    : row.typeOfTraining
                  : null,
                row.numberHours != null ? `${row.numberHours} hrs` : null,
                row.dateFrom || row.dateTo
                  ? `${row.dateFrom ? formatDate(row.dateFrom) : "?"} – ${row.dateTo ? formatDate(row.dateTo) : "?"}`
                  : null,
              ]}
              actions={
                editMode ? (
                  <EntryTileActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => setDeleteId(row.id)}
                    editLabel="Edit training entry"
                    deleteLabel="Delete training entry"
                  />
                ) : undefined
              }
            />
          ))}
          {/* Add additional entry — always reachable at the foot of the list,
              however many entries exist (mirrors the header Add Training).
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
        title={editing ? "Edit Training" : "Add Training"}
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={FIELDS}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this training entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed text-body-gray">
              This permanently removes the entry from your profile and may change your training-hours total.
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
