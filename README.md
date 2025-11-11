# lunasdb - Database Backup Tool

Automatic backup tool for MySQL, MariaDB, and PostgreSQL, running in a Docker container.

## Features

- Support for MySQL, MariaDB, and PostgreSQL
- Automatic backup compression
- Local or S3 storage
- Multiple storage destinations per database (e.g., local + S3)
- Automatic backup rotation (keeps N versions)
- YAML configuration file
- No need to install backup tools locally
- Webhook notifications with detailed results

## Installation

### Quick Start (Using Docker Hub)

The easiest way to use lunasdb is to pull the pre-built image from Docker Hub:

```bash
# Pull the latest image
docker pull mdespeuilles/lunasdb:latest

# Create a config.yaml file (see Configuration section below)
# Then run the backup
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:latest
```

### Prerequisites

- Docker
- Docker Compose (optional, for automated setup)

### Configuration

1. Copy the example configuration file:

```bash
cp config.example.yaml config.yaml
```

2. Edit `config.yaml` with your settings:

```yaml
databases:
  my_app:
    database: my_app_production
    type: mysql # or mariadb, postgres, postgresql
    host: localhost
    port: 3306
    username: root
    password: root
    storage:
      type: local # or s3
      path: /backups
      keep: 20 # Keep 20 backups

  my_postgres:
    database: production_db
    type: postgres
    host: localhost
    port: 5432
    username: postgres
    password: postgres
    enabled: false # Temporarily disable this backup
    storage:
      type: s3
      bucket: my-backup-bucket
      accessKeyId: your_aws_access_key_id
      secretAccessKey: your_aws_secret_access_key
      prefix: backups/postgres/
      region: eu-west-1
      keep: 30
```

**Note:** The `enabled: false` option allows you to temporarily disable a backup without removing its configuration. A warning message will be displayed during execution.

### Multiple Storage Destinations

You can configure multiple storage destinations for each database. The backup will be saved to all destinations sequentially:

```yaml
databases:
  critical_db:
    database: critical_data
    type: mysql
    host: localhost
    port: 3306
    username: root
    password: root
    storage:
      - type: local  # First destination: local filesystem
        path: /backups
        keep: 20
      - type: s3  # Second destination: S3 bucket
        bucket: my-backup-bucket
        prefix: backups/critical/
        region: eu-west-1
        accessKeyId: your_aws_access_key_id
        secretAccessKey: your_aws_secret_access_key
        keep: 30  # Keep more backups in S3
```

**Multi-Storage Behavior:**
- Storage destinations are processed **sequentially** (one after another)
- Each storage destination has **independent rotation** (different `keep` values allowed)
- Backup succeeds if **at least one storage succeeds** (lenient mode)
- Partial failures are indicated with `⚠` symbol (e.g., local succeeded, S3 failed)
- All storage errors are logged and included in webhook payload

## Usage

### Using Docker Hub Image (Recommended)

```bash
# Pull the latest version
docker pull mdespeuilles/lunasdb:latest

# Run the backup
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:latest

# Or pull a specific version
docker pull mdespeuilles/lunasdb:1.0.0
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:1.0.0
```

### With Docker Compose (Using Docker Hub)

Update your `docker-compose.yml` to use the Docker Hub image:

```yaml
version: "3.8"

services:
  backup:
    image: mdespeuilles/lunasdb:latest
    container_name: lunasdb-backup
    volumes:
      - ./config.yaml:/app/config.yaml:ro
      - ./backups:/backups
    network_mode: host
    restart: "no"
```

Then run:

```bash
docker-compose pull  # Pull latest image
docker-compose up    # Run the backup
```

### Building from Source

If you want to build the image yourself:

#### With Docker Compose

```bash
# Build the image
docker-compose build

# Run the backup
docker-compose up

# Build and run in one command
docker-compose up --build
```

#### With Docker directly

