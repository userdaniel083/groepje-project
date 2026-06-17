import { S3Client } from "@aws-sdk/client-s3";
import { useRuntimeConfig } from "#imports";

let cachedClient: S3Client | null = null;
let cachedSignature = "";

function normalizeEndpoint(endpoint: string | undefined) {
  if (!endpoint) {
    return undefined;
  }

  const trimmed = endpoint.trim();

  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getRequiredConfig() {
  const config = useRuntimeConfig();
  const region = config.awsRegion as string | undefined;
  const bucket = config.awsS3Bucket as string | undefined;
  const accessKeyId = config.awsAccessKeyId as string | undefined;
  const secretAccessKey = config.awsSecretAccessKey as string | undefined;
  const endpoint = normalizeEndpoint(
    config.awsS3Endpoint as string | undefined,
  );

  if (!region) {
    throw new Error("Missing AWS_REGION runtime config.");
  }

  if (!bucket) {
    throw new Error("Missing AWS_S3_BUCKET runtime config.");
  }

  return {
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    endpoint,
  };
}

export function getS3Bucket() {
  return getRequiredConfig().bucket;
}

export function getS3Client() {
  const config = getRequiredConfig();
  const signature = JSON.stringify({
    region: config.region,
    endpoint: config.endpoint ?? "",
    accessKeyId: config.accessKeyId ?? "",
    secretAccessKey: config.secretAccessKey ?? "",
  });

  if (cachedClient && cachedSignature === signature) {
    return cachedClient;
  }

  cachedSignature = signature;
  cachedClient = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          }
        : undefined,
  });

  return cachedClient;
}
