// ============================================================================
// RMIS — Reviewer-side requirements report (spec §8.2). Honest-uncertainty
// engine: recomputed LIVE from the application snapshots vs the live Position
// CSC standards. Never persisted. Status vocabulary per check:
//   MET | NOT_MET | NOT_REQUIRED | REVIEW
// Report verdicts: ALL_MET | PARTIAL | NONE_MET | NEEDS_REVIEW | NO_REQUIREMENTS
//
// Education doctrine (Task 83 — applicant QA 2026-10-22):
//   • The applicant's explicit Education Level choice is AUTHORITATIVE for
//     level inference — a "College" row with a custom-typed course ("BS
//     Business Management" not in the Course table) evaluates as College.
//     degree/course/specifyOthers inference is only the fallback for rows
//     without a usable level (PDS imports, legacy data) and expands the
//     degree abbreviations (BS/BSBA/AB/BA/MA/MS…).
//   • Standards picked from the controlled CSC vocabulary (constants.ts
//     CSC_EDUCATION_*) are MINIMUM-LEVEL statements, not field-of-study
//     requirements — they match on level alone. Token overlap applies only
//     to free-typed standards ("Bachelor's degree in Engineering").
//   • The tokenizer drops single-letter artifacts ("Bachelor's" used to leak
//     an "s" token that matched almost any row) and the generic degree-family
//     abbreviations (bs/ba/ab/ms/ma/mba), so a bare "Bachelor's degree"
//     standard correctly reduces to a level check for ANY course.
// Task 89 (user clarification, 2026-10-23) — the education rank scale IS the
//   7-tier hierarchy the applicant form teaches, highest → lowest:
//     Graduate Studies(6) > College(5) > Vocational/Trade(4) >
//     Senior High School(3) > Secondary/JHS(2) > Elementary(1) > not specified.
//   Matching is MINIMUM-LEVEL: an applicant at or above the required tier
//   qualifies regardless of course text (a Graduate Studies applicant meets
//   a College requirement; a Vocational applicant meets anything below it).
//   Senior High School now ranks STRICTLY ABOVE Secondary (Grade 12 ≠ the old
//   4-year secondary), and a "Not specified" requirement reads as no education
//   requirement at all (NOT_REQUIRED — it is the lowest tier, not College).
// ============================================================================

import { CSC_EDUCATION_FIRST_LEVEL, CSC_EDUCATION_HIGHER_LEVEL } from "./constants";

export type CheckStatus = "MET" | "NOT_MET" | "NOT_REQUIRED" | "REVIEW";

export type RequirementCheck = {
  dimension: "education" | "experience" | "training" | "eligibility";
  standard: string;
  status: CheckStatus;
  applicantSummary: string;
  evidence: string[];
  shortfall?: string;
};

export type RequirementsReport = {
  verdict: "ALL_MET" | "PARTIAL" | "NONE_MET" | "NEEDS_REVIEW" | "NO_REQUIREMENTS";
  metCount: number;
  requiredCount: number;
  checks: RequirementCheck[];
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, twenty: 20, twentyfour: 24, forty: 40, eighty: 80, hundred: 100,
};

const EDU_GENERIC = new Set([
  "bachelor", "bachelors", "degree", "of", "in", "arts", "major", "minor",
  "course", "program", "career", "service", "to", "the", "science", "grade",
  "shs", "hs", "jhs", "senior", "junior", "high", "school", "graduate",
  "graduates", "relevant", "field", "study", "studies", "years", "year",
  "college", "education", "vocational", "trade", "technical", "master",
  "masters", "doctorate", "phd", "bs", "ba", "ab", "ms", "ma", "mba", "two",
  "prior", "starting", "completed", "with", "and",
]);

function isNotRequired(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (["n/a", "na", "none", "not specified", "not applicable"].includes(t)) return true;
  if (t.includes("none required") || t.includes("not required")) return true;
  return false;
}