```bash
# Build the image
docker build -t lunasdb .

# Run the backup
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  lunasdb
```

### CLI Arguments

lunasdb supports command-line arguments to customize backup behavior:

```bash
# Show help
docker run --rm mdespeuilles/lunasdb:latest --help

# Show version
docker run --rm mdespeuilles/lunasdb:latest --version

# List all databases in configuration
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  mdespeuilles/lunasdb:latest --list

# Use a custom configuration file
docker run --rm \
  -v $(pwd)/custom-config.yaml:/app/custom.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:latest --config /app/custom.yaml

# Backup only specific database(s)
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:latest --database my_app

# Backup multiple specific databases
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  mdespeuilles/lunasdb:latest --database my_app --database production_db
```

**Available CLI Options:**

| Option | Alias | Description |
|--------|-------|-------------|
| `--config <path>` | `-c` | Path to configuration file (default: config.yaml or CONFIG_PATH env var) |
| `--database <name>` | `-d` | Backup specific database(s) - can be used multiple times to select multiple databases |
| `--list` | `-l` | List all databases in configuration and exit (useful to verify your setup) |
| `--help` | `-h` | Display help information |
| `--version` | `-V` | Display version number |

**Examples with Docker Compose:**

To pass CLI arguments with Docker Compose, modify the `command` field in your `docker-compose.yml`:

```yaml
services:
  backup:
    image: mdespeuilles/lunasdb:latest
    volumes:
      - ./config.yaml:/app/config.yaml:ro
      - ./backups:/backups
    network_mode: host
    command: ["--database", "my_app", "--database", "production_db"]
```

### Automation with Cron

To run backups automatically, add a cron job:

```bash
# Open crontab
crontab -e

# Add a line for daily backup at 2 AM
0 2 * * * cd /path/to/lunasdb && docker-compose up >> /var/log/db-backup.log 2>&1
```

Or create a `backup.sh` script:

```bash
#!/bin/bash
cd /path/to/lunasdb
docker-compose up --build
```

Then schedule it:

```bash
0 2 * * * /path/to/backup.sh >> /var/log/db-backup.log 2>&1
```

## Detailed Configuration

### Database Options

| Option                | Required | Description                                                                  |
| --------------------- | -------- | ---------------------------------------------------------------------------- |
| `database`            | Yes      | Database name                                                                |
| `type`                | Yes      | Type: `mysql`, `mariadb`, `postgres`, `postgresql`                           |
| `host`                | Yes      | Database host                                                                |
| `port`                | No       | Port (default: 3306 for MySQL, 5432 for PostgreSQL)                          |
| `username`            | Yes      | Username                                                                     |
| `password`            | Yes      | Password                                                                     |
| `enabled`             | No       | `false` to temporarily disable the backup (default: `true`)                  |
| `ssl`                 | No       | `true` to force SSL, `false` to disable SSL                                  |
| `skipSslVerification` | No       | `true` to skip SSL certificate verification (useful for self-signed certs)   |

### Local Storage Options

| Option | Required | Description                               |
| ------ | -------- | ----------------------------------------- |
| `type` | Yes      | `local`                                   |
| `path` | Yes      | Path where to save backup files           |
| `keep` | No       | Number of backups to keep (default: 10)   |

### S3 Storage Options

| Option            | Required | Description                                                      |
| ----------------- | -------- | ---------------------------------------------------------------- |
| `type`            | Yes      | `s3`                                                             |
| `bucket`          | Yes      | S3 or Spaces bucket name                                         |
| `accessKeyId`     | Yes      | AWS Access Key ID or Spaces Access Key                           |
| `secretAccessKey` | Yes      | AWS Secret Access Key or Spaces Secret Key                       |
| `endpoint`        | No       | Custom endpoint (e.g., DigitalOcean Spaces, Wasabi, MinIO)       |
| `prefix`          | No       | Prefix in bucket (e.g., `backups/`)                              |
| `region`          | No       | AWS region or region identifier (default: `us-east-1`)           |
| `keep`            | No       | Number of backups to keep (default: 10)                          |

