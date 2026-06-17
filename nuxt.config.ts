// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },
  modules: ["@nuxt/hints", "@nuxt/image", "@nuxt/ui"],
  css: ["~/assets/css/main.css"],
  runtimeConfig: {
    awsRegion: process.env.AWS_REGION || process.env.S3_REGION,
    awsS3Bucket: process.env.AWS_S3_BUCKET || process.env.S3_BUCKET,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY,
    awsSecretAccessKey:
      process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY,
    awsS3Endpoint:
      process.env.AWS_S3_ENDPOINT ||
      process.env.S3_ENDPOINT ||
      process.env.S3_URL,
  },
  routeRules: {
    "/download": { ssr: false },
    "/download/**": { ssr: false },
  },
});
