import NextAuth from "next-auth";
import Authentik from "next-auth/providers/authentik";

declare module "next-auth" {
  interface Session {
    groups: string[];
    username: string | null;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Reads AUTH_AUTHENTIK_ID, AUTH_AUTHENTIK_SECRET and AUTH_AUTHENTIK_ISSUER.
  // An empty secret works with Authentik's public clients (e.g. the D-sektionen dev client).
  providers: [Authentik({ authorization: { params: { scope: "openid email profile" } } })],
  session: { maxAge: 8 * 60 * 60 },
  callbacks: {
    jwt({ token, profile }) {
      // Authentik's default "profile" scope mapping includes a `groups` claim.
      if (profile) {
        token.groups = Array.isArray(profile.groups) ? profile.groups : [];
        // The student id, e.g. "ab1234cd-s". Shown on the printer's panel for Secure Print jobs.
        token.username = typeof profile.preferred_username === "string" ? profile.preferred_username : null;
      }
      return token;
    },
    session({ session, token }) {
      session.groups = (token.groups as string[] | undefined) ?? [];
      session.username = (token.username as string | null | undefined) ?? null;
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
