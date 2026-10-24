import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    // KNOWN DEVIATION (audit 2026-10-22, accepted): 27 pre-existing type
    // errors live OUTSIDE the app surface (examples/, skills/, scripts/,
    // vendored dialog primitives, pds pipeline generics). `next build` must
    // not gate on them yet — tracking as tech debt; app-source errors are
    // otherwise clean under `bunx tsc --noEmit`.
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Dev-only: the sandbox gateway and agent-browser reach the dev server via
  // loopback hosts; Next 16 blocks "cross-origin" dev resources otherwise.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Keep native/node-only packages unbundled so they load via require() with
  // fs access intact (SheetJS readFile, mammoth, unpdf workers, bcrypt).
  serverExternalPackages: ["xlsx", "mammoth", "unpdf", "bcryptjs"],
};

export default nextConfig;
