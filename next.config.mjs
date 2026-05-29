import withSerwistInit from "@serwist/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.1.87'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.js",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
  reloadOnOnline: true,
  // Disabled in dev (Turbopack): we test the service worker against the prod build only.
  disable: process.env.NODE_ENV === "development",
  // App Router page HTML is NOT auto-precached by @serwist/next, so the offline
  // document fallback must be listed explicitly or it has nothing to serve offline.
  // Revision is evaluated once at config load — busts the precache on each build.
  additionalPrecacheEntries: [{ url: "/~offline", revision: crypto.randomUUID() }],
});

export default withSerwist(nextConfig);
