import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { ConversionError, isImageFile, prepareImage, toPdf } from "@/lib/convert";
import { uploads } from "@/lib/db";
import { cleanupExpiredUploads } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > config.maxUploadBytes + 1024 * 1024) {
    return Response.json({ error: "Filen är för stor." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Ingen fil skickades." }, { status: 400 });
  if (file.size > config.maxUploadBytes) {
    return Response.json({ error: "Filen är för stor." }, { status: 413 });
  }

  const id = crypto.randomUUID();
  const data = Buffer.from(await file.arrayBuffer());
  const base = { id, user_id: user.id, original_name: file.name.slice(0, 200), created_at: Date.now() };

  try {
    if (isImageFile(file.name)) {
      // Images are laid out on the page when printing, so keep the image itself.
      const { data: bytes, ...image } = await prepareImage(data);
      const filePath = path.join(config.uploadDir, `${id}.${image.format === "png" ? "png" : "jpg"}`);
      await fs.writeFile(filePath, bytes);
      uploads.insert({ ...base, pdf_path: filePath, pages: 1, image: JSON.stringify(image) });
      await cleanupExpiredUploads();
      return Response.json({
        id,
        name: file.name,
        pages: 1,
        image: { width: image.width, height: image.height, dpi: image.dpi },
      });
    }

    const converted = await toPdf(file.name, data);
    const pdfPath = path.join(config.uploadDir, `${id}.pdf`);
    await fs.writeFile(pdfPath, converted.pdf);
    uploads.insert({ ...base, pdf_path: pdfPath, pages: converted.pages, image: null });
    await cleanupExpiredUploads();
    return Response.json({ id, name: file.name, pages: converted.pages, image: null });
  } catch (err) {
    if (err instanceof ConversionError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}
