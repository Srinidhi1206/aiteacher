/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Next 14 loads instrumentation.ts only when this flag is on. It runs the production start-up
  // configuration check (see instrumentation.ts).
  experimental: {
    instrumentationHook: true,
    // The OCR page renderer (PDFium, WebAssembly) is loaded from node_modules at run time, not bundled: keep it external and make
    // sure its .wasm file is deployed with the server code.
    serverComponentsExternalPackages: ["@hyzyla/pdfium"],
    outputFileTracingIncludes: { "/**": ["./node_modules/@hyzyla/pdfium/dist/pdfium.wasm"] },
  },
};

export default nextConfig;
