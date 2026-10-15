// OCR off the API thread: a small pool of worker threads (scan-ocr-thread-entry.js) reads scans; this thread only
// queues them. Measured before: while a 20-client batch was read in the API thread, a simple request took up to
// 11 s; the screens froze. A thread that crashes is replaced and only its one scan fails.
// Results are cached here by file content, in memory only (raw text holds full ID numbers - never on disk).
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const THREAD_COUNT = Math.max(1, Number(process.env.OCR_THREAD_COUNT) || 2);
const THREAD_ENTRY_URL = new URL("./scan-ocr-thread-entry.js", import.meta.url);
const OCR_CACHE_MAXIMUM_ENTRIES = 60;

const ocrCache = new Map();
const waitingScans = [];
const threads = [];
let nextRequestId = 1;

function startThread() {
  const thread = { worker: new Worker(THREAD_ENTRY_URL), busyWith: null };
  thread.worker.on("message", ({ requestId, result, errorName, errorMessage }) => {
    const job = thread.busyWith;
    if (!job || job.requestId !== requestId) return;
    thread.busyWith = null;
    if (errorMessage) job.reject(Object.assign(new Error(errorMessage), { name: errorName || "Error" }));
    else job.resolve(result);
    giveWork();
  });
  const replaceThread = (reason) => {
    thread.busyWith?.reject(new Error(`OCR thread stopped: ${reason}`));
    thread.busyWith = null;
    threads.splice(threads.indexOf(thread), 1);
    setTimeout(() => { startThread(); giveWork(); }, 1000); // a pause, so a thread failing at start can't spin
  };
  thread.worker.on("error", (error) => { console.error("OCR thread error:", error?.message || error); replaceThread(error?.message || "error"); });
  thread.worker.on("exit", (exitCode) => { if (threads.includes(thread)) replaceThread(`exit ${exitCode}`); });
  threads.push(thread);
}

function giveWork() {
  for (const thread of threads) {
    if (thread.busyWith || !waitingScans.length) continue;
    const job = waitingScans.shift();
    thread.busyWith = job;
    thread.worker.postMessage({ requestId: job.requestId, scanPath: job.scanPath });
  }
}

/** Start the threads at server start, so their OCR models are loaded before the first upload. */
export function startScanOcrThreads() {
  while (threads.length < THREAD_COUNT) startThread();
}

/** {fields, rawText, linesByPass, hasQrCode} for one scan (PDF or photo), read on an OCR thread. */
export async function readScanTextInBackground(scanPath) {
  const cacheKey = createHash("sha256").update(await readFile(scanPath)).digest("hex");
  if (ocrCache.has(cacheKey)) return ocrCache.get(cacheKey);
  startScanOcrThreads();
  const result = await new Promise((resolve, reject) => {
    waitingScans.push({ requestId: nextRequestId++, scanPath, resolve, reject });
    giveWork();
  });
  ocrCache.set(cacheKey, result);
  if (ocrCache.size > OCR_CACHE_MAXIMUM_ENTRIES) ocrCache.delete(ocrCache.keys().next().value);
  return result;
}
