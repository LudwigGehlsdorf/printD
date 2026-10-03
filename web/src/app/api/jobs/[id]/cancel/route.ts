import { cancelJob } from "@/lib/jobs";
import { jobs } from "@/lib/db";
import { requireUser } from "@/lib/session";

/** Cancels a job that has not been sent to the printer yet. */
export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/cancel">) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const { id } = await ctx.params;
  const job = jobs.get(Number(id), user.id);
  if (!job) return Response.json({ error: "Hittades inte." }, { status: 404 });
  if (job.status !== "queued" && job.status !== "printing") {
    return Response.json({ error: "Utskriften har redan skickats till skrivaren." }, { status: 409 });
  }
  if (!(await cancelJob(job))) {
    return Response.json({ error: "Utskriften kunde inte avbrytas." }, { status: 502 });
  }
  return Response.json({ ok: true });
}
