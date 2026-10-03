import "server-only";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "@/lib/config";

const run = promisify(execFile);
const dryRun = config.printMode === "dry-run";

export type PrintOptions = {
  copies: number;
  duplex: boolean;
  color: boolean;
  securePrint: { pin: string; username: string } | null;
};

export function generatePin() {
  return String(crypto.randomInt(10 ** config.pinLength)).padStart(config.pinLength, "0");
}

/** Sends a PDF to the printer and returns the CUPS job id. */
export async function submit(pdfPath: string, title: string, options: PrintOptions) {
  const args = lpArgs(title, options);

  if (dryRun) {
    const id = `dry-run-${Date.now()}`;
    await fs.copyFile(pdfPath, path.join(config.dryRunDir, `${id}.pdf`));
    await fs.writeFile(path.join(config.dryRunDir, `${id}.json`), JSON.stringify({ title, ...options, lp: args }, null, 2));
    return id;
  }

  // Prints "request id is <queue>-42 (1 file(s))".
  const { stdout } = await run("lp", [...args, "--", pdfPath]);
  return stdout.match(/request id is (\S+)/)![1];
}

function lpArgs(title: string, { copies, duplex, color, securePrint }: PrintOptions) {
  const args = ["-d", config.printerName, "-t", title, "-n", String(copies), "-o", "collate=true"];
  args.push("-o", duplex ? "sides=two-sided-long-edge" : "sides=one-sided");

  if (config.driver === "ipp") {
    args.push("-o", `print-color-mode=${color ? "color" : "monochrome"}`);
    return args;
  }

  // Canon UFR II options. Its Linux PPD maps `sides` to duplex, the macOS PPD only knows
  // CNDuplex; each ignores the other.
  args.push("-o", `CNColorMode=${color ? "color" : "mono"}`, "-o", `CNDuplex=${duplex ? "DuplexFront" : "None"}`);
  if (securePrint) {
    const pin = config.pinEncoding === "base64" ? Buffer.from(securePrint.pin).toString("base64") : securePrint.pin;
    args.push(
      "-o", "CNJobExecMode=secured",
      "-o", `CNUsrName=${panelText(securePrint.username, 32)}`,
      "-o", `CNDocName=${panelText(title, 64)}`,
      "-o", `CNSecuredPrint=${pin}`,
    );
  }
  return args;
}

/** The printer's screen only shows ASCII: "Jönsson" → "Jonsson". */
function panelText(text: string, maxLength: number) {
  return text
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\s'"\\]+/g, "_")
    .slice(0, maxLength);
}

/** Ids of jobs CUPS has not finished sending yet. */
export async function queuedJobIds() {
  if (dryRun) return new Set<string>();
  const { stdout } = await run("lpstat", ["-o", config.printerName]);
  return new Set(stdout.split("\n").map((line) => line.split(" ")[0]));
}

export async function cancel(cupsJobId: string) {
  if (!dryRun) await run("cancel", [cupsJobId]);
}

export async function printerStatus() {
  if (dryRun) return { online: true, message: "Testläge" };
  try {
    const { stdout } = await run("lpstat", ["-p", config.printerName]);
    if (stdout.includes("disabled")) return { online: false, message: "Skrivaren är pausad" };
    if (stdout.includes("now printing")) return { online: true, message: "Skrivaren skriver ut" };
    return { online: true, message: "Skrivaren är redo" };
  } catch {
    return { online: false, message: "Skrivaren hittades inte" };
  }
}
