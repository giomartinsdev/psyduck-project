import { Injectable } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';

@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex');
    const hash = createHash('sha256')
      .update(salt + password)
      .digest('hex');
    return `${salt}:${hash}`;
  }

  async compare(password: string, stored: string): Promise<boolean> {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const attempt = createHash('sha256')
      .update(salt + password)
      .digest('hex');
    const hashBuf = Buffer.from(hash);
    const attemptBuf = Buffer.from(attempt);
    if (hashBuf.length !== attemptBuf.length) return false;
    return timingSafeEqual(hashBuf, attemptBuf);
  }
}
