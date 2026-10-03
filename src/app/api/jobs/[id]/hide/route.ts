import { jobs } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/hide">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const job = jobs.get(Number((await ctx.params).id), user.id);
  if (!job) return Response.json({ error: "Hittades inte." }, { status: 404 });
  if (job.status === "queued") {
    return Response.json({ error: "Avbryt utskriften innan du döljer den." }, { status: 409 });
  }

  jobs.hide(job.id);
  return Response.json({ ok: true });
}
