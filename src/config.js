import yaml from 'js-yaml';
import fs from 'fs';
import path from 'path';

/**
 * Validate a single storage configuration
 */
function validateStorageConfig(name, storageConfig, storageIndex = null) {
  const storageLabel = storageIndex !== null ? `storage[${storageIndex}]` : 'storage';

  const validStorageTypes = ['local', 's3'];
  if (!validStorageTypes.includes(storageConfig.type)) {
    throw new Error(`Database "${name}" has invalid ${storageLabel} type "${storageConfig.type}". Must be one of: ${validStorageTypes.join(', ')}`);
  }

  if (storageConfig.type === 'local' && !storageConfig.path) {
    throw new Error(`Database "${name}" with local ${storageLabel} must specify a path`);
  }

  if (storageConfig.type === 's3' && !storageConfig.bucket) {
    throw new Error(`Database "${name}" with S3 ${storageLabel} must specify a bucket`);
  }
}

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

  // Validate storage configuration (can be object or array)
  if (config.storage) {
    if (Array.isArray(config.storage)) {
      // Validate each storage in the array
      if (config.storage.length === 0) {
        throw new Error(`Database "${name}" has empty storage array. Provide at least one storage configuration.`);
      }
      config.storage.forEach((storageConfig, index) => {
        validateStorageConfig(name, storageConfig, index);
      });
    } else {
      // Single storage object - validate it
      validateStorageConfig(name, config.storage);
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

    // Normalize storage to array format
    if (!dbConfig.storage) {
      // Default storage configuration
      dbConfig.storage = [{
        type: 'local',
        path: '/backups',
        keep: 10
      }];
    } else if (!Array.isArray(dbConfig.storage)) {
      // Convert single storage object to array
      dbConfig.storage = [dbConfig.storage];
    }

    // Apply defaults to each storage configuration
    dbConfig.storage.forEach(storageConfig => {
      if (!storageConfig.keep) {
        storageConfig.keep = 10;
      }
    });
  }

  // Validate webhook URL if provided
  if (config.webhook) {
    if (typeof config.webhook !== 'string') {
      throw new Error('Webhook must be a valid URL string');
    }
    try {
      new URL(config.webhook);
    } catch (error) {
      throw new Error(`Invalid webhook URL: ${config.webhook}`);
    }
  }

  return config;
}
