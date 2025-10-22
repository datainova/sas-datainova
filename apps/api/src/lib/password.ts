import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const SCRYPT_KEY_LENGTH = 32;
const scrypt = promisify(scryptCallback);

const applyPepper = (secret: string, pepper: string) => `${secret}:${pepper}`;

export const hashPassword = async (password: string, pepper: string) => {
  const salt = randomBytes(16);
  const derived = (await scrypt(applyPepper(password, pepper), salt, SCRYPT_KEY_LENGTH)) as Buffer;
  return `${salt.toString('hex')}:${derived.toString('hex')}`;
};

export const verifyPassword = async (password: string, hash: string, pepper: string) => {
  const [saltHex, keyHex] = hash.split(':');
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, 'hex');
  const storedKey = Buffer.from(keyHex, 'hex');
  const derived = (await scrypt(applyPepper(password, pepper), salt, storedKey.length)) as Buffer;

  if (storedKey.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(storedKey, derived);
};
