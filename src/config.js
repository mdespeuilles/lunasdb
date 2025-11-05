import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

/**
 * Validate database configuration
 */
function validateDatabaseConfig(name, config) {
  const required = ['database', 'type', 'host', 'username'];
  const missing = required.filter(field => !config[field]);

  if (missing.length > 0) {
    throw new Error(`Database "${name}" is missing required fields: ${missing.join(', ')}`);
  }

  const validTypes = ['mysql', 'mariadb', 'postgres', 'postgresql'];
  if (!validTypes.includes(config.type.toLowerCase())) {
    throw new Error(`Database "${name}" has invalid type "${config.type}". Must be one of: ${validTypes.join(', ')}`);
  }

  if (config.storage) {
    const validStorageTypes = ['local', 's3'];
    if (!validStorageTypes.includes(config.storage.type)) {
      throw new Error(`Database "${name}" has invalid storage type "${config.storage.type}". Must be one of: ${validStorageTypes.join(', ')}`);
    }

    if (config.storage.type === 'local' && !config.storage.path) {
      throw new Error(`Database "${name}" with local storage must specify a path`);
    }

    if (config.storage.type === 's3' && !config.storage.bucket) {
      throw new Error(`Database "${name}" with S3 storage must specify a bucket`);
    }
  }
}

/**
 * Load and parse configuration file
 */
export function loadConfig(configPath = '/app/config.yaml') {
  // Try different possible config locations
  const possiblePaths = [
    configPath,
    '/app/config.yaml',
    '/config/config.yaml',
    './config.yaml',
    path.join(process.cwd(), 'config.yaml')
  ];

  let configFile = null;
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      configFile = p;
      break;
    }
  }

  if (!configFile) {
    throw new Error(`Configuration file not found. Tried: ${possiblePaths.join(', ')}`);
  }

  console.log(`Loading configuration from: ${configFile}`);

  const fileContents = fs.readFileSync(configFile, 'utf8');
  const config = yaml.load(fileContents);

  // Validate configuration
  if (!config.databases || Object.keys(config.databases).length === 0) {
    throw new Error('Configuration must contain at least one database');
  }

  // Validate each database configuration
  for (const [name, dbConfig] of Object.entries(config.databases)) {
    // Set enabled default and normalize to boolean
    if (dbConfig.enabled === undefined || dbConfig.enabled === null) {
      dbConfig.enabled = true;
    } else {
      // Convert to boolean (handles strings like "false", "true", etc.)
      dbConfig.enabled = Boolean(dbConfig.enabled);
    }

    // Skip validation for disabled databases
    if (dbConfig.enabled === false) {
      continue;
    }

    validateDatabaseConfig(name, dbConfig);

    // Set defaults
    if (!dbConfig.port) {
      dbConfig.port = dbConfig.type === 'postgres' || dbConfig.type === 'postgresql' ? 5432 : 3306;
    }

    if (!dbConfig.storage) {
      dbConfig.storage = {
        type: 'local',
        path: '/backups',
        keep: 10
      };
    }

    if (!dbConfig.storage.keep) {
      dbConfig.storage.keep = 10;
    }
  }

  return config;
}
