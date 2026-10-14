// Every filesystem location the backend uses, resolved once. Personal data (uploads, saved settings) and
// generated PDFs live outside the source tree, in folders that are gitignored.
import path from "node:path";
import { fileURLToPath } from "node:url";

const CONFIG_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_SOURCE_DIRECTORY = path.join(CONFIG_DIRECTORY, "..");
export const REPOSITORY_ROOT = path.join(BACKEND_SOURCE_DIRECTORY, "..", "..", "..");
export const DATA_DIRECTORY = process.env.DATA_DIRECTORY || path.join(REPOSITORY_ROOT, "data");
export const OUTPUT_DIRECTORY = process.env.OUTPUT_DIRECTORY || path.join(REPOSITORY_ROOT, "output");
export const TESSDATA_DIRECTORY = process.env.TESSDATA_DIRECTORY || path.join(REPOSITORY_ROOT, "tessdata");
export const BLANK_FORMS_DIRECTORY = path.join(DATA_DIRECTORY, "Blank Forms");
export const UPLOADS_DIRECTORY = path.join(DATA_DIRECTORY, "uploads");
export const FORMS_DIRECTORY = path.join(BACKEND_SOURCE_DIRECTORY, "forms");
