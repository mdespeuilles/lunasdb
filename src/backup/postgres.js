import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

/**
 * Create a PostgreSQL backup using pg_dump
 */
export async function backupPostgres(name, config, backupPath) {
  console.log(`Starting PostgreSQL backup for: ${name}`);

  return new Promise((resolve, reject) => {
    const args = [
      `-h${config.host}`,
      `-p${config.port}`,
      `-U${config.username}`,
      '--format=custom',
      '--compress=9',
      '--verbose',
      '--no-password',
      config.database
    ];

    // Set up environment for pg_dump
    const env = { ...process.env };
    if (config.password) {
      env.PGPASSWORD = config.password;
    }

    // Create write stream
    const writeStream = fs.createWriteStream(backupPath);

    // Spawn pg_dump process
    const pgdump = spawn('pg_dump', args, { env });

    pgdump.stdout.pipe(writeStream);

    let stderr = '';

    pgdump.stderr.on('data', (data) => {
      // pg_dump writes verbose output to stderr, which is normal
      stderr += data.toString();
    });

    pgdump.on('error', (err) => {
      reject(new Error(`pg_dump process error: ${err.message}`));
    });

    writeStream.on('error', (err) => {
      reject(new Error(`Write stream error: ${err.message}`));
    });

    pgdump.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`pg_dump exited with code ${code}: ${stderr}`));
      } else {
        const stats = fs.statSync(backupPath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        // Check for actual errors in stderr
        if (stderr.toLowerCase().includes('error:')) {
          reject(new Error(`pg_dump reported errors: ${stderr}`));
        } else {
          console.log(`PostgreSQL backup completed: ${name} (${sizeMB} MB)`);
          resolve({
            path: backupPath,
            size: stats.size,
            database: name
          });
        }
      }
    });
  });
}
