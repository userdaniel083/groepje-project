export const MAX_FILE_BYTES = 1024 * 1024 * 1024;
export const ENCRYPTION_CHUNK_SIZE = 4 * 1024 * 1024;

const AES_KEY_BYTES = 32;
const CHUNK_NONCE_PREFIX_BYTES = 8;
const METADATA_IV_BYTES = 12;
const GCM_TAG_BYTES = 16;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

interface FileSecretMetadata {
  name: string;
  type: string;
  size: number;
}

interface EncryptedMetadataEnvelope {
  v: 1;
  alg: "AES-GCM";
  chunkSize: number;
  nonce: string;
  metaIv: string;
  meta: string;
}

function ensureCrypto() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Web Crypto is not available in this browser.");
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (let index = 0; index < bytes.length; index += 0x8000) {
    const chunk = bytes.subarray(index, index + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function encodeEnvelope(envelope: EncryptedMetadataEnvelope) {
  return bytesToBase64Url(textEncoder.encode(JSON.stringify(envelope)));
}

export function decodeEnvelope(value: string) {
  try {
    const envelope = JSON.parse(
      textDecoder.decode(base64UrlToBytes(value)),
    ) as EncryptedMetadataEnvelope;

    if (
      envelope.v !== 1 ||
      envelope.alg !== "AES-GCM" ||
      !Number.isInteger(envelope.chunkSize) ||
      envelope.chunkSize <= 0 ||
      typeof envelope.nonce !== "string" ||
      typeof envelope.metaIv !== "string" ||
      typeof envelope.meta !== "string" ||
      base64UrlToBytes(envelope.nonce).byteLength !==
        CHUNK_NONCE_PREFIX_BYTES ||
      base64UrlToBytes(envelope.metaIv).byteLength !== METADATA_IV_BYTES
    ) {
      throw new Error("Invalid encryption envelope.");
    }

    return envelope;
  } catch {
    throw new Error("Invalid encrypted file metadata.");
  }
}

function buildChunkIv(prefix: Uint8Array, chunkIndex: number) {
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  new DataView(iv.buffer).setUint32(8, chunkIndex, false);
  return iv;
}

function sanitizeFileName(name: string) {
  const trimmed = name.trim().replace(/[\\/\u0000-\u001F\u007F]+/g, "_");
  return trimmed || "download.bin";
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  return `${(size / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export async function createShareKey() {
  ensureCrypto();
  const keyBytes = globalThis.crypto.getRandomValues(
    new Uint8Array(AES_KEY_BYTES),
  );
  return bytesToBase64Url(keyBytes);
}

async function importShareKey(rawKey: string, usages: KeyUsage[]) {
  ensureCrypto();
  const keyBytes = base64UrlToBytes(rawKey);

  if (keyBytes.length !== AES_KEY_BYTES) {
    throw new Error("Invalid share key.");
  }

  return globalThis.crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    usages,
  );
}

export async function encryptFileForUpload(
  file: File,
  onProgress?: (progress: number) => void,
) {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Files must be 1 GB or smaller.");
  }

  const rawKey = await createShareKey();
  const cryptoKey = await importShareKey(rawKey, ["encrypt"]);
  const noncePrefix = globalThis.crypto.getRandomValues(
    new Uint8Array(CHUNK_NONCE_PREFIX_BYTES),
  );
  const metadataIv = globalThis.crypto.getRandomValues(
    new Uint8Array(METADATA_IV_BYTES),
  );
  const secretMetadata: FileSecretMetadata = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  };
  const encryptedMetadata = await globalThis.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: metadataIv },
    cryptoKey,
    textEncoder.encode(JSON.stringify(secretMetadata)),
  );

  const parts: BlobPart[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < file.size) {
    const nextChunk = await file
      .slice(offset, offset + ENCRYPTION_CHUNK_SIZE)
      .arrayBuffer();
    const encryptedChunk = await globalThis.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: buildChunkIv(noncePrefix, chunkIndex) },
      cryptoKey,
      nextChunk,
    );

    parts.push(encryptedChunk);
    offset += nextChunk.byteLength;
    chunkIndex += 1;
    onProgress?.(file.size === 0 ? 1 : offset / file.size);
  }

  if (file.size === 0) {
    onProgress?.(1);
  }

  const metadataHeader = encodeEnvelope({
    v: 1,
    alg: "AES-GCM",
    chunkSize: ENCRYPTION_CHUNK_SIZE,
    nonce: bytesToBase64Url(noncePrefix),
    metaIv: bytesToBase64Url(metadataIv),
    meta: bytesToBase64Url(new Uint8Array(encryptedMetadata)),
  });

  return {
    rawKey,
    encryptedBlob: new Blob(parts, { type: "application/octet-stream" }),
    metadataHeader,
    originalSize: file.size,
  };
}

export async function decryptDownloadedFile(
  encryptedBytes: ArrayBuffer,
  rawKey: string,
  metadataHeader: string,
  onProgress?: (progress: number) => void,
) {
  const envelope = decodeEnvelope(metadataHeader);
  const cryptoKey = await importShareKey(rawKey, ["decrypt"]);
  const secretMetadata = JSON.parse(
    textDecoder.decode(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64UrlToBytes(envelope.metaIv) },
        cryptoKey,
        base64UrlToBytes(envelope.meta),
      ),
    ),
  ) as FileSecretMetadata;

  if (
    typeof secretMetadata.name !== "string" ||
    typeof secretMetadata.type !== "string" ||
    !Number.isInteger(secretMetadata.size) ||
    secretMetadata.size < 0
  ) {
    throw new Error("Invalid decrypted file metadata.");
  }

  const encryptedView = new Uint8Array(encryptedBytes);
  const noncePrefix = base64UrlToBytes(envelope.nonce);
  const chunkCount = Math.ceil(secretMetadata.size / envelope.chunkSize);

  if (chunkCount === 0) {
    onProgress?.(1);
  }
  const decryptedParts: BlobPart[] = [];
  let offset = 0;

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const plainChunkSize = Math.min(
      envelope.chunkSize,
      secretMetadata.size - chunkIndex * envelope.chunkSize,
    );
    const encryptedChunkSize = plainChunkSize + GCM_TAG_BYTES;
    const encryptedChunk = encryptedView.subarray(
      offset,
      offset + encryptedChunkSize,
    );

    if (encryptedChunk.byteLength !== encryptedChunkSize) {
      throw new Error("Encrypted file is truncated or corrupt.");
    }

    const decryptedChunk = await globalThis.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buildChunkIv(noncePrefix, chunkIndex) },
      cryptoKey,
      encryptedChunk,
    );

    decryptedParts.push(decryptedChunk);
    offset += encryptedChunkSize;
    onProgress?.(
      encryptedView.byteLength === 0 ? 1 : offset / encryptedView.byteLength,
    );
  }

  if (offset !== encryptedView.byteLength) {
    throw new Error("Encrypted file is corrupt.");
  }

  return {
    fileName: sanitizeFileName(secretMetadata.name),
    blob: new Blob(decryptedParts, {
      type: secretMetadata.type || "application/octet-stream",
    }),
    size: secretMetadata.size,
  };
}

export function saveBlobAsFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = sanitizeFileName(fileName);
  anchor.rel = "noopener";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
