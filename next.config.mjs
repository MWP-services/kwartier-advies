/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas']
  },
  output: 'standalone'
};

export default nextConfig;
