import "server-only";
import { auth } from "@/auth";
import { config } from "@/lib/config";

export type User = {
  id: string;
  /** Short login name, e.g. the student id. */
  username: string;
  name: string;
  email: string;
};

export type Viewer =
  | { status: "anonymous" }
  | { status: "forbidden"; user: User; groups: string[] }
  | { status: "allowed"; user: User };

export async function getViewer(): Promise<Viewer> {
  if (config.devFakeUser) {
    return { status: "allowed", user: { id: "dev", username: "dev", name: "Dev User", email: "dev@localhost" } };
  }

  const session = await auth();
  if (!session?.user?.id) return { status: "anonymous" };

  const user: User = {
    id: session.user.id,
    username: session.username ?? session.user.email?.split("@")[0] ?? session.user.id,
    name: session.user.name ?? session.user.email ?? "Unknown",
    email: session.user.email ?? "",
  };
  const allowed = config.allowedGroups.length === 0 || session.groups.some(isInAllowedGroup);
  return allowed
    ? { status: "allowed", user }
    : { status: "forbidden", user, groups: session.groups };
}

/**
 * Groups are hierarchical, like on the D-sektionen website: membership of
 * "dsek.infu.mdlm" also counts as membership of "dsek.infu" and "dsek".
 */
function isInAllowedGroup(group: string) {
  return config.allowedGroups.some((allowed) => group === allowed || group.startsWith(`${allowed}.`));
}

/** For route handlers: returns the user, or a 401/403 response. */
export async function requireUser(): Promise<User | Response> {
  const viewer = await getViewer();
  if (viewer.status === "anonymous") return Response.json({ error: "Du är inte inloggad." }, { status: 401 });
  if (viewer.status === "forbidden") return Response.json({ error: "Du har inte behörighet att skriva ut." }, { status: 403 });
  return viewer.user;
}
