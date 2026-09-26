/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 14 loads instrumentation.ts only when this flag is on. It runs the production start-up
  // configuration check (see instrumentation.ts).
  experimental: { instrumentationHook: true },
};

export default nextConfig;
