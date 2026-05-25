import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, EntityManager } from '@mikro-orm/postgresql';
import { UserAggregate } from '../../domain/user/user.aggregate';
import { IUserRepository } from '../../domain/user/user.repository';
import { UserOrmEntity } from './user.orm-entity';

@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    @InjectRepository(UserOrmEntity)
    private readonly repo: EntityRepository<UserOrmEntity>,
    private readonly em: EntityManager,
  ) {}

  async save(user: UserAggregate): Promise<void> {
    const existing = await this.repo.findOne({ id: user.id });
    if (existing) {
      existing.email = user.email;
      existing.name = user.name;
      existing.hashedPassword = user.hashedPassword;
      existing.avatarUrl = user.avatarUrl;
    } else {
      const entity = this.em.create(UserOrmEntity, {
        id: user.id,
        email: user.email,
        name: user.name,
        hashedPassword: user.hashedPassword,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      });
      this.em.persist(entity);
    }
    await this.em.flush();
  }

  async findById(id: string): Promise<UserAggregate | null> {
    const entity = await this.repo.findOne({ id });
    return entity ? this.toAggregate(entity) : null;
  }

  async findByEmail(email: string): Promise<UserAggregate | null> {
    const entity = await this.repo.findOne({ email: email.toLowerCase() });
    return entity ? this.toAggregate(entity) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.repo.count({ email: email.toLowerCase() });
    return count > 0;
  }

  private toAggregate(entity: UserOrmEntity): UserAggregate {
    return UserAggregate.reconstitute({
      id: entity.id,
      email: entity.email,
      name: entity.name,
      hashedPassword: entity.hashedPassword,
      avatarUrl: entity.avatarUrl,
      createdAt: entity.createdAt,
    });
  }
}
