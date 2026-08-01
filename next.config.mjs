/** @type {import('next').NextConfig} */
const nextConfig = {
  // حزمة تشغيل مستقلة — تجعل صورة Docker أصغر وأسرع
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

export default nextConfig;