#### Using with DigitalOcean Spaces

DigitalOcean Spaces is S3 API compatible. Simply add the `endpoint` field:

```yaml
storage:
  type: s3
  bucket: my-spaces-bucket
  endpoint: https://fra1.digitaloceanspaces.com # Your region's endpoint
  region: fra1
  accessKeyId: your_spaces_access_key
  secretAccessKey: your_spaces_secret_key
  keep: 20
```

**DigitalOcean Spaces endpoints by region:**

- NYC3: `https://nyc3.digitaloceanspaces.com`
- AMS3: `https://ams3.digitaloceanspaces.com`
- SGP1: `https://sgp1.digitaloceanspaces.com`
- FRA1: `https://fra1.digitaloceanspaces.com`
- SFO3: `https://sfo3.digitaloceanspaces.com`

### Webhook Notifications

You can configure a webhook to receive backup summary notifications:

```yaml
# Add at the root level of config.yaml
webhook: https://your-webhook-endpoint.com/backup-notification
```

The webhook receives a POST request with a JSON payload containing:
- Backup summary (total, successful, failed, skipped)
- Detailed results for each database
- Storage details for multi-storage configurations
- All error messages

See [CLAUDE.md](CLAUDE.md#webhook-notifications) for detailed webhook payload structure.

## Backup File Format

Files are named with a timestamp:

- MySQL/MariaDB: `dbname_2024-01-15_10-30-00.sql.gz`
- PostgreSQL: `dbname_2024-01-15_10-30-00.dump` (compressed custom format)

## Accessing Databases on Host

The `docker-compose.yml` uses `network_mode: host` to access databases on `localhost`.

If your databases are in other Docker containers, modify the network configuration:

```yaml
services:
  backup:
    # ... other options
    networks:
      - database_network
    # Remove network_mode: host

networks:
  database_network:
    external: true
```

## Troubleshooting

### Database Connection Error

- Verify that host/port are correct
- Verify that the user has necessary permissions
- For localhost, make sure to use `network_mode: host`

### SSL Error: "self-signed certificate in certificate chain"

This error occurs with self-signed certificates (DigitalOcean, AWS RDS, etc.).

**Solution:** Add `skipSslVerification: true` to your configuration:

```yaml
databases:
  my_db:
    database: defaultdb
    type: mysql
    host: db-mysql-server.db.ondigitalocean.com
    port: 25060
    username: user
    password: your_password
    skipSslVerification: true # Skip self-signed certificate verification
    storage:
      type: local
      path: /backups
```

**Alternatives:**

- `ssl: false` - Completely disables SSL (not recommended for production)
- `ssl: true` - Forces SSL with certificate verification

### S3 Error

- Verify AWS credentials
- Verify that the bucket exists and you have permissions
- Verify the region

## Publishing to Docker Hub

### For Maintainers

To publish a new version to Docker Hub, use the provided script. The script builds multi-architecture images for:
- **linux/amd64**: Intel/AMD 64-bit (most servers, NAS devices like Synology)
- **linux/arm64**: ARM 64-bit (Apple Silicon, modern ARM servers)
- **linux/arm/v7**: ARM 32-bit (Raspberry Pi, older ARM devices)

```bash
# Login to Docker Hub (first time only)
docker login

# Publish using version from package.json
./docker-publish.sh

# Or specify a custom version
./docker-publish.sh 1.0.0
```

**Requirements:**
- Docker Desktop or Docker with buildx support
- Multi-architecture build takes longer but ensures compatibility across all platforms

The script will:
1. Setup Docker Buildx for multi-architecture builds
2. Build images for all supported platforms
3. Push both version and `latest` tags to Docker Hub
4. Verify the published manifests

## License

MIT
