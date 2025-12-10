import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
