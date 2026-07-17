import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

// Формат хэша: scrypt$N$r$p$<salt base64url>$<hash base64url>.
// Параметры парсятся при verify, поэтому их можно поднимать без ломки старых хэшей.
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// Обязателен при N=32768, r=8: дефолтный лимит scrypt (32 МиБ) меньше 128*N*r.
const SCRYPT_MAX_MEM = 64 * 1024 * 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      keyLength,
      { ...options, maxmem: SCRYPT_MAX_MEM },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

function formatHash(salt: Buffer, hash: Buffer): string {
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join("$");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return formatHash(salt, hash);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, rawN, rawR, rawP, rawSalt, rawHash] = parts;
  const N = Number(rawN);
  const r = Number(rawR);
  const p = Number(rawP);
  if (![N, r, p].every((value) => Number.isInteger(value) && value > 0)) {
    return false;
  }

  const salt = Buffer.from(rawSalt!, "base64url");
  const expected = Buffer.from(rawHash!, "base64url");
  if (salt.length === 0 || expected.length === 0) {
    return false;
  }

  try {
    const actual = await scryptAsync(password, salt, expected.length, { N, r, p });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// Хэш случайного пароля: verify по нему всегда false, но с тем же временем
// работы — выравнивает время ответа логина для несуществующих пользователей.
const dummySalt = randomBytes(SALT_LENGTH);
export const DUMMY_HASH = formatHash(
  dummySalt,
  scryptSync(randomBytes(32).toString("base64url"), dummySalt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEM,
  }),
);
