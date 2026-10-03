import fs from "node:fs/promises";
import sharp from "sharp";
import { uploads } from "@/lib/db";
import { requireUser } from "@/lib/session";

/**
 * Serves an uploaded image (already rotated upright) for the layout preview, scaled down so
 * phones do not have to load a full-size photo. The PDF is always built from the original.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]/image">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await ctx.params;
  const upload = uploads.get(id, user.id);
  if (!upload?.image) return Response.json({ error: "Hittades inte." }, { status: 404 });

  const data = await fs.readFile(upload.pdf_path).catch(() => null);
  if (!data) return Response.json({ error: "Hittades inte." }, { status: 404 });

  const png = upload.pdf_path.endsWith(".png");
  const resized = sharp(data).resize(1600, 1600, { fit: "inside", withoutEnlargement: true });
  const preview = await (png ? resized.png() : resized.jpeg({ quality: 85 })).toBuffer();

  return new Response(new Uint8Array(preview), {
    headers: {
      "Content-Type": png ? "image/png" : "image/jpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
