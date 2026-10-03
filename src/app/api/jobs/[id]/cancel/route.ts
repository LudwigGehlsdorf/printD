import { jobs } from "@/lib/db";
import { cancel } from "@/lib/printer";
import { requireUser } from "@/lib/session";

export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const job = jobs.get(Number((await ctx.params).id), user.id);
  if (!job) return Response.json({ error: "Hittades inte." }, { status: 404 });
  if (job.status !== "queued") {
    return Response.json({ error: "Utskriften har redan skickats till skrivaren." }, { status: 409 });
  }

  await cancel(job.cups_job_id!);
  jobs.setStatus(job.id, "cancelled");
  return Response.json({ ok: true });
}
