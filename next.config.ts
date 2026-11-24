import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pg', 'ioredis', 'bullmq'],
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', 'motion'],
  },
};

export default nextConfig;
