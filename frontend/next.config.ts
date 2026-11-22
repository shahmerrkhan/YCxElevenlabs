import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false, // hide the Next badge so it never shows in the phone demo
  // Repo root, so the frontend can import the shared ../mocks/*.json (the contract's examples).
  turbopack: { root: path.join(__dirname, '..') },
  // Frontend calls /api/*; Next forwards to the backend (GETs only; POSTs are agent-only).
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.BACKEND_URL || 'http://localhost:3000'}/:path*`,
      },
    ]
  },
}

export default nextConfig
