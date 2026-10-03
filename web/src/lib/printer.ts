import "server-only";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "@/lib/config";

const execFileAsync = promisify(execFile);

export type PrintOptions = {
  copies: number;
  duplex: boolean;
  color: boolean;
  /** CUPS page-ranges syntax, e.g. "1-3,5". */
  pageRange: string | null;
  /** Hold the job on the printer until this PIN is entered on its panel (Canon Secure Print). */
  securePrint: { pin: string; userName: string } | null;
};

/** Generates a Secure Print PIN. The printer accepts up to 7 digits. */
export function generatePin(): string {
  return String(crypto.randomInt(0, 10 ** config.securePrintPinLength)).padStart(config.securePrintPinLength, "0");
}

/** Sends a PDF to the printer and returns the CUPS job id ("dry-run-…" in dry-run mode). */
export async function submit(pdfPath: string, title: string, options: PrintOptions): Promise<string> {
  const args = lpArgs(title, options);

  if (config.printMode === "dry-run") {
    const id = `dry-run-${Date.now()}`;
    await fs.copyFile(pdfPath, path.join(config.dryRunDir, `${id}.pdf`));
    await fs.writeFile(path.join(config.dryRunDir, `${id}.json`), JSON.stringify({ title, ...options, lp: args }, null, 2));
    return id;
  }

  const { stdout } = await execFileAsync("lp", [...args, "--", pdfPath]);
  // "request id is Canon_MF744Cdw-42 (1 file(s))"
  const match = stdout.match(/request id is (\S+)/);
  if (!match) throw new Error(`Unexpected lp output: ${stdout}`);
  return match[1];
}

function lpArgs(title: string, options: PrintOptions): string[] {
  const args = ["-d", config.printerName, "-t", title, "-n", String(options.copies)];
  args.push("-o", options.duplex ? "sides=two-sided-long-edge" : "sides=one-sided");
  if (options.pageRange) args.push("-o", `page-ranges=${options.pageRange}`);
  if (options.copies > 1) args.push("-o", "collate=true");

  if (config.driver === "ufr2") {
    // Option names from Canon's PPDs for the MF742C/744C. The Linux PPD maps `sides` to its
    // Duplex option; the macOS PPD only has CNDuplex (default 2-sided). Each ignores the other.
    args.push("-o", `CNColorMode=${options.color ? "color" : "mono"}`);
    args.push("-o", `CNDuplex=${options.duplex ? "DuplexFront" : "None"}`);
    if (options.securePrint) {
      const pin = options.securePrint.pin;
      args.push(
        "-o", "CNJobExecMode=secured",
        "-o", `CNUsrName=${panelText(options.securePrint.userName, 32)}`,
        "-o", `CNDocName=${panelText(title, 64)}`,
        "-o", `CNSecuredPrint=${config.securePrintPinEncoding === "base64" ? Buffer.from(pin).toString("base64") : pin}`,
      );
    }
  } else {
    args.push("-o", `print-color-mode=${options.color ? "color" : "monochrome"}`);
  }
  return args;
}

/** ASCII text that is safe to show on the printer's control panel ("Jönsson" → "Jonsson"). */
function panelText(text: string, maxLength: number): string {
  return (
    text
      .normalize("NFD")
      .replace(/[^\x20-\x7e]/g, "")
      .replace(/[\s'"\\]+/g, "_")
      .slice(0, maxLength) || "print"
  );
}

/** Ids of jobs CUPS has not finished yet, mapped to whether they are currently printing. */
export async function activeJobs(): Promise<Map<string, "queued" | "printing">> {
  const result = new Map<string, "queued" | "printing">();
  if (config.printMode === "dry-run") return result;

  const { stdout } = await execFileAsync("lpstat", ["-o", config.printerName]).catch(() => ({ stdout: "" }));
  for (const line of stdout.split("\n")) {
    const id = line.split(/\s+/)[0];
    if (id) result.set(id, "queued");
  }
  const status = await execFileAsync("lpstat", ["-p", config.printerName]).catch(() => ({ stdout: "" }));
  // "printer Canon_MF744Cdw now printing Canon_MF744Cdw-42.  enabled since …"
  const printing = status.stdout.match(/now printing (\S+?)\.?\s/);
  if (printing && result.has(printing[1])) result.set(printing[1], "printing");
  return result;
}

export async function cancel(cupsJobId: string): Promise<void> {
  if (config.printMode === "dry-run") return;
  await execFileAsync("cancel", [cupsJobId]);
}

export async function printerStatus(): Promise<{ online: boolean; message: string }> {
  if (config.printMode === "dry-run") return { online: true, message: "Testläge" };
  try {
    const { stdout } = await execFileAsync("lpstat", ["-p", config.printerName]);
    if (/disabled/.test(stdout)) return { online: false, message: "Skrivaren är pausad" };
    if (/now printing/.test(stdout)) return { online: true, message: "Skrivaren skriver ut" };
    return { online: true, message: "Skrivaren är redo" };
  } catch {
    return { online: false, message: "Skrivaren hittades inte" };
  }
}
