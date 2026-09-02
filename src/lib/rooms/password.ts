import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const PASSWORD_PREFIX = "scrypt";
const SALT_BYTES = 16;
const KEY_BYTES = 32;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_BYTES, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashRoomPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await deriveKey(password, salt);
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyRoomPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const [prefix, encodedSalt, encodedKey, extra] = storedHash.split("$");
  if (prefix !== PASSWORD_PREFIX || !encodedSalt || !encodedKey || extra) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedKey, "base64url");
    if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) return false;
    const actual = await deriveKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
