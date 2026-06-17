import {
  createError,
  defineEventHandler,
  getHeader,
  getRequestURL,
  setHeader,
} from "h3";
import { useRuntimeConfig } from "#imports";

export default defineEventHandler((event) => {
  const config = useRuntimeConfig();
  const requireHttps = config.requireHttps === true || config.requireHttps === "true";
  const url = getRequestURL(event);
  const forwardedProtocol = getHeader(event, "x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    ?.toLowerCase();
  const isHttps = url.protocol === "https:" || forwardedProtocol === "https";

  if (isHttps) {
    setHeader(
      event,
      "strict-transport-security",
      "max-age=31536000; includeSubDomains",
    );
  }

  if (requireHttps && !isHttps) {
    throw createError({
      statusCode: 426,
      statusMessage: "HTTPS is required for encrypted file transport.",
    });
  }
});
