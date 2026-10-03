import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from "pdf-lib";
import sharp from "sharp";
import { config } from "@/lib/config";
import type { ImageMeta } from "@/lib/db";
import { layoutImage, type ImageLayout } from "@/shared/image-layout";

const run = promisify(execFile);

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"];
const OFFICE_EXTENSIONS = [
  ".doc", ".docx", ".odt", ".rtf", ".txt",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp",
  ".bmp",
];

export const ACCEPTED_EXTENSIONS = [".pdf", ...IMAGE_EXTENSIONS, ...OFFICE_EXTENSIONS];

/** An error whose message is meant for the user. */
export class ConversionError extends Error {}

export const isImageFile = (fileName: string) => IMAGE_EXTENSIONS.includes(path.extname(fileName).toLowerCase());

export async function toPdf(fileName: string, data: Buffer) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext !== ".pdf" && !OFFICE_EXTENSIONS.includes(ext)) {
    throw new ConversionError(`Filtypen ${ext || fileName} stöds inte.`);
  }

  const pdf = ext === ".pdf" ? data : await officeToPdf(ext, data);
  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    return { pdf, pages: doc.getPageCount() };
  } catch {
    throw new ConversionError("Filen kunde inte läsas. Den kan vara skadad.");
  }
}

/**
 * Applies the rotation phones store in EXIF, so photos print the way they look, and converts
 * everything to JPEG or PNG for pdf-lib.
 */
export async function prepareImage(data: Buffer): Promise<{ data: Buffer; meta: ImageMeta }> {
  try {
    const input = sharp(data, { animated: false });
    const { hasAlpha, density } = await input.metadata();
    const output = hasAlpha ? input.rotate().png() : input.rotate().flatten({ background: "#fff" }).jpeg({ quality: 92 });
    const { data: bytes, info } = await output.toBuffer({ resolveWithObject: true });
    return {
      data: bytes,
      meta: { format: hasAlpha ? "png" : "jpeg", width: info.width, height: info.height, dpi: density ?? 72 },
    };
  } catch {
    throw new ConversionError("Bilden kunde inte läsas. Den kan vara skadad.");
  }
}

export async function imageToPdf(data: Buffer, meta: ImageMeta, layout: ImageLayout) {
  const doc = await PDFDocument.create();
  const image = meta.format === "png" ? await doc.embedPng(data) : await doc.embedJpg(data);
  const page = layoutImage(meta, layout);
  const pdfPage = doc.addPage([page.width, page.height]);
  // The layout measures from the top, PDF from the bottom.
  const bottom = (r: { y: number; h: number }) => page.height - r.y - r.h;

  for (const cell of page.cells) {
    // Clip to the cell so cropped or moved images stay inside it.
    pdfPage.pushOperators(pushGraphicsState(), rectangle(cell.x, bottom(cell), cell.w, cell.h), clip(), endPath());
    pdfPage.drawImage(image, { x: cell.image.x, y: bottom(cell.image), width: cell.image.w, height: cell.image.h });
    pdfPage.pushOperators(popGraphicsState());
  }
  return doc.save();
}

/** Keeps only the pages in a range like "1-3,5". */
export async function selectPages(pdf: Buffer, range: string) {
  const pages = range.split(",").flatMap((part) => {
    const [from, to = from] = part.split("-").map(Number);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i - 1);
  });
  const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(source, pages)) out.addPage(page);
  return out.save();
}

// LibreOffice needs a few hundred MB per conversion, too much to run several at once on a
// small server, so conversions wait for each other.
let officeQueue: Promise<unknown> = Promise.resolve();

function officeToPdf(ext: string, data: Buffer) {
  const next = officeQueue.then(() => convertWithLibreOffice(ext, data));
  officeQueue = next.catch(() => {});
  return next;
}

async function convertWithLibreOffice(ext: string, data: Buffer) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "printd-"));
  const input = path.join(dir, `input${ext}`);
  const failed = "Dokumentet kunde inte konverteras. Spara som PDF och försök igen.";
  try {
    await fs.writeFile(input, data);
    // A fresh profile per run, so a crashed run can't leave it locked.
    await run(
      config.soffice,
      [`-env:UserInstallation=file://${dir}/profile`, "--headless", "--convert-to", "pdf", "--outdir", dir, input],
      { timeout: 120_000 },
    ).catch((err) => {
      const missing = err.code === "ENOENT";
      throw new ConversionError(missing ? "Dokument kan inte konverteras just nu. Spara som PDF och försök igen." : failed);
    });
    return await fs.readFile(path.join(dir, "input.pdf")).catch(() => {
      throw new ConversionError(failed);
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
