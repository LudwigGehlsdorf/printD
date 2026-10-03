import sharp from "sharp";
import { uploads } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** A downscaled copy of an uploaded image for the layout preview. */
export async function GET(_request: Request, ctx: RouteContext<"/api/uploads/[id]/image">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const upload = uploads.get((await ctx.params).id, user.id);
  if (!upload?.image) return Response.json({ error: "Hittades inte." }, { status: 404 });

  const resized = sharp(upload.path).resize(1600, 1600, { fit: "inside", withoutEnlargement: true });
  const png = upload.image.format === "png";
  const preview = await (png ? resized.png() : resized.jpeg({ quality: 85 })).toBuffer();

  return new Response(new Uint8Array(preview), {
    headers: { "Content-Type": png ? "image/png" : "image/jpeg", "Cache-Control": "private, no-store" },
  });
}
