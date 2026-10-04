import "server-only";
import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "@/lib/config";

const run = promisify(execFile);
const dryRun = config.printMode === "dry-run";
// Canon's Linux driver ignores the PIN in lp options and reads it from
// <dir>/<CUPS job user>.conf instead (written by its own cnjatool2 otherwise).
const accountDir = "/etc/cngplp2/account";
const useAccountFile = config.driver === "ufr2" && process.platform !== "darwin";

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

  if (options.securePrint && useAccountFile) {
    await removeFinishedAccounts();
    // A user name of its own per job, so concurrent jobs can't pick up each other's PIN.
    const account = `printd-${crypto.randomBytes(6).toString("hex")}`;
    await writeAccount(account, options.securePrint);
    args.push("-U", account);
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
    args.push("-o", "CNJobExecMode=secured", "-o", `CNDocName=${panelText(title, 64)}`);
    if (!useAccountFile) {
      args.push("-o", `CNUsrName=${panelText(securePrint.username, 32)}`, "-o", `CNSecuredPrint=${securePrint.pin}`);
    }
  }
  return args;
}

async function writeAccount(account: string, { pin, username }: { pin: string; username: string }) {
  const b64 = (text: string) => Buffer.from(text).toString("base64");
  const queue = config.printerName;
  // The directory is setgid lp, so the driver's filter (running as lp) can read the file.
  await fs.writeFile(
    path.join(accountDir, `${account}.conf`),
    `<${queue}>\ns_id=${b64(panelText(username, 32))}\ns_password=${b64(pin)}\n</${queue}>\n`,
    { mode: 0o640 },
  );
}

/** Deletes the account files of jobs CUPS has finished sending. */
async function removeFinishedAccounts() {
  const owners = new Set((await queuedJobs()).map((j) => j.owner));
  // Skips fresh files: their job may not have reached CUPS yet.
  const cutoff = Date.now() - 60_000;
  for (const name of await fs.readdir(accountDir)) {
    if (!name.startsWith("printd-") || owners.has(name.replace(/\.conf$/, ""))) continue;
    const file = path.join(accountDir, name);
    if ((await fs.stat(file)).mtimeMs < cutoff) await fs.rm(file, { force: true });
  }
}

/** The printer's screen only shows ASCII: "Jönsson" → "Jonsson". */
function panelText(text: string, maxLength: number) {
  return text
    .normalize("NFD")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\s'"\\]+/g, "_")
    .slice(0, maxLength);
}

/** Jobs CUPS has not finished sending yet. */
async function queuedJobs() {
  // Lines look like "<queue>-42  <owner>  3072  <date>".
  const { stdout } = await run("lpstat", ["-o", config.printerName]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [id, owner] = line.split(/\s+/);
      return { id, owner };
    });
}

/** Ids of jobs CUPS has not finished sending yet. */
export async function queuedJobIds() {
  if (dryRun) return new Set<string>();
  return new Set((await queuedJobs()).map((j) => j.id));
}

export async function cancel(cupsJobId: string) {
  if (dryRun) return;
  // Secure Print jobs belong to their own CUPS user (see submit); CUPS only lets the owner
  // cancel.
  const owner = (await queuedJobs()).find((j) => j.id === cupsJobId)?.owner;
  await run("cancel", owner ? ["-U", owner, cupsJobId] : [cupsJobId]);
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
