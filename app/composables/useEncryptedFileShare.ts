import {
  decryptDownloadedFile,
  encryptFileForUpload,
  formatBytes,
  MAX_FILE_BYTES,
  saveBlobAsFile,
} from "../utils/file-share-crypto";

interface UploadResult {
  id: string;
  originalSize: number;
  downloadPath: string;
}

function normalizeFileId(value: string) {
  const match = value
    .trim()
    .toLowerCase()
    .match(/[a-f0-9]{32}/);
  return match?.[0] || "";
}

function requestJson<T>(options: {
  method: string;
  url: string;
  body?: Document | XMLHttpRequestBodyInit | null;
  headers?: Record<string, string>;
  onUploadProgress?: (loaded: number, total: number) => void;
}) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(options.method, options.url, true);
    xhr.responseType = "text";

    Object.entries(options.headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        options.onUploadProgress?.(event.loaded, event.total);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new Error("Invalid server response."));
        }

        return;
      }

      reject(
        new Error(
          extractErrorMessage(xhr.responseText) ||
            `Request failed with ${xhr.status}.`,
        ),
      );
    };

    xhr.onerror = () => reject(new Error("Network request failed."));
    xhr.send(options.body ?? null);
  });
}

function requestBinary(options: {
  method: string;
  url: string;
  onDownloadProgress?: (loaded: number, total: number) => void;
}) {
  return new Promise<{ data: ArrayBuffer; headers: Record<string, string> }>(
    (resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(options.method, options.url, true);
      xhr.responseType = "arraybuffer";

      xhr.onprogress = (event) => {
        if (event.lengthComputable) {
          options.onDownloadProgress?.(event.loaded, event.total);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            data: xhr.response,
            headers: parseHeaders(xhr.getAllResponseHeaders()),
          });
          return;
        }

        reject(
          new Error(
            extractErrorMessage(getXhrErrorText(xhr)) ||
              `Request failed with ${xhr.status}.`,
          ),
        );
      };

      xhr.onerror = () => reject(new Error("Network request failed."));
      xhr.send();
    },
  );
}

function parseHeaders(rawHeaders: string) {
  return rawHeaders
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .reduce<Record<string, string>>((headers, line) => {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex === -1) {
        return headers;
      }

      const key = line.slice(0, separatorIndex).trim().toLowerCase();
      const value = line.slice(separatorIndex + 1).trim();
      headers[key] = value;
      return headers;
    }, {});
}

function extractErrorMessage(responseText: string) {
  if (!responseText) {
    return "";
  }

  try {
    const payload = JSON.parse(responseText) as {
      statusMessage?: string;
      message?: string;
      data?: { statusMessage?: string; message?: string };
    };

    return (
      payload.data?.statusMessage ||
      payload.data?.message ||
      payload.statusMessage ||
      payload.message ||
      ""
    );
  } catch {
    return responseText;
  }
}

function getXhrErrorText(xhr: XMLHttpRequest) {
  if (typeof xhr.responseText === "string" && xhr.responseText) {
    return xhr.responseText;
  }

  if (xhr.response instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(xhr.response));
  }

  return "";
}

export function useEncryptedFileShare() {
  const uploadProgress = ref(0);
  const downloadProgress = ref(0);
  const isUploading = ref(false);
  const isDownloading = ref(false);

  async function uploadFile(file: File) {
    if (!import.meta.client) {
      throw new Error("Uploading is only available in the browser.");
    }

    uploadProgress.value = 0;
    isUploading.value = true;

    try {
      const encrypted = await encryptFileForUpload(file, (progress) => {
        uploadProgress.value = progress * 0.35;
      });

      const result = await requestJson<UploadResult>({
        method: "POST",
        url: "/api/files",
        body: encrypted.encryptedBlob,
        headers: {
          "content-type": "application/octet-stream",
          "x-file-size": String(encrypted.originalSize),
          "x-file-meta": encrypted.metadataHeader,
        },
        onUploadProgress: (loaded, total) => {
          uploadProgress.value = 0.35 + (total > 0 ? loaded / total : 0) * 0.65;
        },
      });

      uploadProgress.value = 1;

      const shareUrl = new URL(result.downloadPath, window.location.origin);
      shareUrl.searchParams.set("key", encrypted.rawKey);

      return {
        ...result,
        shareUrl: shareUrl.toString(),
        key: encrypted.rawKey,
      };
    } finally {
      isUploading.value = false;
    }
  }

  async function downloadFile(fileId: string, rawKey: string) {
    if (!import.meta.client) {
      throw new Error("Downloading is only available in the browser.");
    }

    const normalizedFileId = normalizeFileId(fileId);

    if (!normalizedFileId) {
      throw new Error("Invalid file id.");
    }

    downloadProgress.value = 0;
    isDownloading.value = true;

    try {
      const response = await requestBinary({
        method: "GET",
        url: `/api/files/${normalizedFileId}/download`,
        onDownloadProgress: (loaded, total) => {
          downloadProgress.value = (total > 0 ? loaded / total : 0) * 0.7;
        },
      });

      const metadataHeader = response.headers["x-file-meta"];

      if (!metadataHeader) {
        throw new Error("Missing encrypted file metadata.");
      }

      const decrypted = await decryptDownloadedFile(
        response.data,
        rawKey,
        metadataHeader,
        (progress) => {
          downloadProgress.value = 0.7 + progress * 0.3;
        },
      );

      saveBlobAsFile(decrypted.blob, decrypted.fileName);
      downloadProgress.value = 1;
      return decrypted;
    } finally {
      isDownloading.value = false;
    }
  }

  return {
    uploadProgress,
    downloadProgress,
    isUploading,
    isDownloading,
    uploadFile,
    downloadFile,
    maxFileBytes: MAX_FILE_BYTES,
    formatBytes,
  };
}
