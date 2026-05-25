import { UserAggregate } from './user.aggregate';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

export interface IUserRepository {
  save(user: UserAggregate): Promise<void>;
  findById(id: string): Promise<UserAggregate | null>;
  findByEmail(email: string): Promise<UserAggregate | null>;
  existsByEmail(email: string): Promise<boolean>;
}
