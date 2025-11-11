#!/usr/bin/env node

import { loadConfig } from './config.js';
import { backupMySQL } from './backup/mysql.js';
import { backupPostgres } from './backup/postgres.js';
import { saveToLocal } from './storage/local.js';
import { saveToS3 } from './storage/s3.js';
import { sendWebhook } from './webhook.js';
import { parseArguments } from './cli.js';
import fs from 'fs';
import path from 'path';

/**
 * Generate backup filename with timestamp
 */
function generateBackupFilename(dbName, dbType, storageType) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  const extension = dbType === 'postgres' || dbType === 'postgresql' ? 'dump' : 'sql.gz';
  return `${dbName}_${timestamp}.${extension}`;
}

/**
 * Perform backup for a single database
 */
async function backupDatabase(name, config) {
  const storageTypes = config.storage.map(s => s.type).join('+');
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting backup: ${name}`);
  console.log(`Database: ${config.database} (${config.type})`);
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Storage: ${storageTypes} (${config.storage.length} destination${config.storage.length > 1 ? 's' : ''})`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  try {
    // Create temp directory for backups
    const tempDir = '/tmp/backups';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate backup filename (use first storage type for extension)
    const filename = generateBackupFilename(name, config.type, config.storage[0].type);
    const backupPath = path.join(tempDir, filename);

    // Perform database backup based on type
    let result;
    const dbType = config.type.toLowerCase();

    if (dbType === 'mysql' || dbType === 'mariadb') {
      result = await backupMySQL(name, config, backupPath);
    } else if (dbType === 'postgres' || dbType === 'postgresql') {
      result = await backupPostgres(name, config, backupPath);
    } else {
      throw new Error(`Unsupported database type: ${config.type}`);
    }

    // Save to each storage destination sequentially
    const storages = [];
    const storageErrors = [];

    for (const storageConfig of config.storage) {
      try {
        let storagePath;
        // Create a temporary config with single storage for backward compatibility
        const storageSpecificConfig = { ...config, storage: storageConfig };

        if (storageConfig.type === 'local') {
          storagePath = await saveToLocal(backupPath, storageSpecificConfig);
        } else if (storageConfig.type === 's3') {
          storagePath = await saveToS3(backupPath, storageSpecificConfig);
        } else {
          throw new Error(`Unsupported storage type: ${storageConfig.type}`);
        }

        storages.push({
          type: storageConfig.type,
          path: storagePath,
          success: true
        });
      } catch (error) {
        console.error(`  [${storageConfig.type}] Storage failed: ${error.message}`);
        storageErrors.push({
          type: storageConfig.type,
          error: error.message,
          success: false
        });
      }
    }

    // Clean up temp file after all storage attempts
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    const duration = Date.now() - startTime;

    // Determine overall success: at least one storage succeeded (lenient mode)
    const success = storages.length > 0;

    if (success) {
      const symbol = storageErrors.length > 0 ? '⚠' : '✓';
      const status = storageErrors.length > 0
        ? `completed with warnings (${storages.length}/${config.storage.length} storages succeeded)`
        : 'completed successfully';

      console.log(`\n${symbol} Backup ${status} for: ${name}`);
      for (const storage of storages) {
        console.log(`  → ${storage.type}: ${storage.path}`);
      }
      for (const error of storageErrors) {
        console.log(`  ✗ ${error.type}: ${error.error}`);
      }
      console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
    } else {
      throw new Error(`All storage destinations failed (${storageErrors.length} errors)`);
    }

    return {
      name,
      success,
      storages,
      storageErrors,
      size: result.size,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`\n✗ Backup failed for: ${name}`);
    console.error(`  Error: ${error.message}`);
    console.error(`  Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      name,
      success: false,
      storages: [],
      storageErrors: [],
      error: error.message,
      duration
    };
  }
}

/**
 * Main function
 */
async function main() {
  console.log('Database Backup Tool');
  console.log('===================\n');

  try {
    // Parse command-line arguments
    const options = parseArguments();

    // Determine config path: CLI argument > environment variable > default
    const configPath = options.config || process.env.CONFIG_PATH;

    // Load configuration
    const config = loadConfig(configPath);

    // Filter databases based on --database argument if provided
    let allDatabases = Object.entries(config.databases);

    if (options.database && options.database.length > 0) {
      const requestedDatabases = new Set(options.database);
      const missingDatabases = options.database.filter(name => !config.databases[name]);

      if (missingDatabases.length > 0) {
        console.log(`⚠️  Warning: The following databases are not defined in config: ${missingDatabases.join(', ')}\n`);
      }

      allDatabases = allDatabases.filter(([name]) => requestedDatabases.has(name));

      if (allDatabases.length === 0) {
        console.error('Error: No valid databases found matching the specified names');
        process.exit(1);
      }

      console.log(`Filtering to ${allDatabases.length} requested database(s): ${options.database.join(', ')}\n`);
    }

    // Count enabled and disabled databases
    const enabledDatabases = allDatabases.filter(([_, dbConfig]) => dbConfig.enabled !== false);
    const disabledDatabases = allDatabases.filter(([_, dbConfig]) => dbConfig.enabled === false);

    console.log(`Found ${allDatabases.length} database(s) in configuration`);
    console.log(`  - ${enabledDatabases.length} enabled`);
    if (disabledDatabases.length > 0) {
      console.log(`  - ${disabledDatabases.length} disabled\n`);
      console.log('⚠️  Skipping disabled databases:');
      for (const [name] of disabledDatabases) {
        console.log(`  - ${name}`);
      }
    }
    console.log('');

    // Backup all enabled databases
    const results = [];
    for (const [name, dbConfig] of enabledDatabases) {
      const result = await backupDatabase(name, dbConfig);
      results.push(result);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('BACKUP SUMMARY');
    console.log('='.repeat(60));

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const skipped = disabledDatabases.length;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);

    console.log(`Total: ${results.length} | Success: ${successful} | Failed: ${failed} | Skipped: ${skipped}`);
    console.log(`Total duration: ${(totalDuration / 1000).toFixed(2)}s\n`);

    for (const result of results) {
      if (result.success) {
        const sizeMB = (result.size / (1024 * 1024)).toFixed(2);
        const durationSec = (result.duration / 1000).toFixed(2);
        const symbol = result.storageErrors && result.storageErrors.length > 0 ? '⚠' : '✓';
        console.log(`${symbol} ${result.name} - ${sizeMB} MB - ${durationSec}s`);

        // Show detailed storage info
        if (result.storages && result.storages.length > 0) {
          for (const storage of result.storages) {
            console.log(`  → ${storage.type}: ${storage.path}`);
          }
        }
        if (result.storageErrors && result.storageErrors.length > 0) {
          for (const error of result.storageErrors) {
            console.log(`  ✗ ${error.type}: ${error.error}`);
          }
        }
      } else {
        const durationSec = (result.duration / 1000).toFixed(2);
        console.log(`✗ ${result.name} - ${result.error} - ${durationSec}s`);
      }
    }

    // Show skipped databases
    for (const [name] of disabledDatabases) {
      console.log(`⊗ ${name} - SKIPPED`);
    }

    console.log('\n' + '='.repeat(60));

    // Send webhook notification if configured
    if (config.webhook) {
      // Build summary text
      let summaryText = '='.repeat(60) + '\n';
      summaryText += 'BACKUP SUMMARY\n';
      summaryText += '='.repeat(60) + '\n';
      summaryText += `Total: ${results.length} | Success: ${successful} | Failed: ${failed} | Skipped: ${skipped}\n`;
      summaryText += `Total duration: ${(totalDuration / 1000).toFixed(2)}s\n\n`;

      for (const result of results) {
        if (result.success) {
          const sizeMB = (result.size / (1024 * 1024)).toFixed(2);
          const durationSec = (result.duration / 1000).toFixed(2);
          const symbol = result.storageErrors && result.storageErrors.length > 0 ? '⚠' : '✓';
          summaryText += `${symbol} ${result.name} - ${sizeMB} MB - ${durationSec}s\n`;

          // Add detailed storage info to summary text
          if (result.storages && result.storages.length > 0) {
            for (const storage of result.storages) {
              summaryText += `  → ${storage.type}: ${storage.path}\n`;
            }
          }
          if (result.storageErrors && result.storageErrors.length > 0) {
            for (const error of result.storageErrors) {
              summaryText += `  ✗ ${error.type}: ${error.error}\n`;
            }
          }
        } else {
          const durationSec = (result.duration / 1000).toFixed(2);
          summaryText += `✗ ${result.name} - ${result.error} - ${durationSec}s\n`;
        }
      }

      for (const [name] of disabledDatabases) {
        summaryText += `⊗ ${name} - SKIPPED\n`;
      }

      summaryText += '='.repeat(60);

      const webhookPayload = {
        timestamp: new Date().toISOString(),
        summary: {
          total: results.length,
          successful,
          failed,
          skipped,
          totalDurationMs: totalDuration,
          totalDurationSec: (totalDuration / 1000).toFixed(2)
        },
        summaryText,
        results: results.map(r => ({
          name: r.name,
          success: r.success,
          sizeMB: r.size ? (r.size / (1024 * 1024)).toFixed(2) : null,
          durationMs: r.duration,
          durationSec: (r.duration / 1000).toFixed(2),
          storages: r.storages || [],
          storageErrors: r.storageErrors || [],
          // Keep legacy 'path' field for backward compatibility (first storage path or null)
          path: r.storages && r.storages.length > 0 ? r.storages[0].path : null,
          error: r.error || null
        })),
        skippedDatabases: disabledDatabases.map(([name]) => name)
      };

      await sendWebhook(config.webhook, webhookPayload);
    }

    // Exit with appropriate code
    if (failed > 0) {
      console.error(`\n${failed} backup(s) failed!`);
      process.exit(1);
    } else {
      console.log('\nAll backups completed successfully!');
      process.exit(0);
    }
  } catch (error) {
    console.error(`\nFatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run main function
main();
