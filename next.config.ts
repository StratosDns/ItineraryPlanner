import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Leaflet accesses `window` — silence the SSR warning (we already use dynamic import)
  transpilePackages: [],
  // Allow Supabase Storage image domains if you later use next/image for attachments
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
