import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";


// "repo" is what lets private repos show up. Use just "read:user" for public data only.
const scope = process.env.GITHUB_OAUTH_SCOPE ?? "read:user repo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope } } })],
  session: { strategy: "jwt" },
  callbacks: {
    // Keep the access token in the JWT only. On `session` it would be readable via /api/auth/session.
    jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (profile && typeof profile.login === "string") token.login = profile.login;
      return token;
    },
  },
});
