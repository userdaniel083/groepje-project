import { PutObjectCommand } from "@aws-sdk/client-s3";
import { createError, defineEventHandler, getHeader } from "h3";
import { randomBytes } from "node:crypto";
import { Transform } from "node:stream";
import { getS3Bucket, getS3Client } from "../../utils/s3";

const MAX_FILE_BYTES = 1024 * 1024 * 1024;
const MAX_ENCRYPTED_OVERHEAD_BYTES = 1024 * 1024;
const MAX_ENCRYPTED_BYTES = MAX_FILE_BYTES + MAX_ENCRYPTED_OVERHEAD_BYTES;
const FILE_ID_PATTERN = /^[a-f0-9]{32}$/;
const META_HEADER_PATTERN = /^[A-Za-z0-9_-]+$/;

type EncryptedMetaEnvelope = {
  v: 1;
  alg: "AES-GCM";
  chunkSize: number;
  nonce: string;
  metaIv: string;
  meta: string;
};

function parseOriginalSize(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid x-file-size header.",
    });
  }

  const size = Number(value);

  if (!Number.isSafeInteger(size) || size < 0 || size > MAX_FILE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Files must be 1 GB or smaller.",
    });
  }

  return size;
}

function parseEncryptedMeta(value: string | undefined) {
  if (!value || value.length > 1500 || !META_HEADER_PATTERN.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing or invalid x-file-meta header.",
    });
  }

  try {
    const json = Buffer.from(
      value.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    const meta = JSON.parse(json) as EncryptedMetaEnvelope;

    if (
      meta.v !== 1 ||
      meta.alg !== "AES-GCM" ||
      !Number.isInteger(meta.chunkSize) ||
      meta.chunkSize <= 0 ||
      meta.chunkSize > 8 * 1024 * 1024 ||
      typeof meta.nonce !== "string" ||
      typeof meta.metaIv !== "string" ||
      typeof meta.meta !== "string"
    ) {
      throw new Error("Invalid encrypted metadata envelope.");
    }

    return value;
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid encrypted metadata envelope.",
    });
  }
}

function parseEncryptedLength(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  if (!/^\d+$/.test(value)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid content-length header.",
    });
  }

  const size = Number(value);

  if (!Number.isSafeInteger(size) || size < 0) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid content-length header.",
    });
  }

  if (size > MAX_ENCRYPTED_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: "Encrypted upload is too large.",
    });
  }

  return size;
}

function createLimitedStream(maxBytes: number) {
  let bytesSeen = 0;

  return new Transform({
    transform(chunk, _encoding, callback) {
      bytesSeen += chunk.length;

      if (bytesSeen > maxBytes) {
        callback(
          createError({
            statusCode: 413,
            statusMessage: "Encrypted upload is too large.",
          }),
        );
        return;
      }

      callback(null, chunk);
    },
  });
}

function generateFileId() {
  const value = randomBytes(16).toString("hex");

  if (!FILE_ID_PATTERN.test(value)) {
    throw new Error("Failed to generate a valid file id.");
  }

  return value;
}

export default defineEventHandler(async (event) => {
  const contentType = getHeader(event, "content-type");
  const originalSize = parseOriginalSize(getHeader(event, "x-file-size"));
  const encryptedMeta = parseEncryptedMeta(getHeader(event, "x-file-meta"));
  const contentLength = parseEncryptedLength(
    getHeader(event, "content-length"),
  );

  if (contentType !== "application/octet-stream") {
    throw createError({
      statusCode: 415,
      statusMessage: "Uploads must use application/octet-stream.",
    });
  }

  const requestStream = event.node.req;

  if (!requestStream) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing upload body.",
    });
  }

  const fileId = generateFileId();
  const limitedStream = requestStream.pipe(
    createLimitedStream(MAX_ENCRYPTED_BYTES),
  );

  console.info("[file-upload] starting", {
    fileId,
    originalSize,
    encryptedSize: contentLength ?? null,
  });

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getS3Bucket(),
        Key: fileId,
        Body: limitedStream,
        ContentType: "application/octet-stream",
        ContentLength: contentLength,
        Metadata: {
          encmeta: encryptedMeta,
          filesize: String(originalSize),
        },
        ServerSideEncryption: "AES256",
      }),
    );

    console.info("[file-upload] complete", {
      fileId,
      originalSize,
      encryptedSize: contentLength ?? null,
    });
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "statusCode" in error
        ? Number(error.statusCode)
        : undefined;

    console.error("[file-upload] failed", {
      fileId,
      originalSize,
      encryptedSize: contentLength ?? null,
      message: error instanceof Error ? error.message : String(error),
      statusCode,
    });

    if (statusCode === 413) {
      throw createError({
        statusCode: 413,
        statusMessage: "Encrypted upload is too large.",
      });
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Failed to store file in S3.",
    });
  }

  return {
    id: fileId,
    originalSize,
    downloadPath: `/download/${fileId}`,
  };
});
