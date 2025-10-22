import { createHash, randomBytes } from 'node:crypto';

export const generateToken = (size = 32) => randomBytes(size).toString('base64url');

export const hashToken = (token: string) => {
  return createHash('sha256').update(token).digest('hex');
};

export const generateState = () => generateToken(24);

export const createPkcePair = () => {
  const verifier = generateToken(48);
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};
