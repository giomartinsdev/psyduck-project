# Infrastructure

Docker and database bootstrap scripts for the Psyduck project.

## Files

| File | Purpose |
|------|---------|
| `init.sql` | PostgreSQL initialization — creates the `payments_db` and `companion_db` databases alongside the default `users_db` |
| `wp-bootstrap.sh` | WordPress bootstrap — waits for WP to be ready, installs WP CLI, and activates the WPGraphQL plugin |

## PostgreSQL (`init.sql`)

Mounted as `/docker-entrypoint-initdb.d/01-init.sql` in the `postgres` container. Runs once on first start (when the `postgres_data` volume is empty).

```sql
-- Creates extra databases that services other than Users need
CREATE DATABASE payments_db;
GRANT ALL PRIVILEGES ON DATABASE payments_db TO users_user;

CREATE DATABASE companion_db;
GRANT ALL PRIVILEGES ON DATABASE companion_db TO users_user;
```

The `users_db` database and the `users_user` role are created by the `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` environment variables defined in `docker-compose.yml`.

### Connecting to PostgreSQL

```bash
# From the host
psql -h localhost -p 5432 -U users_user -d users_db
# password: users_pwd

# From inside the Docker network
psql -h postgres -p 5432 -U users_user -d payments_db
```

### Resetting the Database

```bash
# Bring down containers and destroy the volume (irreversible)
docker compose down -v

# Bring everything back up — init.sql will run again
docker compose up -d postgres
```

## WordPress Bootstrap (`wp-bootstrap.sh`)

Runs in the background when the `wordpress` container starts. It:

1. Waits for the MySQL TCP socket to be ready (using the `mysql` service hostname)
2. Downloads WP-CLI to `/usr/local/bin/wp`
3. Waits for WordPress to finish its own initialization
4. Installs and activates the WPGraphQL plugin via WP-CLI

This is why the WordPress health check in `docker-compose.yml` tests the `/graphql` endpoint rather than just the homepage — the GraphQL endpoint only exists after WPGraphQL is active.

WordPress startup is slow (~2 minutes) on first run. If the Products subgraph starts before WordPress is healthy it falls back to mock data automatically.

## Valkey (Redis-compatible)

Valkey requires no initialization scripts. The `payments` service creates the required streams on first write.

```bash
# Connect to Valkey CLI
docker exec -it psyduck-valkey valkey-cli

# List all streams
KEYS *
XLEN payments:commands
XLEN payments:events
```

## Docker Compose Overview

```bash
# Start only infrastructure (databases + Valkey)
docker compose up -d postgres valkey mysql wordpress

# Start everything
docker compose up -d

# View service health status
docker compose ps

# Stream logs from a specific service
docker compose logs -f users

# Rebuild a service image after source changes
docker compose build users
docker compose up -d --no-deps users
```

## Named Volumes

| Volume | Service | Description |
|--------|---------|-------------|
| `postgres_data` | postgres | PostgreSQL data files |
| `mysql_data` | mysql | MySQL data files (WordPress) |
| `wp_data` | wordpress | WordPress PHP files and uploads |

Delete these volumes with `docker compose down -v` to reset all persistent state.
