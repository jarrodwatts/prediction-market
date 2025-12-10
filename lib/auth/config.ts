import type { NextAuthConfig } from "next-auth"
import Twitch from "next-auth/providers/twitch"

export const authConfig: NextAuthConfig = {
  providers: [
    Twitch({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid user:read:email channel:read:predictions",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // Persist the access_token and Twitch user info to the JWT
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.twitchId = account.providerAccountId
        token.expiresAt = account.expires_at
      }
      if (profile) {
        token.twitchLogin = (profile as any).preferred_username || (profile as any).login
        token.twitchDisplayName = (profile as any).display_name || (profile as any).name
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client
      return {
        ...session,
        accessToken: token.accessToken as string,
        twitchId: token.twitchId as string,
        twitchLogin: token.twitchLogin as string,
        twitchDisplayName: token.twitchDisplayName as string,
      }
    },
  },
  pages: {
    signIn: "/streamer/login",
  },
}

