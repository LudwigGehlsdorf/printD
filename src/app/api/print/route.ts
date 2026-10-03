import fs from "node:fs/promises";
import { config } from "@/lib/config";
import { imageToPdf, selectPages } from "@/lib/convert";
import { jobs, uploads, type Upload } from "@/lib/db";
import { parseLayout } from "@/shared/image-layout";
import { generatePin, submit } from "@/lib/printer";
import { requireUser } from "@/lib/session";

const PAGE_RANGE = /^\d+(-\d+)?(,\d+(-\d+)?)*$/;

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const body = await request.json();
  const upload = uploads.get(body.uploadId, user.id);
  if (!upload) return Response.json({ error: "Filen har gått ut. Ladda upp den igen." }, { status: 404 });

  const copies = Number(body.copies);
  if (!Number.isInteger(copies) || copies < 1 || copies > config.maxCopies) {
    return Response.json({ error: `Antal kopior måste vara mellan 1 och ${config.maxCopies}.` }, { status: 400 });
  }
  const pageRange: string | null = upload.image ? null : body.pageRange || null;
  if (pageRange && !PAGE_RANGE.test(pageRange)) {
    return Response.json({ error: "Ogiltigt sidurval." }, { status: 400 });
  }

  const options = {
    copies,
    duplex: !upload.image && body.duplex === true,
    color: body.color === true,
    securePrint: config.securePrint ? { pin: generatePin(), username: user.username } : null,
  };
  const job = {
    user_id: user.id,
    user_name: user.name,
    user_email: user.email,
    file_name: upload.original_name,
    pages: upload.pages,
    copies,
    duplex: Number(options.duplex),
    color: Number(options.color),
    page_range: pageRange,
    pin: options.securePrint?.pin ?? null,
    created_at: Date.now(),
  };

  const printPath = `${upload.path}.print.pdf`;
  try {
    await fs.writeFile(printPath, await finalPdf(upload, pageRange, body.layout));
    const cupsJobId = await submit(printPath, upload.original_name, options);
    const status = config.printMode === "cups" ? "queued" : job.pin ? "held" : "done";
    jobs.insert({ ...job, cups_job_id: cupsJobId, status, error: null });
    return Response.json({ pin: job.pin, username: user.username });
  } catch (err) {
    console.error("Print failed", err);
    jobs.insert({ ...job, cups_job_id: null, status: "failed", error: String(err) });
    return Response.json({ error: "Skrivaren tog inte emot utskriften." }, { status: 502 });
  } finally {
    await fs.rm(upload.path, { force: true });
    await fs.rm(printPath, { force: true });
    uploads.delete(upload.id);
  }
}

// We build exactly what should be printed instead of relying on CUPS options: Canon's driver
// ignores page-ranges, and images need their layout applied anyway.
async function finalPdf(upload: Upload, pageRange: string | null, layout: unknown) {
  const data = await fs.readFile(upload.path);
  if (upload.image) return imageToPdf(data, upload.image, parseLayout(layout as object));
  return pageRange ? selectPages(data, pageRange) : data;
}
