/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? (process.env.NODE_ENV === 'development' ? '.next-dev' : '.next'),
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'pdfjs-dist', '@napi-rs/canvas'],
    // Next 14: native modules and pdf.js's dynamically loaded worker escape static tracing.
    outputFileTracingIncludes: {
      '/api/annual-bill/extract': [
        './node_modules/@napi-rs/canvas/**/*',
        './node_modules/@napi-rs/canvas-*/**/*',
        './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
      ],
      '/*': [
        './node_modules/sharp/**/*',
        './node_modules/@img/sharp-*/**/*'
      ]
    }
  },
  output: 'standalone'
};

export default nextConfig;
