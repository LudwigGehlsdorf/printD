import "server-only";
import fs from "node:fs/promises";
import { config } from "@/lib/config";
import { jobs, uploads, type JobStatus } from "@/lib/db";
import { queuedJobIds } from "@/lib/printer";

export type JobView = {
  id: number;
  fileName: string;
  pages: number;
  copies: number;
  duplex: boolean;
  color: boolean;
  pageRange: string | null;
  /** "sent": held for longer than the printer keeps Secure Print jobs. */
  status: JobStatus | "sent";
  pin: string | null;
  createdAt: number;
};

/** The user's latest jobs, with queued ones updated from CUPS. */
export async function recentJobs(userId: string, limit: number): Promise<JobView[]> {
  const rows = jobs.recent(userId, Math.min(limit, 200));

  if (rows.some((j) => j.status === "queued")) {
    const queued = await queuedJobIds();
    for (const job of rows) {
      if (job.status !== "queued" || queued.has(job.cups_job_id!)) continue;
      // CUPS is done with it. A Secure Print job now waits in the printer for its PIN; we
      // can't see when that happens.
      job.status = job.pin ? "held" : "done";
      jobs.setStatus(job.id, job.status);
    }
  }

  const holdCutoff = Date.now() - config.holdHours * 3_600_000;
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
      pin: expired ? null : j.pin,
      createdAt: j.created_at,
    };
  });
}

export async function deleteOldUploads() {
  for (const upload of uploads.olderThan(Date.now() - config.uploadTtlMinutes * 60_000)) {
    await fs.rm(upload.path, { force: true });
    uploads.delete(upload.id);
  }
}
