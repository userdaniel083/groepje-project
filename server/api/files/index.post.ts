import { createError, defineEventHandler, readMultipartFormData } from "h3";
import { saveSharedFile, toSharedFileResponse } from "../../utils/shared-files";

export default defineEventHandler(async (event) => {
  const form = await readMultipartFormData(event);
  const file = form?.find((part) => part.type && part.filename && part.data);

  if (!file?.data) {
    throw createError({
      statusCode: 400,
      statusMessage: "Please upload a file."
    });
  }

  const saved = await saveSharedFile({
    name: file.filename,
    type: file.type,
    data: file.data
  });

  return toSharedFileResponse(saved);
});
