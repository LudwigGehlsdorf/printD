import "server-only";
import fs from "node:fs";
import path from "node:path";

const env = (name: string, fallback: string) => process.env[name] ?? fallback;

const dataDir = path.resolve(env("DATA_DIR", "./data"));

export const config = {
  allowedGroups: env("PRINT_ALLOWED_GROUPS", "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean),
  printMode: env("PRINT_MODE", "dry-run") as "dry-run" | "cups",
  printerName: env("PRINTER_NAME", "Canon_MF744Cdw"),
  driver: env("PRINTER_DRIVER", "ufr2") as "ufr2" | "ipp",
  securePrint: env("SECURE_PRINT", "true") === "true",
  // Canon's driver builds disagree: the Linux one decodes the PIN as base64, the macOS one
  // takes it as is (see cngplp/cngplpmod/execjob.c in the driver source).
  pinEncoding: env("SECURE_PRINT_PIN_ENCODING", process.platform === "darwin" ? "plain" : "base64") as
    | "plain"
    | "base64",
  pinLength: Number(env("SECURE_PRINT_PIN_LENGTH", "4")),
  holdHours: Number(env("SECURE_PRINT_HOLD_HOURS", "4")),
  maxUploadBytes: Number(env("MAX_UPLOAD_MB", "50")) * 1024 * 1024,
  maxCopies: Number(env("MAX_COPIES", "50")),
  uploadTtlMinutes: Number(env("UPLOAD_TTL_MINUTES", "60")),
  soffice: process.env.SOFFICE_PATH ?? findSoffice(),
  devFakeUser: process.env.NODE_ENV === "development" && process.env.DEV_FAKE_USER === "1",
  uploadDir: path.join(dataDir, "uploads"),
  dryRunDir: path.join(dataDir, "dry-run"),
  dbPath: path.join(dataDir, "print.db"),
};

function findSoffice() {
  const candidates = ["/usr/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  return candidates.find((c) => fs.existsSync(c)) ?? "soffice";
}

fs.mkdirSync(config.uploadDir, { recursive: true });
fs.mkdirSync(config.dryRunDir, { recursive: true });
