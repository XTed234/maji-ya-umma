import { fileURLToPath } from "node:url";

// Load Backend/.env (if present) before anything reads process.env. Imported
// first by every module that reads configuration; ES modules evaluate once.
try {
  process.loadEnvFile(fileURLToPath(new URL("./.env", import.meta.url)));
} catch {
  // no .env file: real environment variables / defaults apply
}
