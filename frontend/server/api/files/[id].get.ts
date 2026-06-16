import { createError, defineEventHandler, getRouterParam } from "h3";
import { getSharedFile, toSharedFileResponse } from "../../utils/shared-files";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: "Missing file id." });
  }

  try {
    const file = await getSharedFile(id);
    return toSharedFileResponse(file);
  } catch {
    throw createError({ statusCode: 404, statusMessage: "File not found." });
  }
});
