import { z } from 'zod';

export class Email {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static create(raw: string): Email {
    const parsed = z.string().email().safeParse(raw.toLowerCase().trim());
    if (!parsed.success) throw new Error(`Invalid email: ${raw}`);
    return new Email(parsed.data);
  }

  get value(): string {
    return this._value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }
}

export class HashedPassword {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  static fromHash(hash: string): HashedPassword {
    return new HashedPassword(hash);
  }

  get value(): string {
    return this._value;
  }
}
