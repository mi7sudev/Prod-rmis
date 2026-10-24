// Client-safe MQR constants (mirror of the server-side verdict strings in
// src/lib/mqr.ts — kept dependency-free so client components can import them).
export const MQR_MEETS = "Meets the minimum requirements";
export const MQR_FAILS = "Does not meet the minimum requirements";

/** Shape of the per-dimension verdict object the MQR endpoints return. */
export type MqrResult = {
  education: string;
  eligibility: string;
  workExperience: string;
  training: string;
};
