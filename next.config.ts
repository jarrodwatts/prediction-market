import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow dev requests from tunnel URLs (Cloudflare, ngrok)
  allowedDevOrigins: [
    'https://*.trycloudflare.com',
    'https://*.ngrok-free.app',
    'https://*.ngrok.io',
  ],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.google.com",
      },
      {
        protocol: "https",
        hostname: "google.com",
      },
      {
        protocol: "https",
        hostname: "*",
      },
    ],
  },
  // Headers for Twitch extension compatibility
  async headers() {
    return [
      {
        // Apply to extension routes
        source: "/(overlay|ext-config)",
        headers: [
          {
            // Allow Twitch to iframe these pages
            key: "Content-Security-Policy",
            value: "frame-ancestors https://*.twitch.tv https://*.ext-twitch.tv https://localhost",
          },
        ],
      },
    ];
  },
  // Extension static export configuration
  // When EXPORT_EXTENSION=true, build only extension pages as static files
  ...(process.env.EXPORT_EXTENSION === 'true' && {
    output: 'export',
    distDir: 'extension-dist',
    // Use relative paths for static assets in extension
    assetPrefix: './',
    // Disable image optimization for static export
    images: {
      unoptimized: true,
    },
  }),
};

export default nextConfig;
