import { jobs } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** Hides a finished job from the user's list. It stays in the print log. */
export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/hide">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await ctx.params;
  const job = jobs.get(Number(id), user.id);
  if (!job) return Response.json({ error: "Hittades inte." }, { status: 404 });
  if (job.status === "queued" || job.status === "printing") {
    return Response.json({ error: "Avbryt utskriften innan du döljer den." }, { status: 409 });
  }
  jobs.hide(job.id);
  return Response.json({ ok: true });
}
