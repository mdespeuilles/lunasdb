# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cronos** is a Docker-based database backup tool that supports MySQL, MariaDB, and PostgreSQL. It runs as a containerized service that connects to databases, creates compressed backups, and stores them either locally or on AWS S3 with automatic rotation.

## Development Commands

### Running Backups

```bash
# Build and run with Docker Compose
docker-compose up --build

# Run without building
docker-compose up

# Build Docker image manually
docker build -t database-backup-tool .

# Run backup directly with Node (requires DB client tools installed locally)
npm start
# or
npm run backup
# or
node src/index.js
```

### Docker Management

```bash
# Build the image
docker-compose build

# Run with custom config path
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  database-backup-tool
```

## Architecture

### Core Workflow

The application follows a sequential backup workflow for each database defined in `config.yaml`:

1. **Configuration Loading** ([src/config.js](src/config.js)) - Parses YAML config and validates database entries
2. **Backup Execution** ([src/index.js](src/index.js)) - Orchestrates backup process for each enabled database
3. **Database-Specific Backup** ([src/backup/](src/backup/)) - Spawns native client tools (mysqldump/mariadb-dump or pg_dump) as child processes
4. **Storage** ([src/storage/](src/storage/)) - Saves backups to local filesystem or S3, manages rotation

### Module Structure

- **[src/index.js](src/index.js)** - Main entry point, orchestrates backup workflow, handles summary reporting
- **[src/config.js](src/config.js)** - Configuration loader with validation
- **[src/backup/mysql.js](src/backup/mysql.js)** - MySQL/MariaDB backup using mysqldump/mariadb-dump with gzip compression
- **[src/backup/postgres.js](src/backup/postgres.js)** - PostgreSQL backup using pg_dump with custom format (built-in compression)
- **[src/storage/local.js](src/storage/local.js)** - Local filesystem storage with rotation (keeps N most recent backups)
- **[src/storage/s3.js](src/storage/s3.js)** - AWS S3 storage with rotation using AWS SDK v3

### Key Architectural Patterns

**Process Spawning**: Database backups spawn native CLI tools (mysqldump, pg_dump) as child processes rather than using database drivers. This approach:
- Leverages battle-tested backup tools
- Handles streaming efficiently for large databases
- Requires client tools in the Docker image (installed via apk in Dockerfile)

**Stream-Based Backup**: For MySQL/MariaDB, the tool pipes `mysqldump` output through `gzip` to a file stream. PostgreSQL uses pg_dump's built-in compression with custom format.

**Rotation Strategy**: After saving each backup, rotation logic lists all backup files (by `.sql.gz` or `.dump` extension), sorts by modification time, and deletes files beyond the configured `keep` limit.

## Configuration

### Database Configuration

Each database entry in `config.yaml` requires:
- `database` - Database name
- `type` - One of: `mysql`, `mariadb`, `postgres`, `postgresql`
- `host` - Database host
- `username` - Database user
- `password` - Database password
- `enabled` - Optional boolean to skip backup (default: true)
- `storage` - Storage configuration (see below)

### SSL Configuration

Three SSL options available for MySQL/MariaDB:
- `ssl: false` - Disables SSL completely (adds `--skip-ssl`)
- `ssl: true` - Requires SSL with verification (adds `--ssl-mode=REQUIRED`)
- `skipSslVerification: true` - Requires SSL but skips certificate verification (useful for self-signed certs like DigitalOcean Managed Databases)

### Storage Configuration

The tool supports both **single storage** and **multiple storage destinations** per database. Each backup can be saved to multiple locations simultaneously (e.g., local + S3).

**Single Storage (backward compatible):**
```yaml
storage:
  type: local
  path: /backups
  keep: 20  # Number of backups to retain
```

**Multiple Storage Destinations:**
```yaml
storage:
  - type: local
    path: /backups
    keep: 20
  - type: s3
    bucket: my-backup-bucket
    accessKeyId: your_aws_access_key_id
    secretAccessKey: your_aws_secret_access_key
    prefix: backups/mysql/
    region: eu-west-1
    keep: 30
```

**Storage Types:**

**Local Storage:**
```yaml
type: local
path: /backups
keep: 20  # Number of backups to retain
```

**S3 Storage:**
```yaml
type: s3
bucket: my-backup-bucket
accessKeyId: your_aws_access_key_id
secretAccessKey: your_aws_secret_access_key
prefix: backups/mysql/  # Optional path prefix
region: eu-west-1
keep: 30
```

**S3-Compatible Storage (DigitalOcean Spaces, Wasabi, MinIO):**
```yaml
type: s3
bucket: my-spaces-bucket
endpoint: https://fra1.digitaloceanspaces.com  # Custom endpoint
region: fra1
accessKeyId: your_spaces_access_key
secretAccessKey: your_spaces_secret_key
prefix: backups/
keep: 20
```

