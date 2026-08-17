import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const TEST_ENV_FILE = ".env.test";
const APP_ENV_FILE = ".env";

export function loadTestEnv(): void {
  const file = path.resolve(process.cwd(), TEST_ENV_FILE);
  if (!fs.existsSync(file)) {
    return;
  }
  dotenv.config({ path: file, override: false });
}

export function appDatabaseUrlForSafetyCheck(): string | undefined {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }
  const file = path.resolve(process.cwd(), APP_ENV_FILE);
  if (!fs.existsSync(file)) {
    return undefined;
  }
  const parsed = dotenv.parse(fs.readFileSync(file));
  return parsed.DATABASE_URL;
}
