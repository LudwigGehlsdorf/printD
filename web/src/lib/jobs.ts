import "server-only";
import fs from "node:fs/promises";
import { config } from "@/lib/config";
import { jobs, uploads, type Job } from "@/lib/db";
import { activeJobs, cancel } from "@/lib/printer";

export type JobView = {
  id: number;
  fileName: string;
  pages: number;
  copies: number;
  duplex: boolean;
  color: boolean;
  pageRange: string | null;
  /** "sent": held longer than the printer keeps Secure Print jobs, so probably released or deleted. */
  status: Job["status"] | "sent";
  error: string | null;
  pin: string | null;
  createdAt: number;
};

/** Recent jobs for a user, with statuses refreshed from CUPS. */
export async function recentJobs(userId: string, limit: number): Promise<JobView[]> {
  const rows = jobs.recentForUser(userId, Math.min(Math.max(limit, 1), 200));
  const pending = rows.filter((j) => j.status === "queued" || j.status === "printing");

  if (pending.length > 0) {
    const active = await activeJobs();
    for (const job of pending) {
      const live = job.cups_job_id ? active.get(job.cups_job_id) : undefined;
      // Jobs CUPS no longer lists have been sent to the printer. Secure Print jobs then wait
      // there for the PIN; we cannot see when they are released.
      const status = live ?? (job.pin ? "held" : "done");
      if (status !== job.status) {
        jobs.setStatus(job.id, status);
        job.status = status;
      }
    }
  }

  const holdCutoff = Date.now() - config.securePrintHoldHours * 3_600_000;
  return rows.map((j) => {
    const expired = j.status === "held" && j.created_at < holdCutoff;
    return {
      id: j.id,
      fileName: j.file_name,
      pages: j.pages,
      copies: j.copies,
      duplex: j.duplex === 1,
      color: j.color === 1,
      pageRange: j.page_range,
      status: expired ? "sent" : j.status,
      error: j.error,
      pin: expired ? null : j.pin,
      createdAt: j.created_at,
    };
  });
}

/** Deletes uploads that were never printed. Cheap enough to call on every upload. */
export async function cleanupExpiredUploads() {
  const cutoff = Date.now() - config.uploadTtlMinutes * 60_000;
  for (const upload of uploads.expired(cutoff)) {
    await fs.rm(upload.pdf_path, { force: true });
    uploads.delete(upload.id);
  }
}

/** Cancels a job in CUPS and marks it cancelled. Returns false if CUPS refused. */
export async function cancelJob(job: Job): Promise<boolean> {
  if (job.cups_job_id) {
    try {
      await cancel(job.cups_job_id);
    } catch (err) {
      console.error("Cancel failed", err);
      return false;
    }
  }
  jobs.setStatus(job.id, "cancelled");
  return true;
}