function extractQuantity(text: string | null | undefined, unit: "year" | "hour"): number | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (!lower.includes(unit)) return null; // no unit word at all → REVIEW
  const paren = text.match(/\((\d+)\)/);
  if (paren) return Number(paren[1]);
  const digitUnit = lower.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${unit}s?`));
  if (digitUnit) return Number(digitUnit[1]);
  const word = Object.entries(WORD_NUMBERS).find(([w]) => new RegExp(`\\b${w}\\b`).test(lower));
  if (word) return word[1];
  return 0;
}

function tokens(text: string | null | undefined, stop = EDU_GENERIC): string[] {
  return (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // "Bachelor's" → "bachelor s"
    .split(/\s+/)
    // Length > 1: the apostrophe split used to leak a standalone "s" token
    // that matched almost any applicant row — an accidental pass.
    .filter((t) => t.length > 1 && !stop.has(t));
}

// ── Education clause parser (spec §8.2) ─────────────────────────────────────

type EduClause = { minLevel: number; partialCollege: boolean; tokens: string[] };

// Task 89 scale (see header): Elementary 1 · Secondary/JHS/old-HS 2 ·
// Senior High School (Grade 12) 3 · Vocational/Trade 4 · College 5 ·
// Graduate Studies 6 · Doctorate 7. Higher ALWAYS meets lower.
const LEVEL_WORDS: [RegExp, number][] = [
  [/post[-\s]?grad|phd|doctor(ate)?/, 7],
  [/master|graduate studies|\bms\b|m\.s\./, 6],
  // vocational/trade checked before bachelor (spec §8.2 ordering note)
  [/vocational|trade|technical/, 4],
  [/bachelor|\bbs\b|\bba\b|\bab\b|college|degree/, 5],
  // Grade 12 / SHS BEFORE the generic high-school tier — "senior high
  // school" contains "high school", and the user's hierarchy ranks SHS
  // strictly above Secondary (Task 89).
  [/grade\s*12|senior high|\bshs\b/, 3],
  [/high school|grade\s*10|junior high|\bhs\b/, 2],
  [/elementary/, 1],
];

function detectLevel(text: string): number {
  const lower = text.toLowerCase();
  for (const [re, level] of LEVEL_WORDS) if (re.test(lower)) return level;
  // Unparseable free text defaults to the COLLEGE tier (5) — same semantic
  // as the pre-Task-89 default, renumbered.
  return 5;
}

// Standards picked verbatim from the CSC education vocabulary (the recruitment
// form's dropdown) match on LEVEL alone — they are minimum-level statements.
// Without this, entries like "Two years of college education (prior to 2018)"
// tokenized into words ("education", "prior", "2018") that no applicant row
// can contain — every applicant failed education for such positions.
const normStd = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").trim();
const CSC_EDU_LEVEL_ONLY = new Set(
  [...CSC_EDUCATION_FIRST_LEVEL, ...CSC_EDUCATION_HIGHER_LEVEL].map(normStd)
);

function parseEducationClauses(standard: string): EduClause[] {
  const alternatives = standard.split(/\s+or\s+|;/i).map((s) => s.trim()).filter(Boolean);
  return alternatives.map((alt) => {
    const lower = alt.toLowerCase();
    let minLevel = detectLevel(alt);
    const partialCollege = /\b(two|2)\s+years?\s+in\s+college\b/.test(lower);
    if (partialCollege) minLevel = 5; // College tier (Task 89 renumber)
    const relevant = lower.includes("relevant");
    const vocabLevelOnly = CSC_EDU_LEVEL_ONLY.has(normStd(alt));
    return { minLevel, partialCollege, tokens: relevant || vocabLevelOnly ? [] : tokens(alt) };
  });
}

// The applicant's explicit Education Level selection is authoritative — the
// row IS what the applicant declared it to be, so a "College" row with a
// custom-typed course evaluates as College (applicant QA 2026-10-22). The
// degree/course/specifyOthers text is only the fallback for rows without a
// usable level choice, so the old behavior of letting a "Master in…" course
// text elevate a "College" row is gone too. Exported for the display-side
// credential tag (lib/credential-tag) so the kanban tag and this gate can
// never disagree about how advanced an applicant's education is.
export function eduLevelOf(row: {
  educationLevel?: string | null;
  degree?: string | null;
  course?: string | null;
  specifyOthers?: string | null;
}): number {
  const level = (row.educationLevel || "").toLowerCase();
  // Task 89 scale — Senior High School must be tested BEFORE the secondary/
  // high-school tier (the vocab string contains "high school").
  if (/graduate|master|doctor|post[-\s]?grad/.test(level)) return 6;
  if (/college|bachelor|degree/.test(level)) return 5;
  if (/vocational|trade|technical/.test(level)) return 4;
  if (/senior high|\bshs\b|grade\s*12/.test(level)) return 3;
  if (/secondary|high school|junior high/.test(level)) return 2;
  if (/elementary/.test(level)) return 1;
  return inferEduLevel(`${row.degree || ""} ${row.course || ""} ${row.specifyOthers || ""}`);
}

// Fallback inference for rows without a usable Education Level choice (PDS
// imports, legacy data): read the credential text, degree abbreviations
// included — a "BS Business Management" row with no level field still ranks
// as College instead of the old no-signal default (which failed every
// bachelor-level requirement). No signal at all → conservative 1 (fails
// bachelor-level standards; the reviewer ledger shows the evidence).
function inferEduLevel(text: string): number {
  const t = text.toLowerCase();
  if (/\bphd\b|\bph\.d\b|doctor(ate)?|\bd\.?m\.?d\b/.test(t)) return 7;
  if (/graduate|master|\bms\b|\bma\b|\bmba\b|post[-\s]?grad/.test(t)) return 6;
  if (/bachelor|\bbs[a-z]*\b|\bba\b|\bab\b|college|degree|tertiary/.test(t)) return 5;
  if (/vocational|trade|technical/.test(t)) return 4;
  if (/senior high|\bshs\b|grade\s*12/.test(t)) return 3;
  if (/secondary|high school|grade\s*1[02]|junior high/.test(t)) return 2;
  if (/elementary/.test(t)) return 1;
  return 1;
}

// ── Eligibility alternatives (spec §8.2) ────────────────────────────────────

function compact(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function eligibilityMatches(standard: string, applicantEligs: { title: string; level?: number }[]): CheckStatus {
  const altsRaw = standard.split(/\/|,|;|\bor\b/i).map((s) => s.trim()).filter(Boolean);
  for (const alt of altsRaw) {
    const c = compact(alt);
    const isRa1080 = c.includes("ra1080");
    const isSub = /sub[-\s]?professional|first[-\s]?level/.test(alt.toLowerCase());
    const isProfessional = /professional|second[-\s]?level/.test(alt.toLowerCase()) && !isSub;
    const namedTokens = tokens(alt, new Set([...EDU_GENERIC, "eligibility", "career", "service", "level", "second", "first", "sub", "professional", "ra", "civil"]));
    const matched = applicantEligs.some((e) => {
      const level = e.level ?? (compact(e.title).includes("ra1080") ? 5 : /professional/i.test(e.title) && !/sub/i.test(e.title) ? 5 : /sub|first/i.test(e.title) ? 2 : 0);
      if (isRa1080) return compact(e.title).includes("ra1080") || level >= 5;
      if (isProfessional) return level >= 5 || (/professional/i.test(e.title) && !/sub/i.test(e.title));
      if (isSub) return level >= 2 || /sub|first[-\s]?level|professional/i.test(e.title);
      if (namedTokens.length > 0) return namedTokens.some((t) => e.title.toLowerCase().includes(t));
      return level >= 2; // unparseable → any eligibility
    });
    if (matched) return "MET";
  }
  return "NOT_MET";
}

// ── Report builder ──────────────────────────────────────────────────────────

export type SnapshotShape = {
  educations: { educationLevel?: string | null; degree?: string | null; course?: string | null; specifyOthers?: string | null; schoolName?: string | null; ongoing?: boolean | null; yearGraduated?: string | null }[];
  experiences: { positionTitle?: string | null; employerName?: string | null; yearDecimal?: number | null; isPresentWork?: boolean | null; dateFrom?: string | null; dateTo?: string | null }[];
  trainings: { title?: string | null; hourDecimal?: number | null; numberHours?: number | null }[];
  eligibilities: { title?: string | null; rating?: string | null }[];
};

export type PositionShape = {
  cscEducation?: string | null;
  cscEligibility?: string | null;
  cscEligibilityGroup?: string | null;
  cscWorkExperience?: string | null;
  cscTraining?: string | null;
};

function completed(row: { ongoing?: boolean | null; yearGraduated?: string | null }): boolean {
  if (row.ongoing) return false;
  return true; // presence of graduated year or absence of ongoing → assume completed
}

export function buildRequirementsReport(
  snapshot: SnapshotShape,
  position: PositionShape
): RequirementsReport {
  const checks: RequirementCheck[] = [];

  // ── Education ───────────────────────────────────────────────────────────
  if (isNotRequired(position.cscEducation)) {
    checks.push({ dimension: "education", standard: position.cscEducation || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.educations.length} education entr${snapshot.educations.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscEducation!;
    const bareNumber = /^\d+$/.test(standard.trim());
    if (bareNumber) {
      checks.push({ dimension: "education", standard, status: "REVIEW", applicantSummary: "Ambiguous standard, verify manually", evidence: [] });
    } else {
      const clauses = parseEducationClauses(standard);
      const matched = snapshot.educations.some((row) => {
        const level = eduLevelOf(row);
        const rowText = `${row.course || ""} ${row.degree || ""} ${row.specifyOthers || ""} ${row.schoolName || ""}`.toLowerCase();
        return clauses.some((c) =>
          level >= c.minLevel &&
          completed(row) &&
          (c.tokens.length === 0 || c.tokens.some((t) => rowText.includes(t)))
        );
      });
      checks.push({
        dimension: "education",
        standard,
        status: matched ? "MET" : "NOT_MET",
        applicantSummary: snapshot.educations.map((e) => [e.degree, e.course].filter(Boolean).join(", ") || e.educationLevel || "Education entry").slice(0, 3).join("; ") || "None on file",
        evidence: snapshot.educations.slice(0, 3).map((e) => `${[e.educationLevel, e.degree || e.course].filter(Boolean).join(" · ")}${e.schoolName ? `, ${e.schoolName}` : ""}`),
        shortfall: matched ? undefined : "Minimum required education level not met",
      });
    }
  }

  // ── Experience ──────────────────────────────────────────────────────────
  if (isNotRequired(position.cscWorkExperience)) {
    checks.push({ dimension: "experience", standard: position.cscWorkExperience || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.experiences.length} work entr${snapshot.experiences.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscWorkExperience!;
    const required = extractQuantity(standard, "year");
    const total = snapshot.experiences.reduce((s, w) => s + (w.yearDecimal ?? 0), 0);
    if (required === null) {
      checks.push({ dimension: "experience", standard, status: "REVIEW", applicantSummary: `${total.toFixed(1)} years on file, verify manually`, evidence: [] });
    } else if (required === 0) {
      checks.push({ dimension: "experience", standard, status: "NOT_REQUIRED", applicantSummary: "No minimum stated", evidence: [] });
    } else {
      checks.push({
        dimension: "experience",
        standard,
        status: total >= required ? "MET" : "NOT_MET",
        applicantSummary: `${total.toFixed(1)} of ${required} year(s) on file`,
        evidence: snapshot.experiences.slice(0, 3).map((w) => `${w.positionTitle || "Work"} at ${w.employerName || "Employer"} (${(w.yearDecimal ?? 0).toFixed(1)} yr)`),
        shortfall: total >= required ? undefined : `${Math.max(0, required - total).toFixed(1)} more years of relevant experience needed`,
      });
    }
  }

  // ── Training ────────────────────────────────────────────────────────────
  if (isNotRequired(position.cscTraining)) {
    checks.push({ dimension: "training", standard: position.cscTraining || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.trainings.length} training entr${snapshot.trainings.length === 1 ? "y" : "ies"}`, evidence: [] });
  } else {
    const standard = position.cscTraining!;
    const required = extractQuantity(standard, "hour");
    const total = snapshot.trainings.reduce((s, t) => s + (t.hourDecimal ?? t.numberHours ?? 0), 0);
    if (required === null) {
      checks.push({ dimension: "training", standard, status: "REVIEW", applicantSummary: `${total} hours on file, verify manually`, evidence: [] });
    } else if (required === 0) {
      checks.push({ dimension: "training", standard, status: "NOT_REQUIRED", applicantSummary: "No minimum stated", evidence: [] });
    } else {
      checks.push({
        dimension: "training",
        standard,
        status: total >= required ? "MET" : "NOT_MET",
        applicantSummary: `${total} of ${required} hour(s) on file`,
        evidence: snapshot.trainings.slice(0, 3).map((t) => `${t.title || "Training"} (${t.hourDecimal ?? t.numberHours ?? 0} hr)`),
        shortfall: total >= required ? undefined : `${Math.max(0, required - total)} more hours of relevant training needed`,
      });
    }
  }

  // ── Eligibility ─────────────────────────────────────────────────────────
  if (isNotRequired(position.cscEligibilityGroup) && isNotRequired(position.cscEligibility)) {
    checks.push({ dimension: "eligibility", standard: position.cscEligibilityGroup || position.cscEligibility || "N/A", status: "NOT_REQUIRED", applicantSummary: `${snapshot.eligibilities.length} on file`, evidence: [] });
  } else {
    const standard = (position.cscEligibilityGroup || position.cscEligibility || "").trim();
    const lower = standard.toLowerCase();
    if (["n/a", "na", "none", ""].includes(lower)) {
      checks.push({ dimension: "eligibility", standard, status: "NOT_REQUIRED", applicantSummary: "Not required", evidence: [] });
    } else {
      const applicantEligs = snapshot.eligibilities.map((e) => ({ title: e.title || e.rating || "", level: undefined as number | undefined }));
      const status = eligibilityMatches(standard, applicantEligs);
      checks.push({
        dimension: "eligibility",
        standard,
        status,
        applicantSummary: snapshot.eligibilities.map((e) => e.title).filter(Boolean).slice(0, 3).join("; ") || "None on file",
        evidence: snapshot.eligibilities.slice(0, 3).map((e) => `${e.title}${e.rating ? ` (rating ${e.rating})` : ""}`),
        shortfall: status === "NOT_MET" ? "Required civil-service eligibility not held" : undefined,
      });
    }
  }

  const relevant = checks.filter((c) => c.status !== "NOT_REQUIRED");
  const requiredCount = relevant.length;
  const metCount = relevant.filter((c) => c.status === "MET").length;
  const hasReview = relevant.some((c) => c.status === "REVIEW");
  const hasNotMet = relevant.some((c) => c.status === "NOT_MET");

  let verdict: RequirementsReport["verdict"];
  if (requiredCount === 0) verdict = "NO_REQUIREMENTS";
  else if (metCount === requiredCount) verdict = "ALL_MET";
  else if (metCount === 0 && !hasReview) verdict = "NONE_MET";
  else if (hasReview || metCount > 0) verdict = hasNotMet ? "PARTIAL" : "NEEDS_REVIEW";
  else verdict = "PARTIAL";

  return { verdict, metCount, requiredCount, checks };
}
