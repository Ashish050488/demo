import StatusState from "@/components/ui/StatusState";
import type { BatchClient, BatchStatus } from "@/types/batches";
import type { FolderMatch } from "@/utils/match-client-folders";

interface BatchMatchTableProps {
  batch: BatchStatus | null;
  clients: BatchClient[];
  folderMatch: FolderMatch | null;
  isDisabled?: boolean;
  /** "+ Add files" on a row: this client's own PAN / Aadhaar, picked from anywhere. */
  onPickFiles?: (caseId: string, pickedFiles: File[]) => void;
  onClearPicked?: (caseId: string) => void;
  pickedCountByCaseId?: Map<string, number>;
}

/** Before starting: every Excel row, which documents it got (from the folder or picked on the row), and anything to check. */
export default function BatchMatchTable({ batch, clients, folderMatch, isDisabled = false, onPickFiles, onClearPicked, pickedCountByCaseId = new Map() }: BatchMatchTableProps) {
  if (!batch || !folderMatch) {
    return (
      <section className="rounded-xl border border-line bg-white">
        <StatusState title="Clients appear here" message="Choose the form and drop the client Excel. Each row is listed with the documents found for it, so you can check before starting." />
      </section>
    );
  }
  const unmatchedCount = folderMatch.unmatchedPaths.length;
  return (
    <section className="flex min-h-0 flex-col rounded-xl border border-line bg-white">
      <h2 className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-semibold">
        Clients <span className="font-normal text-muted">({clients.length}{batch.forms.length > 1 ? ` × ${batch.forms.length} forms` : ""})</span>
        {unmatchedCount ? <span className="ml-auto text-xs font-normal text-amber-800">{unmatchedCount} file{unmatchedCount === 1 ? "" : "s"} matched no client</span> : null}
      </h2>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-canvas text-muted">
            <tr><th className="px-4 py-2 font-medium">Row</th><th className="py-2 font-medium">Client reference</th><th className="py-2 font-medium">Name</th><th className="py-2 font-medium">Documents</th><th className="py-2 pr-4 font-medium">Notes</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {clients.map((client) => {
              const clientFiles = folderMatch.filesByCaseId.get(client.caseId);
              const notes = [
                !client.clientReference ? "no client reference" : null,
                client.rowProblemCount ? `${client.rowProblemCount} value${client.rowProblemCount === 1 ? "" : "s"} to check` : null,
                clientFiles?.skippedCount ? `${clientFiles.skippedCount} extra files skipped (max 15)` : null,
              ].filter(Boolean);
              return (
                <tr key={client.caseId}>
                  <td className="px-4 py-2 tabular-nums text-muted">{client.rowNumber}</td>
                  <td className="py-2 font-medium">{client.clientReference || "-"}</td>
                  <td className="max-w-[12rem] truncate py-2">{client.displayName || <span className="text-muted">-</span>}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      {clientFiles ? <span className="text-emerald-700" title={clientFiles.relativePaths.join("\n")}>{clientFiles.files.length} file{clientFiles.files.length === 1 ? "" : "s"}</span> : <span className="text-muted">Excel only</span>}
                      {onPickFiles ? (
                        <label className={`cursor-pointer rounded-full border border-line px-2 py-0.5 text-ink hover:bg-canvas ${isDisabled ? "pointer-events-none opacity-50" : ""}`} title="Add this client's PAN, Aadhaar, passport or licence">
                          + Add files
                          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={isDisabled}
                            onChange={(event) => { const pickedFiles = [...(event.target.files || [])]; if (pickedFiles.length) onPickFiles(client.caseId, pickedFiles); event.target.value = ""; }} />
                        </label>
                      ) : null}
                      {pickedCountByCaseId.get(client.caseId) && onClearPicked ? (
                        <button type="button" disabled={isDisabled} onClick={() => onClearPicked(client.caseId)} className="text-muted hover:text-red-700" title="Remove the files added on this row">✕ {pickedCountByCaseId.get(client.caseId)} added</button>
                      ) : null}
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-amber-800">{notes.join(" · ")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {unmatchedCount ? (
          <details className="border-t border-line px-4 py-2 text-xs text-muted">
            <summary className="cursor-pointer text-amber-800">Files that matched no client - their folder name is not a client reference or name</summary>
            <ul className="mt-1 max-h-32 overflow-auto">{folderMatch.unmatchedPaths.slice(0, 100).map((unmatchedPath) => <li key={unmatchedPath}>{unmatchedPath}</li>)}</ul>
          </details>
        ) : null}
      </div>
    </section>
  );
}
