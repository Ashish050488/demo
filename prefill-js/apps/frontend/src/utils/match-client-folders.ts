// Which dropped file belongs to which client: a folder anywhere in the file's path whose name is the client's
// reference ("C-002") - or the client's name ("Arjun Iyer") - claims it. Everything below that folder is kept
// ("Nominee 2/pan.jpg") so the server can still group by nominee folder.
import type { BatchClient } from "@/types/batches";

export const MAXIMUM_DOCUMENTS_PER_CLIENT = 15;

export interface ClientFiles {
  files: File[];
  relativePaths: string[];
  skippedCount: number;
}

export interface FolderMatch {
  filesByCaseId: Map<string, ClientFiles>;
  unmatchedPaths: string[];
}

const normalizeFolderName = (folderName: string) => folderName.toLowerCase().replace(/[^a-z0-9]/g, "");

export function matchClientFolders(clients: BatchClient[], files: File[], relativePaths: string[]): FolderMatch {
  // A reference used by several rows can't pick one of them - those rows get their documents by hand.
  const referenceCounts = new Map<string, number>();
  for (const client of clients) {
    const reference = normalizeFolderName(client.clientReference || "");
    if (reference) referenceCounts.set(reference, (referenceCounts.get(reference) || 0) + 1);
  }
  const caseIdByFolderName = new Map<string, string>();
  for (const client of clients) {
    const reference = normalizeFolderName(client.clientReference || "");
    if (reference && referenceCounts.get(reference) === 1) caseIdByFolderName.set(reference, client.caseId);
  }
  // A folder named after a person only counts when exactly one client has that name.
  const nameCounts = new Map<string, number>();
  for (const client of clients) {
    const displayName = normalizeFolderName(client.displayName || "");
    if (displayName) nameCounts.set(displayName, (nameCounts.get(displayName) || 0) + 1);
  }
  for (const client of clients) {
    const displayName = normalizeFolderName(client.displayName || "");
    if (displayName && nameCounts.get(displayName) === 1 && !caseIdByFolderName.has(displayName)) caseIdByFolderName.set(displayName, client.caseId);
  }

  const filesByCaseId = new Map<string, ClientFiles>();
  const unmatchedPaths: string[] = [];
  files.forEach((file, fileIndex) => {
    const pathParts = (relativePaths[fileIndex] || file.name).split("/").filter(Boolean);
    const folderParts = pathParts.slice(0, -1);
    const matchIndex = folderParts.findIndex((folderName) => caseIdByFolderName.has(normalizeFolderName(folderName)));
    if (matchIndex < 0) { unmatchedPaths.push(pathParts.join("/")); return; }
    const caseId = caseIdByFolderName.get(normalizeFolderName(folderParts[matchIndex]))!;
    const clientFiles = filesByCaseId.get(caseId) || { files: [], relativePaths: [], skippedCount: 0 };
    if (clientFiles.files.length >= MAXIMUM_DOCUMENTS_PER_CLIENT) clientFiles.skippedCount += 1;
    else {
      clientFiles.files.push(file);
      clientFiles.relativePaths.push(pathParts.slice(matchIndex + 1).join("/"));
    }
    filesByCaseId.set(caseId, clientFiles);
  });
  return { filesByCaseId, unmatchedPaths };
}
