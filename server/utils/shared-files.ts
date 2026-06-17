import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { useRuntimeConfig } from "#imports";

export interface SharedFileRecord {
  id: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  encryption?: {
    algorithm: "AES-256-GCM";
    iv: string;
    authTag: string;
  };
}

function getStoragePaths() {
  const config = useRuntimeConfig();
  const storageRoot = config.sharedFilesDir as string;

  return {
    blobsDir: join(storageRoot, "blobs"),
    metaDir: join(storageRoot, "meta"),
  };
}

export async function ensureSharedFileStorage() {
  const { blobsDir, metaDir } = getStoragePaths();
  await mkdir(blobsDir, { recursive: true });
  await mkdir(metaDir, { recursive: true });
}

function getBlobPath(id: string) {
  return join(getStoragePaths().blobsDir, id);
}

function getMetaPath(id: string) {
  return join(getStoragePaths().metaDir, `${id}.json`);
}

function getEncryptionKey() {
  const config = useRuntimeConfig();
  const rawKey = (config.fileEncryptionKey as string).trim();

  if (!rawKey) {
    throw new Error(
      "Missing FILE_ENCRYPTION_KEY. Set it to a 32-byte base64 key before uploading files.",
    );
  }

  const key = Buffer.from(rawKey, "base64");

  if (key.length !== 32) {
    throw new Error(
      "Invalid FILE_ENCRYPTION_KEY. Use a base64 encoded 32-byte key.",
    );
  }

  return key;
}

function encryptFile(data: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encryptedData = Buffer.concat([cipher.update(data), cipher.final()]);

  return {
    data: encryptedData,
    encryption: {
      algorithm: "AES-256-GCM" as const,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    },
  };
}

export function toSharedFileResponse(record: SharedFileRecord) {
  const { encryption: _encryption, ...safeRecord } = record;

  return {
    ...safeRecord,
    shareUrl: `/download?id=${record.id}`,
    downloadUrl: `/api/files/${record.id}/download`,
  };
}

export async function saveSharedFile(file: {
  name?: string;
  type?: string;
  data: Buffer;
}) {
  await ensureSharedFileStorage();

  const record: SharedFileRecord = {
    id: randomUUID(),
    name: file.name?.trim() || "upload.bin",
    size: file.data.byteLength,
    contentType: file.type || "application/octet-stream",
    uploadedAt: new Date().toISOString(),
  };

  const encryptedFile = encryptFile(file.data);
  record.encryption = encryptedFile.encryption;

  await writeFile(getBlobPath(record.id), encryptedFile.data);
  await writeFile(
    getMetaPath(record.id),
    JSON.stringify(record, null, 2),
    "utf8",
  );

  return record;
}

export async function getSharedFile(id: string) {
  await ensureSharedFileStorage();

  const metadata = JSON.parse(
    await readFile(getMetaPath(id), "utf8"),
  ) as SharedFileRecord;

  await stat(getBlobPath(id));

  return metadata;
}

export async function listSharedFiles() {
  await ensureSharedFileStorage();

  const { metaDir } = getStoragePaths();
  const entries = await readdir(metaDir, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const contents = await readFile(join(metaDir, entry.name), "utf8");
        return JSON.parse(contents) as SharedFileRecord;
      }),
  );

  return files.sort(
    (a, b) =>
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime(),
  );
}

export async function openSharedFileStream(record: SharedFileRecord) {
  await stat(getBlobPath(record.id));

  const stream = createReadStream(getBlobPath(record.id));

  if (!record.encryption) {
    return stream;
  }

  if (record.encryption.algorithm !== "AES-256-GCM") {
    throw new Error(
      `Unsupported encryption algorithm: ${record.encryption.algorithm}`,
    );
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(record.encryption.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(record.encryption.authTag, "base64"));

  return stream.pipe(decipher);
}

export function getDownloadDisposition(filename: string) {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
