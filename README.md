# Cronos - Database Backup Tool

Outil de sauvegarde automatique pour MySQL, MariaDB et PostgreSQL, fonctionnant dans un container Docker.

## Fonctionnalités

- Support de MySQL, MariaDB et PostgreSQL
- Sauvegarde avec compression automatique
- Stockage local ou S3
- Rotation automatique des sauvegardes (garde N versions)
- Configuration via fichier YAML
- Pas besoin d'installer les outils de backup localement

## Installation

### Prérequis

- Docker
- Docker Compose

### Configuration

1. Copiez le fichier de configuration exemple :

```bash
cp config.example.yaml config.yaml
```

2. Éditez `config.yaml` avec vos paramètres :

```yaml
databases:
  my_app:
    database: my_app_production
    type: mysql # ou mariadb, postgres, postgresql
    host: localhost
    port: 3306
    username: root
    password: root
    storage:
      type: local # ou s3
      path: /backups
      keep: 20 # Garde 20 sauvegardes

  my_postgres:
    database: production_db
    type: postgres
    host: localhost
    port: 5432
    username: postgres
    password: postgres
    enabled: false # Désactive temporairement ce backup
    storage:
      type: s3
      bucket: my-backup-bucket
      accessKeyId: your_aws_access_key_id
      secretAccessKey: your_aws_secret_access_key
      prefix: backups/postgres/
      region: eu-west-1
      keep: 30
```

**Note :** L'option `enabled: false` permet de désactiver temporairement un backup sans supprimer sa configuration. Un message d'avertissement s'affichera lors de l'exécution.

## Utilisation

### Avec Docker Compose

```bash
# Construire l'image
docker-compose build

# Lancer la sauvegarde
docker-compose up

# En une seule commande
docker-compose up --build
```

### Avec Docker directement

```bash
# Construire l'image
docker build -t cronos .

# Lancer la sauvegarde
docker run --rm \
  -v $(pwd)/config.yaml:/app/config.yaml:ro \
  -v $(pwd)/backups:/backups \
  --network host \
  cronos
```

### Automatisation avec Cron

Pour lancer les sauvegardes automatiquement, ajoutez une tâche cron :

```bash
# Ouvrir crontab
crontab -e

# Ajouter une ligne pour backup quotidien à 2h du matin
0 2 * * * cd /path/to/Cronos && docker-compose up >> /var/log/db-backup.log 2>&1
```

Ou créez un script `backup.sh` :

```bash
#!/bin/bash
cd /path/to/Cronos
docker-compose up --build
```

Puis planifiez-le :

```bash
0 2 * * * /path/to/backup.sh >> /var/log/db-backup.log 2>&1
```

## Configuration détaillée

### Options par base de données

| Option                | Required | Description                                                                                |
| --------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `database`            | Oui      | Nom de la base de données                                                                  |
| `type`                | Oui      | Type: `mysql`, `mariadb`, `postgres`, `postgresql`                                         |
| `host`                | Oui      | Hôte de la base de données                                                                 |
| `port`                | Non      | Port (défaut: 3306 pour MySQL, 5432 pour PostgreSQL)                                       |
| `username`            | Oui      | Nom d'utilisateur                                                                          |
| `password`            | Oui      | Mot de passe                                                                               |
| `enabled`             | Non      | `false` pour désactiver temporairement le backup (défaut: `true`)                          |
| `ssl`                 | Non      | `true` pour forcer SSL, `false` pour désactiver SSL                                        |
| `skipSslVerification` | Non      | `true` pour ignorer la vérification du certificat SSL (utile pour certificats auto-signés) |

### Options de stockage local

| Option | Required | Description                                    |
| ------ | -------- | ---------------------------------------------- |
| `type` | Oui      | `local`                                        |
| `path` | Oui      | Chemin où sauvegarder les fichiers             |
| `keep` | Non      | Nombre de sauvegardes à conserver (défaut: 10) |

### Options de stockage S3

| Option            | Required | Description                                                    |
| ----------------- | -------- | -------------------------------------------------------------- |
| `type`            | Oui      | `s3`                                                           |
| `bucket`          | Oui      | Nom du bucket S3 ou Spaces                                     |
| `accessKeyId`     | Oui      | AWS Access Key ID ou Spaces Access Key                         |
| `secretAccessKey` | Oui      | AWS Secret Access Key ou Spaces Secret Key                     |
| `endpoint`        | Non      | Endpoint personnalisé (ex: DigitalOcean Spaces, Wasabi, MinIO) |
| `prefix`          | Non      | Préfixe dans le bucket (ex: `backups/`)                        |
| `region`          | Non      | Région AWS ou identifiant de région (défaut: `us-east-1`)      |
| `keep`            | Non      | Nombre de sauvegardes à conserver (défaut: 10)                 |

#### Utiliser avec DigitalOcean Spaces

DigitalOcean Spaces est compatible avec l'API S3. Ajoutez simplement le champ `endpoint` :

```yaml
storage:
  type: s3
  bucket: my-spaces-bucket
  endpoint: https://fra1.digitaloceanspaces.com # Endpoint de votre région
  region: fra1
  accessKeyId: your_spaces_access_key
  secretAccessKey: your_spaces_secret_key
  keep: 20
```

**Endpoints DigitalOcean Spaces par région :**

- NYC3: `https://nyc3.digitaloceanspaces.com`
- AMS3: `https://ams3.digitaloceanspaces.com`
- SGP1: `https://sgp1.digitaloceanspaces.com`
- FRA1: `https://fra1.digitaloceanspaces.com`
- SFO3: `https://sfo3.digitaloceanspaces.com`

## Format des fichiers de sauvegarde

Les fichiers sont nommés avec un timestamp :

- MySQL/MariaDB : `dbname_2024-01-15_10-30-00.sql.gz`
- PostgreSQL : `dbname_2024-01-15_10-30-00.dump` (format custom compressé)

## Accès aux bases de données sur l'hôte

Le `docker-compose.yml` utilise `network_mode: host` pour accéder aux bases de données sur `localhost`.

Si vos bases sont dans d'autres containers Docker, modifiez la configuration réseau :

```yaml
services:
  backup:
    # ... autres options
    networks:
      - database_network
    # Retirez network_mode: host

networks:
  database_network:
    external: true
```

## Dépannage

### Erreur de connexion à la base

- Vérifiez que le host/port sont corrects
- Vérifiez que l'utilisateur a les permissions nécessaires
- Pour localhost, assurez-vous d'utiliser `network_mode: host`

### Erreur SSL : "self-signed certificate in certificate chain"

Cette erreur se produit avec des certificats auto-signés (DigitalOcean, AWS RDS, etc.).

**Solution :** Ajoutez `skipSslVerification: true` à votre configuration :

```yaml
databases:
  my_db:
    database: defaultdb
    type: mysql
    host: db-mysql-server.db.ondigitalocean.com
    port: 25060
    username: user
    password: your_password
    skipSslVerification: true # Ignore le certificat auto-signé
    storage:
      type: local
      path: /backups
```

**Alternatives :**

- `ssl: false` - Désactive complètement SSL (non recommandé pour production)
- `ssl: true` - Force SSL avec vérification du certificat

### Erreur S3

- Vérifiez les credentials AWS
- Vérifiez que le bucket existe et que vous avez les permissions
- Vérifiez la région

## License

MIT
