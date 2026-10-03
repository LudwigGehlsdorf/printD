import "server-only";
import Database from "better-sqlite3";
import { config } from "@/lib/config";
import type { ImageInfo } from "@/lib/image-layout";

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS uploads (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL,
    original_name TEXT NOT NULL,
    path          TEXT NOT NULL,
    pages         INTEGER NOT NULL,
    image         TEXT,
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
    pin         TEXT,
    hidden_at   INTEGER,
    created_at  INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_user ON jobs (user_id, created_at);
`);

export type ImageMeta = ImageInfo & { format: "jpeg" | "png" };

export type Upload = {
  id: string;
  user_id: string;
  original_name: string;
  /** The PDF, or for images the image itself (laid out on the page when printing). */
  path: string;
  pages: number;
  image: ImageMeta | null;
  created_at: number;
};

/** "held": a Secure Print job that reached the printer and waits for its PIN there. */
export type JobStatus = "queued" | "held" | "done" | "cancelled" | "failed";

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
  pin: string | null;
  created_at: number;
};

type UploadRow = Omit<Upload, "image"> & { image: string | null };
const parseUpload = (row: UploadRow | undefined): Upload | undefined =>
  row && { ...row, image: row.image ? JSON.parse(row.image) : null };

export const uploads = {
  insert(upload: Upload) {
    db.prepare(
      `INSERT INTO uploads (id, user_id, original_name, path, pages, image, created_at)
       VALUES (@id, @user_id, @original_name, @path, @pages, @image, @created_at)`,
    ).run({ ...upload, image: upload.image && JSON.stringify(upload.image) });
  },
  get(id: string, userId: string) {
    return parseUpload(db.prepare(`SELECT * FROM uploads WHERE id = ? AND user_id = ?`).get(id, userId) as UploadRow);
  },
  olderThan(time: number) {
    return db.prepare(`SELECT id, path FROM uploads WHERE created_at < ?`).all(time) as { id: string; path: string }[];
  },
  delete(id: string) {
    db.prepare(`DELETE FROM uploads WHERE id = ?`).run(id);
  },
};

export const jobs = {
  insert(job: Omit<Job, "id">) {
    db.prepare(
      `INSERT INTO jobs (user_id, user_name, user_email, file_name, pages, copies, duplex, color,
                         page_range, cups_job_id, status, error, pin, created_at)
       VALUES (@user_id, @user_name, @user_email, @file_name, @pages, @copies, @duplex, @color,
               @page_range, @cups_job_id, @status, @error, @pin, @created_at)`,
    ).run(job);
  },
  get(id: number, userId: string) {
    return db.prepare(`SELECT * FROM jobs WHERE id = ? AND user_id = ?`).get(id, userId) as Job | undefined;
  },
  recent(userId: string, limit: number) {
    return db
      .prepare(`SELECT * FROM jobs WHERE user_id = ? AND hidden_at IS NULL ORDER BY created_at DESC LIMIT ?`)
      .all(userId, limit) as Job[];
  },
  /** Hidden jobs stay in the table, which is the print log. */
  hide(id: number) {
    db.prepare(`UPDATE jobs SET hidden_at = ? WHERE id = ?`).run(Date.now(), id);
  },
  setStatus(id: number, status: JobStatus) {
    db.prepare(`UPDATE jobs SET status = ? WHERE id = ?`).run(status, id);
  },
};
