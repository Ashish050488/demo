// One JSON file owned by this process (the case manifest, the batch list). The file is read once; after that
// reads come from memory, so polling never touches the disk and a read can never collide with a write.
// Writes go through one queue (no two interleave) and are temp-file-then-rename, so the file on disk is always
// whole. On Windows a rename fails with EPERM/EACCES/EBUSY while anything (antivirus, an editor, another read)
// has the file open - retried for a few seconds, the same fix graceful-fs uses, instead of failing the update.
import crypto from "node:crypto";
import path from "node:path";
import { readFile, writeFile, mkdir, rename, rm } from "node:fs/promises";

const LOCKED_FILE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
const RETRY_DELAYS_MILLISECONDS = [20, 50, 100, 200, 400, 800, 1200, 1600];
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function withLockedFileRetry(task) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (error) {
      if (!LOCKED_FILE_CODES.has(error.code) || attempt >= RETRY_DELAYS_MILLISECONDS.length) throw error;
      await wait(RETRY_DELAYS_MILLISECONDS[attempt]);
    }
  }
}

export function createJsonFileStore(filePath) {
  let cachedData = null;
  let queue = Promise.resolve();
  const runInQueue = (task) => {
    const run = queue.then(task, task);
    queue = run.then(() => {}, () => {});
    return run;
  };

  async function loadOnce() {
    if (cachedData) return cachedData;
    try {
      cachedData = JSON.parse(await withLockedFileRetry(() => readFile(filePath, "utf-8")));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      cachedData = {};
    }
    return cachedData;
  }

  async function persist(data) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const temporaryPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(data, null, 2));
    try {
      await withLockedFileRetry(() => rename(temporaryPath, filePath));
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => {});
      throw error;
    }
  }

  return {
    /** A copy of the whole file's data - callers may change it freely without touching the store. */
    read: async () => structuredClone(await loadOnce()),
    /** mutate(data) changes a copy; the copy becomes the data only once it is safely on disk. */
    update: (mutate) => runInQueue(async () => {
      const draft = structuredClone(await loadOnce());
      const mutationResult = await mutate(draft);
      await persist(draft);
      cachedData = draft;
      return mutationResult;
    }),
  };
}
