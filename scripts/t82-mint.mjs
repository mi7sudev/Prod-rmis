// Task 82-b — mint NextAuth session JWTs (zero DB writes) for visual verification.
import { SignJWT } from "jose";
import { readFileSync, writeFileSync } from "node:fs";

const env = readFileSync("/home/z/my-project/.env", "utf8");
const secret = env.match(/^NEXTAUTH_SECRET=(.+)$/m)?.[1]?.trim();
if (!secret) throw new Error("NEXTAUTH_SECRET missing");
const key = new TextEncoder().encode(secret);

async function mint(claims) {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(key);
}

const [,, userId, email, name, role, out] = process.argv;
if (userId) {
  const token = await mint({ id: userId, email, name, role });
  writeFileSync(out, token);
  console.log("minted", role, email, "->", out);
} else {
  console.log("usage: mint.mjs <id> <email> <name> <role> <outfile>");
}
