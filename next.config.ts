import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Patchright contains optional runtime-loaded BiDi modules and must remain a
  // Node external. Bundle the Solari clients themselves so Vercel does not
  // have to resolve Next's hashed external-package symlinks at invocation.
  serverExternalPackages: ["patchright-core"],
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    }]
  },
}

export default nextConfig
