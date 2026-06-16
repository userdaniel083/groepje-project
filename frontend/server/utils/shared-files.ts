import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { useRuntimeConfig } from "#imports";

export interface SharedFileRecord {
  id: string;
  name: string;
  size: number;
  contentType: string;
  uploadedAt: string;
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

export function toSharedFileResponse(record: SharedFileRecord) {
  return {
    ...record,
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

  await writeFile(getBlobPath(record.id), file.data);
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

export async function openSharedFileStream(id: string) {
  await stat(getBlobPath(id));
  return createReadStream(getBlobPath(id));
}

export function getDownloadDisposition(filename: string) {
  const fallback = filename
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
