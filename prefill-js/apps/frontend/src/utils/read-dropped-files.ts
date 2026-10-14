/** A file plus where it sat in a dropped / chosen folder ("Tushar/pan.jpg"); "" for a loose file. */
export interface ChosenFile {
  file: File;
  relativePath: string;
}

const MAXIMUM_FOLDER_DEPTH = 4;

function readEntryFile(fileEntry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => fileEntry.file(resolve, reject));
}

/** readEntries returns at most ~100 entries per call - keep calling until it returns none. */
async function readAllDirectoryEntries(directoryEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const directoryReader = directoryEntry.createReader();
  const allEntries: FileSystemEntry[] = [];
  for (;;) {
    const entryBatch = await new Promise<FileSystemEntry[]>((resolve, reject) => directoryReader.readEntries(resolve, reject));
    if (!entryBatch.length) return allEntries;
    allEntries.push(...entryBatch);
  }
}

async function collectEntryFiles(entry: FileSystemEntry, depth: number, chosenFiles: ChosenFile[]) {
  if (entry.isFile) {
    chosenFiles.push({ file: await readEntryFile(entry as FileSystemFileEntry), relativePath: entry.fullPath.replace(/^\//, "") });
  } else if (entry.isDirectory && depth < MAXIMUM_FOLDER_DEPTH) {
    for (const childEntry of await readAllDirectoryEntries(entry as FileSystemDirectoryEntry)) await collectEntryFiles(childEntry, depth + 1, chosenFiles);
  }
}

/** Every file in a drop - loose files and whole folders (with their folder path). Hidden files are skipped. */
export async function readDroppedFiles(dataTransfer: DataTransfer): Promise<ChosenFile[]> {
  const entries = Array.from(dataTransfer.items || []).map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!entries.length) return Array.from(dataTransfer.files).map((file) => ({ file, relativePath: "" }));
  const chosenFiles: ChosenFile[] = [];
  for (const entry of entries) await collectEntryFiles(entry, 0, chosenFiles);
  return chosenFiles.filter((chosenFile) => !chosenFile.file.name.startsWith("."));
}

/** Files from an <input>; a folder picker fills webkitRelativePath. */
export function readInputFiles(fileList: FileList | null): ChosenFile[] {
  return Array.from(fileList || []).filter((file) => !file.name.startsWith("."))
    .map((file) => ({ file, relativePath: file.webkitRelativePath || "" }));
}
