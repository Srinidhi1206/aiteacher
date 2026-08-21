// Password hashing for the database-backed auth path (Stage B). Uses
// bcryptjs (pure JS, no native/node-gyp compilation step) specifically
// because it needs to run identically on Vercel's serverless Node runtime
// and in local dev without a native-module build step.
//
// Server-only: never import this from a Client Component.
import "server-only";

import bcrypt from "bcryptjs";

// 12 rounds is bcrypt's commonly recommended minimum for new applications
// in 2024+ (10 is the historical default; 12 costs ~250ms per hash on
// typical serverless CPU, an acceptable login-time cost).
const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}
