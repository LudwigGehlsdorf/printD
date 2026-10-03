import NextAuth from "next-auth";
import Authentik from "next-auth/providers/authentik";

declare module "next-auth" {
  interface Session {
    groups: string[];
    username: string;
  }
}

// Provider settings come from AUTH_AUTHENTIK_ID, AUTH_AUTHENTIK_SECRET and AUTH_AUTHENTIK_ISSUER.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Authentik({ authorization: { params: { scope: "openid email profile" } } })],
  session: { maxAge: 8 * 60 * 60 },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        token.groups = profile.groups ?? [];
        token.username = profile.preferred_username;
      }
      return token;
    },
    session({ session, token }) {
      session.groups = token.groups as string[];
      session.username = token.username as string;
      session.user.id = token.sub!;
      return session;
    },
  },
});
