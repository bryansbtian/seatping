const REQUIRED_IN_PROD = [
  "DATABASE_URL",
  "JWT_SECRET",
  "CRON_SECRET",
  "ADMIN_USERNAME",
  "ADMIN_PASSWORD_HASH",
  "EMAIL_PASSWORD",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "QSTASH_TOKEN",
  "QSTASH_CURRENT_SIGNING_KEY",
  "QSTASH_NEXT_SIGNING_KEY",
] as const;

const OPTIONAL_PROVIDERS = [
  "TELNYX_API_KEY",
  "TELNYX_PHONE_NUMBER",
  "KAPSO_API_KEY",
  "KAPSO_PHONE_NUMBER_ID",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
] as const;

let checked = false;

export function logEnvStatus(): void {
  if (checked) {
    return;
  }
  checked = true;
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const missingRequired = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
  const missingOptional = OPTIONAL_PROVIDERS.filter((k) => !process.env[k]);

  if (missingRequired.length > 0) {
    console.error(
      "\n" +
        "========================================================================\n" +
        "  ⚠️  MISSING REQUIRED PRODUCTION ENV VARS  ⚠️\n" +
        `  ${missingRequired.join(", ")}\n` +
        "  Features depending on these will silently fail (auth, crons, jobs,\n" +
        "  rate limits, email). Set them in the Vercel project and redeploy.\n" +
        "========================================================================\n",
    );
  }
  if (missingOptional.length > 0) {
    console.warn(
      `[env] optional provider vars not set: ${missingOptional.join(", ")} ` +
        "(the corresponding channel/feature will no-op)",
    );
  }
  if (missingRequired.length === 0 && missingOptional.length === 0) {
    console.log("[env] all expected production env vars are present");
  }
}
