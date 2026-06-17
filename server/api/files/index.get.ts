import { defineEventHandler } from "h3";
import { listSharedFiles, toSharedFileResponse } from "../../utils/shared-files";

export default defineEventHandler(async () => {
  const files = await listSharedFiles();
  return files.map(toSharedFileResponse);
});
