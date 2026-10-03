import fs from "node:fs/promises";
import { config } from "@/lib/config";
import { ConversionError, imageToPdf, readImageUpload, selectPages } from "@/lib/convert";
import { jobs, uploads } from "@/lib/db";
import { DEFAULT_LAYOUT, parseLayout } from "@/lib/image-layout";
import { generatePin, submit } from "@/lib/printer";
import { requireUser } from "@/lib/session";

const PAGE_RANGE = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.uploadId !== "string") {
    return Response.json({ error: "Ogiltig förfrågan." }, { status: 400 });
  }

  const upload = uploads.get(body.uploadId, user.id);
  if (!upload) {
    return Response.json({ error: "Filen har gått ut. Ladda upp den igen." }, { status: 404 });
  }

  const copies = Number(body.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > config.maxCopies) {
    return Response.json({ error: `Antal kopior måste vara mellan 1 och ${config.maxCopies}.` }, { status: 400 });
  }

  const pageRange = typeof body.pageRange === "string" ? body.pageRange.replace(/\s/g, "") : "";
  if (pageRange && !PAGE_RANGE.test(pageRange)) {
    return Response.json({ error: "Ogiltigt sidurval." }, { status: 400 });
  }

  const isImage = upload.image !== null;
  const options = {
    copies,
    // Images are always a single page.
    duplex: !isImage && body.duplex === true,
    color: body.color === true,
    pageRange: isImage ? null : pageRange || null,
    securePrint: config.securePrint ? { pin: generatePin(), userName: user.username } : null,
  };
  const title = upload.original_name.replace(/[^\p{L}\p{N} ._()-]/gu, "_");

  const job = {
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    file_name: upload.original_name,
    pages: upload.pages,
    copies: options.copies,
    duplex: options.duplex ? 1 : 0,
    color: options.color ? 1 : 0,
    page_range: options.pageRange,
    pin: options.securePrint?.pin ?? null,
    created_at: Date.now(),
  };

  try {
    let pdfPath = upload.pdf_path;
    if (isImage) {
      const layout = parseLayout(body.layout) ?? DEFAULT_LAYOUT;
      pdfPath = `${upload.pdf_path}.print.pdf`;
      await fs.writeFile(pdfPath, await imageToPdf(await readImageUpload(upload), layout));
    } else if (options.pageRange) {
      // Send only the chosen pages rather than relying on the driver to honour page-ranges.
      pdfPath = `${upload.pdf_path}.print.pdf`;
      await fs.writeFile(pdfPath, await selectPages(await fs.readFile(upload.pdf_path), options.pageRange, upload.pages));
    }
    const cupsJobId = await submit(pdfPath, title, { ...options, pageRange: null });
    const status = config.printMode === "dry-run" ? (job.pin ? "held" : "done") : "queued";
    const id = jobs.insert({ ...job, cups_job_id: cupsJobId, status, error: null });
    return Response.json({ id, pin: job.pin, panelUser: options.securePrint?.userName ?? null });
  } catch (err) {
    if (err instanceof ConversionError) return Response.json({ error: err.message }, { status: 422 });
    console.error("Print failed", err);
    jobs.insert({ ...job, cups_job_id: null, status: "failed", error: String(err) });
    return Response.json({ error: "Skrivaren tog inte emot utskriften." }, { status: 502 });
  } finally {
    await fs.rm(upload.pdf_path, { force: true });
    await fs.rm(`${upload.pdf_path}.print.pdf`, { force: true });
    uploads.delete(upload.id);
  }
}
