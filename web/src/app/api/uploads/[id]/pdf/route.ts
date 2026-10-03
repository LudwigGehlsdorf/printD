import fs from "node:fs/promises";
import { imageToPdf, readImageUpload } from "@/lib/convert";
import { uploads } from "@/lib/db";
import { DEFAULT_LAYOUT, parseLayout } from "@/lib/image-layout";
import { requireUser } from "@/lib/session";

/**
 * Serves the converted PDF so the user can preview it before printing. For images, the PDF is
 * built with the layout passed as `?layout=<json>`.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[id]/pdf">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await ctx.params;
  const upload = uploads.get(id, user.id);
  if (!upload) return Response.json({ error: "Hittades inte." }, { status: 404 });

  let pdf: Uint8Array | null;
  if (upload.image) {
    const param = new URL(request.url).searchParams.get("layout");
    let requested: unknown = null;
    try {
      requested = param ? JSON.parse(param) : null;
    } catch {}
    const layout = parseLayout(requested) ?? DEFAULT_LAYOUT;
    pdf = await imageToPdf(await readImageUpload(upload), layout);
  } else {
    pdf = await fs.readFile(upload.pdf_path).catch(() => null);
  }
  if (!pdf) return Response.json({ error: "Hittades inte." }, { status: 404 });

  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
    },
  });
}
