import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Leaflet to work (it uses browser-only APIs)
  experimental: {},
  // Ensure leaflet CSS is loaded properly
  transpilePackages: ['leaflet', 'react-leaflet'],
};

export default nextConfig;
