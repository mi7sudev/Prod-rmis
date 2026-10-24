// ============================================================================
// RMIS — Shared date arithmetic for the PDS/MQR pipeline. Pure functions,
// no imports — client-safe (the profile forms and the extract pipeline both
// need the exact same conversions). One copy of each rule that was previously
// hand-rolled in pds-extract, pds-validate, auto-apply, trainings and
// work-experiences.
// ============================================================================

/** Excel serial date (1900 system) → ISO YYYY-MM-DD. null outside the
 *  plausible serial range (the 1899-12-30 epoch arithmetic previously lived
 *  in three files). */
export function excelSerialToIso(num: number): string | null {
  if (!Number.isFinite(num) || num <= 20000 || num >= 80000) return null;
  const d = new Date(Date.UTC(1899, 11, 30));
  d.setUTCDate(d.getUTCDate() + Math.floor(num));
  return d.toISOString().slice(0, 10);
}

/** String → Date, null when unparseable (section-route form values). */
export function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** MQR year_decimal (§5.3, §8.2): 365.25-day years; open-ended rows count to
 *  today. null only when the row has no start date at all. */
export function computeYearDecimal(
  dateFrom: Date | null,
  dateTo: Date | null,
  isPresent: boolean
): number | null {
  if (!dateFrom) return null;
  const end = isPresent || !dateTo ? new Date() : dateTo;
  const years = (end.getTime() - dateFrom.getTime()) / 86_400_000 / 365.25;
  return years > 0 ? years : 0;
}
