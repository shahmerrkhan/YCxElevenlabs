import os from 'node:os'
import path from 'node:path'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false, // hide the Next badge so it never shows in the phone demo
  // Dev only: let a phone on the same Wi-Fi (this machine's LAN IPs) or an HTTPS tunnel load the dev server's JS.
  allowedDevOrigins: [...lanIPs(), '*.trycloudflare.com', '*.ngrok-free.app', '*.loca.lt'],
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

/** This machine's IPv4 addresses on the local network (Next's wildcards can't match IPs). */
function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i!.address)
}

export default nextConfig
