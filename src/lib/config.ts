import "server-only";
import fs from "node:fs";
import path from "node:path";

const env = (name: string, fallback: string) => process.env[name] || fallback;

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
  pinLength: Number(env("SECURE_PRINT_PIN_LENGTH", "4")),
  holdHours: Number(env("SECURE_PRINT_HOLD_HOURS", "4")),
  maxUploadBytes: Number(env("MAX_UPLOAD_MB", "50")) * 1024 * 1024,
  maxCopies: Number(env("MAX_COPIES", "50")),
  uploadTtlMinutes: Number(env("UPLOAD_TTL_MINUTES", "60")),
  soffice: process.env.SOFFICE_PATH || findSoffice(),
  devFakeUser: process.env.NODE_ENV === "development" && process.env.DEV_FAKE_USER === "1",
  uploadDir: path.join(dataDir, "uploads"),
  dryRunDir: path.join(dataDir, "dry-run"),
  dbPath: path.join(dataDir, "print.db"),
};

function findSoffice() {
  const candidates = ["/usr/bin/soffice", "/Applications/LibreOffice.app/Contents/MacOS/soffice"];
  return candidates.find((c) => fs.existsSync(c)) ?? "soffice";
}

/** Mistakes in the settings, as messages for the log. Checked once at startup. */
export function configProblems() {
  const problems: string[] = [];
  const oneOf = (name: string, value: string, allowed: string[]) => {
    if (!allowed.includes(value)) problems.push(`${name} must be one of ${allowed.join(", ")} (is "${value}")`);
  };
  const number = (name: string, value: number, min: number, max = Infinity) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      problems.push(`${name} must be a whole number from ${min}${max < Infinity ? ` to ${max}` : ""}`);
    }
  };

  oneOf("PRINT_MODE", config.printMode, ["cups", "dry-run"]);
  oneOf("PRINTER_DRIVER", config.driver, ["ufr2", "ipp"]);
  number("SECURE_PRINT_PIN_LENGTH", config.pinLength, 4, 7);
  number("SECURE_PRINT_HOLD_HOURS", config.holdHours, 1);
  number("MAX_UPLOAD_MB", config.maxUploadBytes / 1024 / 1024, 1);
  number("MAX_COPIES", config.maxCopies, 1);
  number("UPLOAD_TTL_MINUTES", config.uploadTtlMinutes, 1);

  if (process.env.NODE_ENV === "production") {
    for (const name of ["AUTH_SECRET", "AUTH_URL", "AUTH_AUTHENTIK_ID", "AUTH_AUTHENTIK_ISSUER"]) {
      if (!process.env[name]) problems.push(`${name} is not set`);
    }
  }

  for (const dir of [config.uploadDir, config.dryRunDir]) {
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch (err) {
      problems.push(`DATA_DIR ${dataDir} is not writable (${(err as Error).message})`);
      break;
    }
  }
  return problems;
}

try {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  fs.mkdirSync(config.dryRunDir, { recursive: true });
} catch {
  // Reported by configProblems().
}
