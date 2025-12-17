import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { Header } from "@/components/header";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "./providers";
import { headers } from "next/headers";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

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
  title: "Prediction Market",
  description: "Open source prediction market platform",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check if this is an extension route (overlay or ext-config)
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") || headersList.get("x-invoke-path") || "";
  const isExtensionRoute = pathname.includes("/overlay") || pathname.includes("/ext-config");

  // Extension routes get a minimal layout optimized for Video Component
  if (isExtensionRoute) {
    return (
      <html lang="en" className="dark h-full">
        <head>
          {/* Twitch Extension Helper - Required for all Twitch extensions */}
          <script 
            src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js"
            // @ts-ignore - strategy not needed for regular script tag
          />
        </head>
        <body className={`${geistSans.variable} ${geistMono.variable} h-full bg-card text-foreground antialiased`}>
          <Providers>
            <div className="h-full">
              {children}
            </div>
          </Providers>
          <SpeedInsights />
        </body>
      </html>
    );
  }

  // Regular app layout
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          <Providers>
            <AuroraBackground />
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
            </div>
            <Toaster
              position="bottom-right"
              expand={false}
              richColors
              closeButton
              duration={5000}
            />
          </Providers>
          <SpeedInsights />
        </ThemeProvider>
      </body>
    </html>
  );
}
