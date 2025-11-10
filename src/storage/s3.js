import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';

/**
 * Save backup to S3 and manage rotation
 */
export async function saveToS3(backupFilePath, config) {
  const bucket = config.storage.bucket;
  const prefix = config.storage.prefix || '';
  const region = config.storage.region || 'us-east-1';
  const keep = config.storage.keep || 10;
  const accessKeyId = config.storage.accessKeyId;
  const secretAccessKey = config.storage.secretAccessKey;
  const endpoint = config.storage.endpoint;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error('S3 storage requires accessKeyId and secretAccessKey');
  }

  // Initialize S3 client
  const s3ClientConfig = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  };

  // Add endpoint for S3-compatible services (DigitalOcean Spaces, etc.)
  if (endpoint) {
    s3ClientConfig.endpoint = endpoint;
    s3ClientConfig.forcePathStyle = false; // Use virtual-hosted-style URLs
  }

  const s3Client = new S3Client(s3ClientConfig);

  const fileName = path.basename(backupFilePath);
  const s3Key = prefix ? `${prefix}${fileName}` : fileName;

  console.log(`Uploading backup to S3: s3://${bucket}/${s3Key}`);

  try {
    // Read file
    const fileStream = fs.createReadStream(backupFilePath);
    const stats = fs.statSync(backupFilePath);

    // Upload to S3
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: bucket,
        Key: s3Key,
        Body: fileStream,
        ContentType: 'application/gzip',
        Metadata: {
          'backup-date': new Date().toISOString(),
          'original-size': stats.size.toString()
        }
      }
    });

    upload.on('httpUploadProgress', (progress) => {
      const percent = Math.round((progress.loaded / progress.total) * 100);
      if (percent % 25 === 0) {
        console.log(`  [S3] Upload progress: ${percent}%`);
      }
    });

    await upload.done();

    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    console.log(`[S3] Backup uploaded successfully: ${sizeMB} MB`);

    // Perform rotation - delete old backups
    await rotateS3Backups(s3Client, bucket, prefix, keep);

    return `s3://${bucket}/${s3Key}`;
  } catch (error) {
    console.error(`Error uploading to S3: ${error.message}`);
    throw error;
  }
}

/**
 * Rotate S3 backups - keep only the N most recent files
 */
async function rotateS3Backups(s3Client, bucket, prefix, keep) {
  try {
    // List all objects in the bucket with the given prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    });

    const response = await s3Client.send(listCommand);

    if (!response.Contents || response.Contents.length === 0) {
      console.log('No backups found in S3 for rotation');
      return;
    }

    // Filter for backup files and sort by last modified date (newest first)
    const backupFiles = response.Contents
      .filter(obj => obj.Key.endsWith('.sql.gz') || obj.Key.endsWith('.dump'))
      .sort((a, b) => b.LastModified - a.LastModified);

    // Delete files beyond the keep limit
    if (backupFiles.length > keep) {
      const filesToDelete = backupFiles.slice(keep);
      console.log(`Rotating S3 backups: deleting ${filesToDelete.length} old backup(s)`);

      for (const file of filesToDelete) {
        const deleteCommand = new DeleteObjectCommand({
          Bucket: bucket,
          Key: file.Key
        });

        await s3Client.send(deleteCommand);
        console.log(`  Deleted: ${file.Key}`);
      }
    } else {
      console.log(`S3 backup rotation: keeping ${backupFiles.length} backup(s) (limit: ${keep})`);
    }
  } catch (error) {
    console.error(`Error during S3 backup rotation: ${error.message}`);
    throw error;
  }
}
