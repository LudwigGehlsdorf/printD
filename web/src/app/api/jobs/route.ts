import { recentJobs } from "@/lib/jobs";
import { printerStatus } from "@/lib/printer";
import { requireUser } from "@/lib/session";

export async function GET(request: Request) {
  const user = await requireUser();
  if (user instanceof Response) return user;

  const limit = Number(new URL(request.url).searchParams.get("limit")) || 10;
  const [jobs, printer] = await Promise.all([recentJobs(user.id, limit), printerStatus()]);
  return Response.json({ jobs, printer });
}
