/** @type {import('next').NextConfig} */
const nextConfig = {
  // حزمة تشغيل مستقلة لـ Docker فقط.
  // على Vercel يجب ألا تُفعّل، لذا نربطها بمتغيّر يُضبط داخل Dockerfile.
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' } : {}),
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
