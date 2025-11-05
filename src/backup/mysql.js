import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Detect which MySQL dump tool is available
 */
function getMySQLDumpCommand() {
  try {
    // Try mariadb-dump first (newer)
    const { execSync } = require('child_process');
    execSync('which mariadb-dump', { stdio: 'ignore' });
    return 'mariadb-dump';
  } catch {
    return 'mysqldump';
  }
}

/**
 * Create a MySQL/MariaDB backup using mysqldump
 */
export async function backupMySQL(name, config, backupPath) {
  console.log(`Starting MySQL backup for: ${name}`);

  return new Promise((resolve, reject) => {
    const args = [
      `-h${config.host}`,
      `-P${config.port}`,
      `-u${config.username}`,
      '--single-transaction',
      '--quick',
      '--lock-tables=false',
      '--routines',
      '--triggers',
      '--events',
      config.database
    ];

    // Add SSL options
    if (config.ssl === false || config.skipSslVerification) {
      // Skip SSL verification
      args.push('--skip-ssl');
    } else if (config.sslMode === 'require' || config.ssl === true) {
      // Require SSL but don't verify certificate
      args.push('--ssl-mode=REQUIRED');
    } else {
      // Default: try SSL if available, skip certificate verification
      args.push('--ssl-mode=REQUIRED');
    }

    // Add password if provided
    if (config.password) {
      args.unshift(`-p${config.password}`);
    }

    // Create write stream
    const writeStream = fs.createWriteStream(backupPath);

    // Detect and use the appropriate dump command
    const dumpCommand = getMySQLDumpCommand();
    console.log(`  Using ${dumpCommand} for backup`);

    // Spawn mysqldump process
    const mysqldump = spawn(dumpCommand, args);

    // Pipe to gzip and then to file
    const gzip = spawn('gzip');

    mysqldump.stdout.pipe(gzip.stdin);
    gzip.stdout.pipe(writeStream);

    let stderr = '';

    mysqldump.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gzip.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mysqldump.on('error', (err) => {
      reject(new Error(`mysqldump process error: ${err.message}`));
    });

    gzip.on('error', (err) => {
      reject(new Error(`gzip process error: ${err.message}`));
    });

    writeStream.on('error', (err) => {
      reject(new Error(`Write stream error: ${err.message}`));
    });

    writeStream.on('finish', () => {
      const stats = fs.statSync(backupPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      if (stderr && stderr.includes('ERROR')) {
        reject(new Error(`mysqldump failed: ${stderr}`));
      } else {
        console.log(`MySQL backup completed: ${name} (${sizeMB} MB)`);
        resolve({
          path: backupPath,
          size: stats.size,
          database: name
        });
      }
    });

    mysqldump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`mysqldump exited with code ${code}: ${stderr}`));
      }
    });
  });
}
