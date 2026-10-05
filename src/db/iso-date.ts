import { z } from "zod";

/** True for YYYY-MM-DD that is a real calendar day, so 2026-02-30 is rejected instead of rolling over to March 2. */
export const isIsoDate = (value: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

/** Zod string for a calendar date. */
export const isoDate = () => z.string().refine(isIsoDate, { message: "must be a real date as YYYY-MM-DD" });
