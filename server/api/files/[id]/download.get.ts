import { GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";
import { Readable } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import {
  createError,
  defineEventHandler,
  getRouterParam,
  sendStream,
  setHeader,
} from "h3";
import { getS3Bucket, getS3Client } from "../../../utils/s3";

const FILE_ID_PATTERN = /^[a-f0-9]{32}$/;

function normalizeFileId(value: string | undefined) {
  const match = value
    ?.trim()
    .toLowerCase()
    .match(/[a-f0-9]{32}/);
  return match?.[0];
}

function toNodeReadableStream(body: unknown): NodeJS.ReadableStream {
  if (body && typeof body === "object" && "pipe" in body) {
    return body as NodeJS.ReadableStream;
  }

  return Readable.fromWeb(body as NodeReadableStream);
}

export default defineEventHandler(async (event) => {
  const id = normalizeFileId(getRouterParam(event, "id"));

  if (!id || !FILE_ID_PATTERN.test(id)) {
    throw createError({ statusCode: 400, statusMessage: "Invalid file id." });
  }

  try {
    const object = await getS3Client().send(
      new GetObjectCommand({
        Bucket: getS3Bucket(),
        Key: id,
      }),
    );

    if (!object.Body) {
      throw createError({ statusCode: 404, statusMessage: "File not found." });
    }

    if (object.ContentLength !== undefined) {
      setHeader(event, "content-length", object.ContentLength);
    }

    setHeader(event, "content-type", "application/octet-stream");
    setHeader(event, "cache-control", "no-store, max-age=0");
    setHeader(event, "x-content-type-options", "nosniff");

    const encryptedMeta = object.Metadata?.encmeta;
    if (encryptedMeta) {
      setHeader(event, "x-file-meta", encryptedMeta);
    }

    const originalSize = object.Metadata?.filesize;
    if (originalSize) {
      setHeader(event, "x-file-size", originalSize);
    }

    return sendStream(event, toNodeReadableStream(object.Body));
  } catch (error) {
    if (error instanceof NoSuchKey) {
      throw createError({ statusCode: 404, statusMessage: "File not found." });
    }

    if (typeof error === "object" && error && "$metadata" in error) {
      const metadata = error.$metadata as { httpStatusCode?: number };

      if (metadata.httpStatusCode === 404) {
        throw createError({
          statusCode: 404,
          statusMessage: "File not found.",
        });
      }
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Failed to read file from S3.",
    });
  }
});
