import "server-only";
import { auth } from "@/auth";
import { config } from "@/lib/config";

export type User = { id: string; username: string; name: string; email: string };

export type Viewer =
  | { status: "anonymous" }
  | { status: "forbidden"; user: User; groups: string[] }
  | { status: "allowed"; user: User };

export async function getViewer(): Promise<Viewer> {
  if (config.devFakeUser) {
    return { status: "allowed", user: { id: "dev", username: "dev", name: "Dev User", email: "dev@localhost" } };
  }

  const session = await auth();
  if (!session?.user) return { status: "anonymous" };

  const user = {
    id: session.user.id!,
    username: session.username,
    name: session.user.name ?? session.username,
    email: session.user.email ?? "",
  };
  return config.allowedGroups.length === 0 || session.groups.some(isAllowedGroup)
    ? { status: "allowed", user }
    : { status: "forbidden", user, groups: session.groups };
}

// Groups are hierarchical like on dsek.se: "dsek.infu.mdlm" is also a member of "dsek.infu".
function isAllowedGroup(group: string) {
  return config.allowedGroups.some((allowed) => group === allowed || group.startsWith(`${allowed}.`));
}

/** For route handlers: the user, or a 401/403 response to return. */
export async function requireUser(): Promise<User | Response> {
  const viewer = await getViewer();
  if (viewer.status === "anonymous") return Response.json({ error: "Du är inte inloggad." }, { status: 401 });
  if (viewer.status === "forbidden") return Response.json({ error: "Du har inte behörighet att skriva ut." }, { status: 403 });
  return viewer.user;
}
