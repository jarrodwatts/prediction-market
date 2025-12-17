import NextAuth from "next-auth"
import { authConfig } from "./config"

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)

// Type augmentation for NextAuth
declare module "next-auth" {
  /**
   * Extended session type with Twitch OAuth data
   */
  interface Session {
    /** Twitch OAuth access token for API calls */
    accessToken: string
    /** Twitch user ID (numeric string) */
    twitchId: string
    /** Twitch login/username (lowercase) */
    twitchLogin: string
    /** Twitch display name */
    twitchDisplayName: string
  }
}

declare module "@auth/core/jwt" {
  /**
   * Extended JWT type with Twitch OAuth data
   */
  interface JWT {
    accessToken?: string
    refreshToken?: string
    twitchId?: string
    twitchLogin?: string
    twitchDisplayName?: string
    expiresAt?: number
  }
}

