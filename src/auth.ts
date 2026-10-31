import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

// `repo` is needed so issues and PRs in private repos show up too. Drop it
// (keeping only `read:user`) if you want a public-data-only dashboard.
const scope = process.env.GITHUB_OAUTH_SCOPE ?? "read:user repo";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub({ authorization: { params: { scope } } })],
  session: { strategy: "jwt" },
  callbacks: {
    // The access token stays inside the encrypted JWT cookie. It is
    // deliberately NOT copied onto `session`, because /api/auth/session
    // would then hand it to the browser.
    jwt({ token, account, profile }) {
      if (account?.access_token) token.accessToken = account.access_token;
      if (profile && typeof profile.login === "string") token.login = profile.login;
      return token;
    },
  },
});
