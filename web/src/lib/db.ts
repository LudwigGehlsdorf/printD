import "server-only";
import Database from "better-sqlite3";
import { config } from "@/lib/config";

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    original_name TEXT NOT NULL,
    pdf_path      TEXT NOT NULL,
    pages         INTEGER NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    user_name   TEXT NOT NULL,
    user_email  TEXT NOT NULL,
    file_name   TEXT NOT NULL,
    pages       INTEGER NOT NULL,
    copies      INTEGER NOT NULL,
    duplex      INTEGER NOT NULL,
    color       INTEGER NOT NULL,
    page_range  TEXT,
    cups_job_id TEXT,
    status      TEXT NOT NULL,
    error       TEXT,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_user ON jobs (user_id, created_at);
`);

// Columns added after the first version.
const uploadColumns = (db.prepare(`PRAGMA table_info(uploads)`).all() as { name: string }[]).map((c) => c.name);
if (!uploadColumns.includes("image")) db.exec(`ALTER TABLE uploads ADD COLUMN image TEXT`);
const jobColumns = (db.prepare(`PRAGMA table_info(jobs)`).all() as { name: string }[]).map((c) => c.name);
if (!jobColumns.includes("pin")) db.exec(`ALTER TABLE jobs ADD COLUMN pin TEXT`);
if (!jobColumns.includes("hidden_at")) db.exec(`ALTER TABLE jobs ADD COLUMN hidden_at INTEGER`);

export type Upload = {
  id: string;
  user_id: string;
  original_name: string;
  /** The converted PDF, or for images the normalised image file. */
  pdf_path: string;
  pages: number;
  /** For images: JSON with width, height, dpi and format. Null for documents. */
  image: string | null;
  created_at: number;
};

/** "held": sent to the printer with Secure Print, waiting for the PIN to be entered there. */
export type JobStatus = "queued" | "printing" | "held" | "done" | "cancelled" | "failed";

export type Job = {
  id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  file_name: string;
  pages: number;
  copies: number;
  duplex: number;
  color: number;
  page_range: string | null;
  cups_job_id: string | null;
  status: JobStatus;
  error: string | null;
  /** Secure Print PIN, if the job is held on the printer. */
  pin: string | null;
  created_at: number;
};

export const uploads = {
  insert(u: Upload) {
    db.prepare(
      `INSERT INTO uploads (id, user_id, original_name, pdf_path, pages, image, created_at)
       VALUES (@id, @user_id, @original_name, @pdf_path, @pages, @image, @created_at)`,
    ).run(u);
  },
  get(id: string, userId: string): Upload | undefined {
    return db.prepare(`SELECT * FROM uploads WHERE id = ? AND user_id = ?`).get(id, userId) as
      | Upload
      | undefined;
  },
  expired(before: number): Upload[] {
    return db.prepare(`SELECT * FROM uploads WHERE created_at < ?`).all(before) as Upload[];
  },
  delete(id: string) {
    db.prepare(`DELETE FROM uploads WHERE id = ?`).run(id);
  },
};

export const jobs = {
  insert(j: Omit<Job, "id">): number {
    const result = db
      .prepare(
        `INSERT INTO jobs (user_id, user_name, user_email, file_name, pages, copies, duplex, color,
                           page_range, cups_job_id, status, error, pin, created_at)
         VALUES (@user_id, @user_name, @user_email, @file_name, @pages, @copies, @duplex, @color,
                 @page_range, @cups_job_id, @status, @error, @pin, @created_at)`,
      )
      .run(j);
    return Number(result.lastInsertRowid);
  },
  get(id: number, userId: string): Job | undefined {
    return db.prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`).get(id, userId) as
      | Job
      | undefined;
  },
  recentForUser(userId: string, limit = 20): Job[] {
    return db
      .prepare(`SELECT * FROM jobs WHERE user_id = ? AND hidden_at IS NULL ORDER BY created_at DESC LIMIT ?`)
      .all(userId, limit) as Job[];
  },
  /** Hides a job from the user's list. The row stays in the database as the print log. */
  hide(id: number) {
    db.prepare(`UPDATE jobs SET hidden_at = ? WHERE id = ?`).run(Date.now(), id);
  },
  setStatus(id: number, status: JobStatus, error: string | null = null) {
    db.prepare(`UPDATE jobs SET status = ?, error = ? WHERE id = ?`).run(status, error, id);
  },
};
