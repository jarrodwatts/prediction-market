import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "../providers";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Prediction Market Extension",
  description: "Twitch prediction market extension",
};

/**
 * Extension Layout
 *
 * Minimal layout for Twitch extension pages (overlay and ext-config).
 * Includes the Twitch Extension Helper script required for all extension functionality.
 */
export default function ExtensionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full">
      <head>
        {/* Twitch Extension Helper - Required for all Twitch extensions */}
        <script src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} h-full bg-card text-foreground antialiased`}>
        <Providers>
          <div className="h-full">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
