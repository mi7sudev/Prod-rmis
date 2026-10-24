"use client";

// ============================================================================
// RMIS — Profile builder · Section 02 Education (spec §7.4). Entry cards +
// add/edit dialog + confirm delete. Edits are delete + recreate (no update
// endpoints — §6.3). Course uses the official Combobox fed from
// /api/reference courses. AddEntryButton: dashed "Add additional entry" slot
// at the foot of the list — reachable at any list length.
// Task 41 — READ-ONLY PREVIEW BY DEFAULT (user request, extended to every
// section): with entries on file the section opens as a quiet preview — the
// entry tiles render WITHOUT the per-row Edit/Delete cluster and without any
// Add affordance. Editing is an explicit session:
//   • "Edit Profile" reveals the row actions and the foot dashed slot (the
//     Task 15 header Add button is retired — the foot "Add additional
//     entry" slot is the single add path; mutations still persist
//     immediately, per entry);
//   • "Done Editing" returns to the preview.
// An EMPTY section boots straight into edit mode (the inline first-entry form
// IS the add path) — there is nothing to preview yet, mirroring section 01's
// new-record boot. No draft state exists here, so the view-level unsaved
// navigation guard does not apply to this section.
// Bevel pass: local white section panel (dlg-card-plain) + cloud/60 entry
// tiles + header save indicator + functional destructive styling (--bad);
// all save/delete behavior unchanged.
// ============================================================================

import { useState } from "react";
import { Pencil } from "lucide-react";
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
import { EducationIcon } from "@/components/icons/section-icons";
import { ghostBadBtn, cancelBtn, sectionCtaBtn } from "@/components/ui/buttons";
import { SectionEditActions } from "./section-edit-actions";
import { humanize } from "@/lib/client";
import { EDUCATION_LEVELS } from "@/lib/constants";
import InlineEntryForm, { type FormFieldConfig } from "./entry-form";
import AddEntryButton from "./add-entry-button";
import FormDialog from "./form-dialog";
import { announceSectionSaved, useSectionMutations } from "./section-mutations";
import { EntryTile, EntryTileActions } from "./preview-kit";
import { ItemGroup } from "@/components/ui/item";
import type { EducationRow } from "./section-types";

export default function EducationSection({
  items,
  courses,
  onChanged,
}: {
  items: EducationRow[];
  courses: string[];
  onChanged: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EducationRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // Task 41 — section-level edit gate (NOT the dialog's per-row `editing`):
  // empty sections boot in edit mode, populated sections boot as preview.
  const [editMode, setEditMode] = useState(() => items.length === 0);

  // §6.3 mutation contract (delete+recreate edits, toast language, parent
  // refresh, busy gating) lives in the shared deep module —
  // this section owns only its field config and dialog/confirm state.
  const { saveEntry, removeEntry, busy } = useSectionMutations({
    resource: "educations",
    noun: "Education entry",
    onChanged,
  });

  // Shared field config — powers both the add/edit dialog and the inline
  // first-entry form shown while the section is empty (Task 25).
  const fields: FormFieldConfig[] = [
    {
      key: "educationLevel",
      label: "Education Level",
      type: "select",
      options: EDUCATION_LEVELS.map((l) => ({ value: l, label: l })),
    },
    {
      key: "course",
      label: "Course / Degree",
      type: "datalist",
      datalistOptions: courses,
      placeholder: "Start typing to see suggestions",
      // Task 83 — a persistent "Other — type your own" row in the panel: the
      // applicant can type a course that is not in the reference list. The
      // typed text is saved verbatim into Education.course; the MQR engine
      // evaluates education on the Education Level choice (this row's level
      // field), so a custom course never blocks a College-level applicant.
      allowOther: true,
    },
    { key: "schoolName", label: "School Name", type: "text", required: true, full: true },
    { key: "yearFrom", label: "Year From", type: "text", placeholder: "YYYY" },
    { key: "yearTo", label: "Year To", type: "text", placeholder: "YYYY" },
    { key: "yearGraduated", label: "Year Graduated", type: "text", placeholder: "YYYY" },
    { key: "unitsEarned", label: "Units Earned", type: "text" },
    { key: "awards", label: "Awards / Honors Received", type: "text", full: true },
  ];

  const initial = editing
    ? {
        educationLevel: editing.educationLevel ?? "",
        course: editing.course ?? "",
        schoolName: editing.schoolName ?? "",
        yearFrom: editing.yearFrom ?? "",
        yearTo: editing.yearTo ?? "",
        yearGraduated: editing.yearGraduated ?? "",
        unitsEarned: editing.unitsEarned ?? "",
        awards: editing.awards ?? "",
      }
    : {};

  const save = async (values: Record<string, unknown>) => {
    // On success the hook fires onSuccess right after the toast — the
    // dialog closes the moment the POST settles, BEFORE the refresh runs
    // (exact legacy ordering). On failure nothing closes: retry in place.
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
      iconArt={<EducationIcon className="size-9" />}
      title="Education"
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
              announceSectionSaved("Education");
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
          fields={fields}
          busy={busy}
          submitLabel="Add Education"
          onSubmit={save}
          title="Add your first education entry"
        />
      ) : (
        <ItemGroup className="gap-3" aria-label="Education entries">
          {items.map((row) => (
            <EntryTile
              key={row.id}
              title={row.educationLevel ? humanize(row.educationLevel) : "Education entry"}
              subtitle={[row.course, row.schoolName].filter(Boolean).join(" · ") || undefined}
              meta={[
                row.yearFrom || row.yearTo ? `${row.yearFrom ?? "?"}–${row.yearTo ?? "Ongoing"}` : null,
                row.yearGraduated ? `Graduated ${row.yearGraduated}` : null,
                row.unitsEarned ? `Units: ${row.unitsEarned}` : null,
                row.awards ? `Honors: ${row.awards}` : null,
              ]}
              actions={
                editMode ? (
                  <EntryTileActions
                    onEdit={() => {
                      setEditing(row);
                      setOpen(true);
                    }}
                    onDelete={() => setDeleteId(row.id)}
                    editLabel="Edit education entry"
                    deleteLabel="Delete education entry"
                  />
                ) : undefined
              }
            />
          ))}
          {/* Add additional entry — always reachable at the foot of the list,
              however many entries exist (mirrors the header Add Education).
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
        title={editing ? "Edit Education" : "Add Education"}
        description="Entries are saved against your profile for MQR evaluation."
        busy={busy}
        initial={initial}
        submitLabel={editing ? "Save Entry" : "Add Entry"}
        onSubmit={save}
        fields={fields}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="dlg-card-plain">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl text-ink">Remove this education entry?</AlertDialogTitle>
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
