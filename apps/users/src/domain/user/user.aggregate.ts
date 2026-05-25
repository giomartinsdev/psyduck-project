import { Email, HashedPassword } from './user.value-objects';
import { UserRegisteredEvent, UserSignedInEvent } from './user.events';

export class UserAggregate {
  private _domainEvents: Array<UserRegisteredEvent | UserSignedInEvent> = [];

  private constructor(
    public readonly id: string,
    private _email: Email,
    private _name: string,
    private _hashedPassword: HashedPassword,
    private _avatarUrl: string | null,
    public readonly createdAt: Date,
  ) {}

  static create(params: {
    id: string;
    email: string;
    name: string;
    hashedPassword: string;
    avatarUrl?: string | null;
  }): UserAggregate {
    const user = new UserAggregate(
      params.id,
      Email.create(params.email),
      params.name.trim(),
      HashedPassword.fromHash(params.hashedPassword),
      params.avatarUrl ?? null,
      new Date(),
    );
    user._domainEvents.push(
      new UserRegisteredEvent(user.id, user.email, user._name, user.createdAt),
    );
    return user;
  }

  static reconstitute(params: {
    id: string;
    email: string;
    name: string;
    hashedPassword: string;
    avatarUrl: string | null;
    createdAt: Date;
  }): UserAggregate {
    return new UserAggregate(
      params.id,
      Email.create(params.email),
      params.name,
      HashedPassword.fromHash(params.hashedPassword),
      params.avatarUrl,
      params.createdAt,
    );
  }

  recordSignIn(): void {
    this._domainEvents.push(new UserSignedInEvent(this.id, this.email, new Date()));
  }

  get email(): string {
    return this._email.value;
  }

  get name(): string {
    return this._name;
  }

  get hashedPassword(): string {
    return this._hashedPassword.value;
  }

  get avatarUrl(): string | null {
    return this._avatarUrl;
  }

  pullDomainEvents() {
    const events = [...this._domainEvents];
    this._domainEvents = [];
    return events;
  }
}
