import "server-only";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from "pdf-lib";
import sharp from "sharp";
import { config } from "@/lib/config";
import { layoutImage, type ImageInfo, type ImageLayout } from "@/lib/image-layout";

const execFileAsync = promisify(execFile);

const OFFICE_EXTENSIONS = new Set([
  ".doc", ".docx", ".odt", ".rtf", ".txt",
  ".xls", ".xlsx", ".ods", ".csv",
  ".ppt", ".pptx", ".odp",
  ".bmp",
]);

/** Images that get the layout controls (scaling, orientation, margins, several per sheet). */
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"]);

export const ACCEPTED_EXTENSIONS = [".pdf", ...IMAGE_EXTENSIONS, ...OFFICE_EXTENSIONS];

export function isImageFile(fileName: string) {
  return IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

export class ConversionError extends Error {}

/** Converts an uploaded file to a PDF and returns its bytes and page count. */
export async function toPdf(fileName: string, data: Buffer): Promise<{ pdf: Uint8Array; pages: number }> {
  const ext = path.extname(fileName).toLowerCase();

  let pdf: Uint8Array;
  if (ext === ".pdf") {
    pdf = data;
  } else if (OFFICE_EXTENSIONS.has(ext)) {
    pdf = await officeToPdf(ext, data);
  } else {
    throw new ConversionError(`Filtypen ${ext || fileName} stöds inte.`);
  }

  try {
    const doc = await PDFDocument.load(pdf, { ignoreEncryption: true });
    return { pdf, pages: doc.getPageCount() };
  } catch {
    throw new ConversionError("Filen kunde inte läsas. Den kan vara skadad.");
  }
}

export type PreparedImage = ImageInfo & { data: Buffer; format: "jpeg" | "png" };

/**
 * Normalises an uploaded image: applies the rotation phones store in EXIF (so it prints the
 * way it looks), converts WebP/GIF/TIFF, and reads its size and resolution.
 */
export async function prepareImage(data: Buffer): Promise<PreparedImage> {
  try {
    const input = sharp(data, { animated: false });
    const meta = await input.metadata();
    const format = meta.hasAlpha ? "png" : "jpeg";
    const pipeline = input.rotate();
    const { data: out, info } = await (format === "png"
      ? pipeline.png()
      : pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: 92 })
    ).toBuffer({ resolveWithObject: true });
    return { data: out, format, width: info.width, height: info.height, dpi: meta.density || 72 };
  } catch {
    throw new ConversionError("Bilden kunde inte läsas. Den kan vara skadad.");
  }
}

/** Builds a one-page PDF with the image placed according to the layout. */
export async function imageToPdf(image: PreparedImage, layout: ImageLayout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const embedded = image.format === "png" ? await doc.embedPng(image.data) : await doc.embedJpg(image.data);
  const page = layoutImage(image, layout);
  const pdfPage = doc.addPage([page.width, page.height]);
  // PDF coordinates start in the bottom-left corner.
  const flip = (r: { y: number; h: number }) => page.height - r.y - r.h;

  for (const cell of page.cells) {
    // Clip to the cell so cropped images ("fill", or moved partly outside) stay inside it.
    pdfPage.pushOperators(pushGraphicsState(), rectangle(cell.x, flip(cell), cell.w, cell.h), clip(), endPath());
    pdfPage.drawImage(embedded, { x: cell.image.x, y: flip(cell.image), width: cell.image.w, height: cell.image.h });
    pdfPage.pushOperators(popGraphicsState());
  }
  return doc.save();
}

// LibreOffice is memory hungry on a Raspberry Pi, so only one conversion runs at a time.
let officeQueue: Promise<unknown> = Promise.resolve();

function officeToPdf(ext: string, data: Buffer): Promise<Uint8Array> {
  const run = officeQueue.then(() => convertWithLibreOffice(ext, data));
  officeQueue = run.catch(() => {});
  return run;
}

async function convertWithLibreOffice(ext: string, data: Buffer): Promise<Uint8Array> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "print-convert-"));
  try {
    const input = path.join(dir, `input${ext}`);
    await fs.writeFile(input, data);
    try {
      await execFileAsync(
        config.soffice,
        [
          `-env:UserInstallation=file://${path.join(dir, "profile")}`,
          "--headless",
          "--convert-to",
          "pdf",
          "--outdir",
          dir,
          input,
        ],
        { timeout: 120_000 },
      );
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ConversionError("Dokument kan inte konverteras just nu (LibreOffice saknas). Spara som PDF och försök igen.");
      }
      throw new ConversionError("Dokumentet kunde inte konverteras till PDF. Spara som PDF och försök igen.");
    }
    try {
      return await fs.readFile(path.join(dir, "input.pdf"));
    } catch {
      throw new ConversionError("Dokumentet kunde inte konverteras till PDF. Spara som PDF och försök igen.");
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Reads an image upload back from disk. */
export async function readImageUpload(upload: { pdf_path: string; image: string | null }): Promise<PreparedImage> {
  const meta = JSON.parse(upload.image ?? "null") as (ImageInfo & { format: "jpeg" | "png" }) | null;
  if (!meta) throw new Error("Not an image upload");
  return { ...meta, data: await fs.readFile(upload.pdf_path) };
}

/**
 * Keeps only the pages in `range` ("1-3,5", 1-based). We do this ourselves because some drivers
 * (Canon's macOS UFR II filter) take the PDF directly and ignore CUPS's page-ranges option.
 */
export async function selectPages(pdf: Uint8Array, range: string, pageCount: number): Promise<Uint8Array> {
  const wanted: number[] = [];
  for (const part of range.split(",")) {
    const [from, to = from] = part.split("-").map(Number);
    for (let p = from; p <= Math.min(to, pageCount); p++) if (p >= 1 && !wanted.includes(p - 1)) wanted.push(p - 1);
  }
  if (wanted.length === 0) throw new ConversionError("Inga av de valda sidorna finns i dokumentet.");
  const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(source, wanted)) out.addPage(page);
  return out.save();
}
