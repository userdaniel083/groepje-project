import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { H3Event } from "h3";

const DAY_MS = 24 * 60 * 60 * 1000;
export const DAILY_UPLOAD_LIMIT_BYTES = 3 * 1024 * 1024 * 1024;
const storePath = join(process.cwd(), "data", "upload-rate-limit.json");

type UsageEntry = {
  timestamp: number;
  bytes: number;
};

type UsageStore = Record<string, UsageEntry[]>;

type PendingReservation = {
  id: string;
  ip: string;
  bytes: number;
};

export class UploadQuotaExceededError extends Error {
  readonly usedBytes: number;
  readonly requestedBytes: number;
  readonly limitBytes: number;

  constructor(options: {
    usedBytes: number;
    requestedBytes: number;
    limitBytes: number;
  }) {
    super("Daily upload limit exceeded.");
    this.name = "UploadQuotaExceededError";
    this.usedBytes = options.usedBytes;
    this.requestedBytes = options.requestedBytes;
    this.limitBytes = options.limitBytes;
  }
}

let loadedStore: UsageStore | null = null;
const pendingReservations = new Map<string, PendingReservation>();
let mutationQueue = Promise.resolve();

function queueMutation<T>(callback: () => Promise<T>) {
  const operation = mutationQueue.then(callback, callback);
  mutationQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}

async function ensureStoreLoaded() {
  if (loadedStore) {
    return loadedStore;
  }

  try {
    const raw = await readFile(storePath, "utf8");
    loadedStore = JSON.parse(raw) as UsageStore;
  } catch {
    loadedStore = {};
  }

  return loadedStore;
}

async function persistStore() {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(storePath, JSON.stringify(loadedStore ?? {}, null, 2), "utf8");
}

function purgeExpiredEntries(entries: UsageEntry[], now: number) {
  const cutoff = now - DAY_MS;
  return entries.filter((entry) => entry.timestamp >= cutoff);
}

function getPendingBytesForIp(ip: string) {
  let total = 0;

  for (const reservation of pendingReservations.values()) {
    if (reservation.ip === ip) {
      total += reservation.bytes;
    }
  }

  return total;
}

function normalizeIp(ip: string | undefined) {
  if (!ip) {
    return "unknown";
  }

  const trimmed = ip.trim();

  if (!trimmed) {
    return "unknown";
  }

  if (trimmed === "::1") {
    return "127.0.0.1";
  }

  if (trimmed.startsWith("::ffff:")) {
    return trimmed.slice(7);
  }

  return trimmed;
}

export function getRequestIpAddress(event: H3Event) {
  const forwardedFor = event.node.req.headers["x-forwarded-for"];

  if (typeof forwardedFor === "string") {
    return normalizeIp(forwardedFor.split(",")[0]);
  }

  if (Array.isArray(forwardedFor) && forwardedFor[0]) {
    return normalizeIp(forwardedFor[0].split(",")[0]);
  }

  const realIp = event.node.req.headers["x-real-ip"];

  if (typeof realIp === "string") {
    return normalizeIp(realIp);
  }

  if (Array.isArray(realIp) && realIp[0]) {
    return normalizeIp(realIp[0]);
  }

  return normalizeIp(event.node.req.socket.remoteAddress);
}

export async function reserveUploadQuota(ip: string, bytes: number) {
  return queueMutation(async () => {
    const store = await ensureStoreLoaded();
    const now = Date.now();
    const existingEntries = purgeExpiredEntries(store[ip] ?? [], now);
    store[ip] = existingEntries;

    const committedBytes = existingEntries.reduce(
      (total, entry) => total + entry.bytes,
      0,
    );
    const pendingBytes = getPendingBytesForIp(ip);
    const usedBytes = committedBytes + pendingBytes;

    if (usedBytes + bytes > DAILY_UPLOAD_LIMIT_BYTES) {
      throw new UploadQuotaExceededError({
        usedBytes,
        requestedBytes: bytes,
        limitBytes: DAILY_UPLOAD_LIMIT_BYTES,
      });
    }

    const reservation: PendingReservation = {
      id: randomUUID(),
      ip,
      bytes,
    };

    pendingReservations.set(reservation.id, reservation);

    return {
      reservationId: reservation.id,
      usedBytes,
      remainingBytes: DAILY_UPLOAD_LIMIT_BYTES - usedBytes - bytes,
    };
  });
}

export async function commitUploadQuota(reservationId: string) {
  return queueMutation(async () => {
    const reservation = pendingReservations.get(reservationId);

    if (!reservation) {
      return;
    }

    const store = await ensureStoreLoaded();
    const now = Date.now();
    const existingEntries = purgeExpiredEntries(store[reservation.ip] ?? [], now);
    existingEntries.push({
      timestamp: now,
      bytes: reservation.bytes,
    });
    store[reservation.ip] = existingEntries;

    pendingReservations.delete(reservationId);
    await persistStore();
  });
}

export async function releaseUploadQuota(reservationId: string) {
  return queueMutation(async () => {
    pendingReservations.delete(reservationId);
  });
}
