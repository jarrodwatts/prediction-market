import type { NextAuthConfig } from "next-auth"
import type { JWT } from "@auth/core/jwt"
import Twitch from "next-auth/providers/twitch"

/**
 * Twitch profile shape from OpenID Connect
 */
interface TwitchProfile {
  sub: string
  preferred_username?: string
  login?: string
  display_name?: string
  name?: string
  picture?: string
}

export const authConfig: NextAuthConfig = {
  // Trust the Host header when behind a proxy (Cloudflare tunnel, etc.)
  trustHost: true,
  // Cookie configuration for third-party iframe context (Twitch extension)
  // sameSite: 'none' required for cookies to work in cross-origin iframes
  cookies: {
    sessionToken: {
      name: `__Secure-authjs.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    callbackUrl: {
      name: `__Secure-authjs.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
    csrfToken: {
      // Can't use __Host- prefix with sameSite: 'none'
      name: `__Secure-authjs.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'none',
        path: '/',
        secure: true,
      },
    },
  },
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
    async jwt({ token, account, profile }): Promise<JWT> {
      // Persist the access_token and Twitch user info to the JWT
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.twitchId = account.providerAccountId
        token.expiresAt = account.expires_at
      }
      if (profile) {
        const twitchProfile = profile as TwitchProfile
        token.twitchLogin = twitchProfile.preferred_username || twitchProfile.login
        token.twitchDisplayName = twitchProfile.display_name || twitchProfile.name
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client
      return {
        ...session,
        accessToken: token.accessToken ?? '',
        twitchId: token.twitchId ?? '',
        twitchLogin: token.twitchLogin ?? '',
        twitchDisplayName: token.twitchDisplayName ?? '',
      }
    },
  },
  pages: {
    signIn: "/streamer/login",
  },
}

