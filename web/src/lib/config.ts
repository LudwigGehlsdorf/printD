import "server-only";
import path from "node:path";
import fs from "node:fs";

function env(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function findSoffice(): string {
  if (process.env.SOFFICE_PATH) return process.env.SOFFICE_PATH;
  const candidates = [
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/bin/libreoffice",
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? "soffice";
}

const dataDir = path.resolve(env("DATA_DIR", "./data"));

export const config = {
  /**
   * Comma-separated Authentik groups whose members (including subgroups) may print.
   * Empty: anyone with an account on the Authentik server may print.
   */
  allowedGroups: env("PRINT_ALLOWED_GROUPS", "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean),
  /** "dry-run" writes PDFs to DATA_DIR/dry-run, "cups" sends them to the printer. */
  printMode: env("PRINT_MODE", "dry-run") as "dry-run" | "cups",
  printerName: env("PRINTER_NAME", "Canon_MF744Cdw"),
  /** "ufr2" for Canon's UFR II driver (needed for Secure Print), "ipp" for driverless queues. */
  driver: env("PRINTER_DRIVER", "ufr2") as "ufr2" | "ipp",
  /** Hold jobs on the printer until the user enters a PIN on its panel. Requires the UFR II driver. */
  securePrint: env("SECURE_PRINT", "true") === "true",
  /**
   * How the PIN is passed to Canon's driver. Its Linux build expects base64, its macOS build
   * plain digits (cngplp/cngplpmod/execjob.c in the driver source).
   */
  securePrintPinEncoding: env("SECURE_PRINT_PIN_ENCODING", process.platform === "darwin" ? "plain" : "base64") as
    | "plain"
    | "base64",
  /** How long a held job is shown as waiting. Set to the printer's own Secure Print hold time. */
  securePrintHoldHours: Number(env("SECURE_PRINT_HOLD_HOURS", "4")),
  securePrintPinLength: Math.min(7, Math.max(4, Number(env("SECURE_PRINT_PIN_LENGTH", "4")))),
  maxUploadBytes: Number(env("MAX_UPLOAD_MB", "50")) * 1024 * 1024,
  maxCopies: Number(env("MAX_COPIES", "50")),
  /** Uploads that were never printed are deleted after this many minutes. */
  uploadTtlMinutes: Number(env("UPLOAD_TTL_MINUTES", "60")),
  soffice: findSoffice(),
  /**
   * Skip Authentik and log in as a fake user. Only honoured by `next dev`,
   * never in a production build.
   */
  devFakeUser: process.env.NODE_ENV === "development" && process.env.DEV_FAKE_USER === "1",
  dataDir,
  uploadDir: path.join(dataDir, "uploads"),
  dryRunDir: path.join(dataDir, "dry-run"),
  dbPath: path.join(dataDir, "print.db"),
};

for (const dir of [config.dataDir, config.uploadDir, config.dryRunDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
