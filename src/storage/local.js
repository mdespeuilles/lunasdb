import fs from 'fs';
import path from 'path';

/**
 * Save backup to local storage and manage rotation
 */
export async function saveToLocal(backupFilePath, config) {
  const storagePath = config.storage.path;
  const keep = config.storage.keep || 10;

  // Ensure storage directory exists
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }

  const fileName = path.basename(backupFilePath);
  const destinationPath = path.join(storagePath, fileName);

  // If backup was created in a temp location, copy it (don't delete source)
  if (backupFilePath !== destinationPath) {
    fs.copyFileSync(backupFilePath, destinationPath);
  }

  console.log(`[Local] Backup saved to: ${destinationPath}`);

  // Perform rotation - delete old backups
  await rotateLocalBackups(storagePath, keep);

  return destinationPath;
}

/**
 * Rotate backups - keep only the N most recent files
 */
async function rotateLocalBackups(directory, keep) {
  try {
    // Get all files in directory
    const files = fs.readdirSync(directory)
      .filter(file => {
        const fullPath = path.join(directory, file);
        return fs.statSync(fullPath).isFile() && (file.endsWith('.sql.gz') || file.endsWith('.dump'));
      })
      .map(file => {
        const fullPath = path.join(directory, file);
        return {
          name: file,
          path: fullPath,
          mtime: fs.statSync(fullPath).mtime
        };
      });

    // Sort by modification time (newest first)
    files.sort((a, b) => b.mtime - a.mtime);

    // Delete files beyond the keep limit
    if (files.length > keep) {
      const filesToDelete = files.slice(keep);
      console.log(`Rotating backups: deleting ${filesToDelete.length} old backup(s)`);

      for (const file of filesToDelete) {
        fs.unlinkSync(file.path);
        console.log(`  Deleted: ${file.name}`);
      }
    } else {
      console.log(`Backup rotation: keeping ${files.length} backup(s) (limit: ${keep})`);
    }
  } catch (error) {
    console.error(`Error during backup rotation: ${error.message}`);
    throw error;
  }
}
