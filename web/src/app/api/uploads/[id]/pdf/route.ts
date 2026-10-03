import fs from "node:fs/promises";
import { imageToPdf } from "@/lib/convert";
import { uploads } from "@/lib/db";
import { parseLayout } from "@/lib/image-layout";
import { requireUser } from "@/lib/session";

/** The upload as a PDF. For images it is built with the layout in `?layout=<json>`. */
export async function GET(request: Request, ctx: RouteContext<"/api/uploads/[id]/pdf">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const upload = uploads.get((await ctx.params).id, user.id);
  if (!upload) return Response.json({ error: "Hittades inte." }, { status: 404 });

  const data = await fs.readFile(upload.path);
  const layout = new URL(request.url).searchParams.get("layout");
  const pdf = upload.image ? await imageToPdf(data, upload.image, parseLayout(JSON.parse(layout ?? "{}"))) : data;

  return new Response(Buffer.from(pdf), {
    headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store" },
  });
}
