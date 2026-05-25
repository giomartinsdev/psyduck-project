export class SignUpCommand {
  constructor(
    public readonly name: string,
    public readonly email: string,
    public readonly password: string,
    public readonly idempotencyKey: string,
  ) {}
}
