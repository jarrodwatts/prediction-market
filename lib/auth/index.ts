import NextAuth from "next-auth"
import { authConfig } from "./config"

export const { handlers, signIn, signOut, auth } = NextAuth(authConfig)

// Type augmentation for session
declare module "next-auth" {
  interface Session {
    accessToken: string
    twitchId: string
    twitchLogin: string
    twitchDisplayName: string
  }
}

