#!/usr/bin/env node

import { loadConfig } from './config.js';
import { backupMySQL } from './backup/mysql.js';
import { backupPostgres } from './backup/postgres.js';
import { saveToLocal } from './storage/local.js';
import { saveToS3 } from './storage/s3.js';
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
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Starting backup: ${name}`);
  console.log(`Database: ${config.database} (${config.type})`);
  console.log(`Host: ${config.host}:${config.port}`);
  console.log(`Storage: ${config.storage.type}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  try {
    // Create temp directory for backups
    const tempDir = '/tmp/backups';
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Generate backup filename
    const filename = generateBackupFilename(name, config.type, config.storage.type);
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

    // Save to storage
    let storagePath;
    if (config.storage.type === 'local') {
      storagePath = await saveToLocal(backupPath, config);
    } else if (config.storage.type === 's3') {
      storagePath = await saveToS3(backupPath, config);
    } else {
      throw new Error(`Unsupported storage type: ${config.storage.type}`);
    }

    const duration = Date.now() - startTime;

    console.log(`\n✓ Backup completed successfully for: ${name}`);
    console.log(`  Location: ${storagePath}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);

    return {
      name,
      success: true,
      path: storagePath,
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
    // Load configuration
    const config = loadConfig(process.env.CONFIG_PATH);

    // Count enabled and disabled databases
    const allDatabases = Object.entries(config.databases);
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
        console.log(`✓ ${result.name} - ${sizeMB} MB - ${durationSec}s`);
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