**Multi-Storage Behavior:**
- Storage destinations are processed **sequentially** (one after another)
- Each storage destination has **independent rotation** (different `keep` values allowed)
- Backup succeeds if **at least one storage succeeds** (lenient mode)
- Partial failures are indicated with `⚠` symbol (e.g., local succeeded, S3 failed)
- All storage errors are logged and included in webhook payload
- Temp files are cleaned up after all storage attempts complete

S3 credentials (`accessKeyId` and `secretAccessKey`) are configured per storage destination. Use the optional `endpoint` field for S3-compatible services like DigitalOcean Spaces, Wasabi, or MinIO.

### Webhook Notifications

**Optional Webhook Configuration:**

You can configure an optional webhook URL to receive backup summary notifications after each backup run. The webhook will receive a POST request with a JSON payload containing:

```yaml
# Add at the root level of config.yaml
webhook: https://your-webhook-endpoint.com/backup-notification
```

**Webhook Payload Structure:**

```json
{
  "timestamp": "2025-01-05T10:30:00.000Z",
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "skipped": 5,
    "totalDurationMs": 59000,
    "totalDurationSec": "59.00"
  },
  "summaryText": "============================================================\nBACKUP SUMMARY\n============================================================\nTotal: 2 | Success: 2 | Failed: 0 | Skipped: 5\nTotal duration: 59.00s\n\n✓ fenwick - 0.91 MB - 52.14s\n  → local: /backups/fenwick_2025-01-05_10-30-00.sql.gz\n  → s3: s3://my-bucket/fenwick_2025-01-05_10-30-00.sql.gz\n⚠ duodeal - 2.24 MB - 6.83s\n  → local: /backups/duodeal_2025-01-05_10-30-52.dump\n  ✗ s3: Connection timeout\n⊗ bendy_aderma - SKIPPED\n============================================================",
  "results": [
    {
      "name": "fenwick",
      "success": true,
      "sizeMB": "0.91",
      "durationMs": 52140,
      "durationSec": "52.14",
      "storages": [
        {
          "type": "local",
          "path": "/backups/fenwick_2025-01-05_10-30-00.sql.gz",
          "success": true
        },
        {
          "type": "s3",
          "path": "s3://my-bucket/fenwick_2025-01-05_10-30-00.sql.gz",
          "success": true
        }
      ],
      "storageErrors": [],
      "path": "/backups/fenwick_2025-01-05_10-30-00.sql.gz",
      "error": null
    },
    {
      "name": "duodeal",
      "success": true,
      "sizeMB": "2.24",
      "durationMs": 6830,
      "durationSec": "6.83",
      "storages": [
        {
          "type": "local",
          "path": "/backups/duodeal_2025-01-05_10-30-52.dump",
          "success": true
        }
      ],
      "storageErrors": [
        {
          "type": "s3",
          "error": "Connection timeout",
          "success": false
        }
      ],
      "path": "/backups/duodeal_2025-01-05_10-30-52.dump",
      "error": null
    }
  ],
  "skippedDatabases": ["bendy_aderma", "bendy_aderma_pp", "bendy_rf", "bendy_rf_pp", "fenwick"]
}
```

The webhook payload includes:
- `storages`: Array of successful storage destinations with their paths
- `storageErrors`: Array of failed storage attempts with error messages
- `path`: Legacy field for backward compatibility (contains first storage path)

**Implementation Details:**
- The webhook is called after all backups complete
- Webhook failures do not stop the backup process
- The request uses `Content-Type: application/json`
- Webhook URL is validated during configuration loading ([src/config.js](src/config.js))
- Webhook sending is handled by [src/webhook.js](src/webhook.js)

## Docker Networking

The default `docker-compose.yml` uses `network_mode: host` to access databases on localhost. To access databases in other Docker containers, replace with:

```yaml
networks:
  - database_network

networks:
  database_network:
    external: true
```

## File Naming Convention

Backups are timestamped: `{dbname}_YYYY-MM-DD_HH-MM-SS.{extension}`
- MySQL/MariaDB: `.sql.gz`
- PostgreSQL: `.dump` (pg_dump custom format with built-in compression)

## Dependencies

- **js-yaml** - YAML config parsing
- **@aws-sdk/client-s3** & **@aws-sdk/lib-storage** - S3 upload/management (AWS SDK v3)
- **Docker base image**: node:20-alpine with mysql-client, mariadb-connector-c, postgresql-client

## Important Implementation Details

- The tool auto-detects whether `mariadb-dump` or `mysqldump` is available ([src/backup/mysql.js](src/backup/mysql.js:8-17))
- PostgreSQL backups set `PGPASSWORD` environment variable for authentication
- MySQL backups pass password via `-p` flag (not recommended for production, but necessary for mysqldump)
- Both backup modules use Promise-based wrappers around child processes
- Error handling captures stderr and checks exit codes to determine backup success
- The application exits with code 1 if any backup fails, 0 if all succeed
