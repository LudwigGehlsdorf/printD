// Bad settings stop the server at startup, with every problem in the log, instead of
// surfacing later as failed logins or uploads.
import { configProblems } from "@/lib/config";

const problems = configProblems();
if (problems.length > 0) {
  const message = `printD is misconfigured:\n${problems.map((p) => `  - ${p}`).join("\n")}`;
  // Next.js only logs an error thrown during startup and keeps serving, so production exits.
  if (process.env.NODE_ENV !== "production") throw new Error(message);
  console.error(message);
  process.exit(1);
}
