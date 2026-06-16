import { createError, defineEventHandler, getRouterParam, sendStream, setHeader } from "h3";
import {
  getDownloadDisposition,
  getSharedFile,
  openSharedFileStream
} from "../../../utils/shared-files";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing file id." });
  }

  try {
    const file = await getSharedFile(id);
    const stream = await openSharedFileStream(id);

    setHeader(event, "content-type", file.contentType || "application/octet-stream");
    setHeader(event, "content-length", String(file.size));
    setHeader(event, "content-disposition", getDownloadDisposition(file.name));

    return sendStream(event, stream);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "File not found." });
  }
});
