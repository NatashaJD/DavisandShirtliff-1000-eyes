/** @type {import('next').NextConfig} */
const nextConfig = {
  // NEXT_PUBLIC_API_URL controls the backend target.
  // Set to the real Fastify API when running in production or with `apps/api` running.
  // Falls back to http://localhost:4000 (dev-server.mjs mock) when not set.
  //
  // Example:
  //   NEXT_PUBLIC_API_URL=http://localhost:3001  (real API default port)
  //   NEXT_PUBLIC_API_URL=http://localhost:4000  (dev-server mock)

  reactStrictMode: true,

  // Allow images from any hostname during development
  images: {
    remotePatterns: [],
  },
};

export default nextConfig;
