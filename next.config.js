/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ffmpeg-static locates its binary relative to its own install path, so it
  // has to stay external to the bundle and its binary must be traced into the
  // functions that transcribe recordings.
  // Next 14 only reads outputFileTracingIncludes under `experimental`; at the
  // top level it is ignored and the binary is left out of the functions.
  experimental: {
    serverComponentsExternalPackages: ["ffmpeg-static"],
    outputFileTracingIncludes: {
      "/api/calls/recording": ["./node_modules/ffmpeg-static/**"],
      "/api/calls/webrtc-recording": ["./node_modules/ffmpeg-static/**"],
    },
  },
};

module.exports = nextConfig;
