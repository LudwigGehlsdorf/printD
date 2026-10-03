import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "@/lib/config";
import { ConversionError, isImageFile, prepareImage, toPdf } from "@/lib/convert";
import { uploads } from "@/lib/db";
import { deleteOldUploads } from "@/lib/jobs";
import { requireUser } from "@/lib/session";

export async function POST(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return Response.json({ error: "Ingen fil skickades." }, { status: 400 });
  if (file.size > config.maxUploadBytes) return Response.json({ error: "Filen är för stor." }, { status: 413 });

  const id = crypto.randomUUID();
  const data = Buffer.from(await file.arrayBuffer());
  try {
    const saved = isImageFile(file.name) ? await saveImage(id, data) : await savePdf(id, file.name, data);
    uploads.insert({ id, user_id: user.id, original_name: file.name, created_at: Date.now(), ...saved });
    await deleteOldUploads();
    return Response.json({ id, name: file.name, pages: saved.pages, image: saved.image });
  } catch (err) {
    if (err instanceof ConversionError) return Response.json({ error: err.message }, { status: 422 });
    throw err;
  }
}

// Images stay images until printing, so their layout can still be changed.
async function saveImage(id: string, data: Buffer) {
  const image = await prepareImage(data);
  const file = path.join(config.uploadDir, `${id}.${image.meta.format}`);
  await fs.writeFile(file, image.data);
  return { path: file, pages: 1, image: image.meta };
}

async function savePdf(id: string, name: string, data: Buffer) {
  const { pdf, pages } = await toPdf(name, data);
  const file = path.join(config.uploadDir, `${id}.pdf`);
  await fs.writeFile(file, pdf);
  return { path: file, pages, image: null };
}
