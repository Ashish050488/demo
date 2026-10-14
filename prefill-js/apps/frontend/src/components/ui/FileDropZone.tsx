"use client";
import { useRef, useState, type ReactNode } from "react";
import { readDroppedFiles, readInputFiles, type ChosenFile } from "@/utils/read-dropped-files";
import Button from "./Button";

interface FileDropZoneProps {
  /** Allowed extensions, e.g. [".xlsx", ".csv"]. Dropped files are checked too (a drop ignores the picker filter). */
  allowedExtensions: string[];
  isMultiple?: boolean;
  /** Also accept whole folders (drop or "Choose folder"); each file keeps its folder path. */
  isFolderAllowed?: boolean;
  maximumFileCount?: number;
  title: string;
  hint?: ReactNode;
  buttonLabel?: string;
  isDisabled?: boolean;
  isCompact?: boolean;
  onFilesChosen: (chosenFiles: File[], relativePaths: string[]) => void;
}

const hasAllowedExtension = (chosenFile: File, allowedExtensions: string[]) =>
  allowedExtensions.some((extension) => chosenFile.name.toLowerCase().endsWith(extension.toLowerCase()));

/** Drag-and-drop area with a "Choose" button; rejects wrong file types and extra files with a clear message. */
export default function FileDropZone(props: FileDropZoneProps) {
  const { allowedExtensions, isMultiple = false, isFolderAllowed = false, maximumFileCount = isMultiple ? 10 : 1, title, hint, buttonLabel = "Choose file", isDisabled = false, isCompact = false, onFilesChosen } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0); // dragenter/leave fire for every child element - count them so the highlight doesn't flicker
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const handleFiles = (allFiles: ChosenFile[]) => {
    if (!allFiles.length || isDisabled) return;
    const allowedFiles = allFiles.filter((chosenFile) => hasAllowedExtension(chosenFile.file, allowedExtensions));
    const rejectedNames = allFiles.filter((chosenFile) => !allowedFiles.includes(chosenFile)).map((chosenFile) => chosenFile.file.name);
    const acceptedFiles = allowedFiles.slice(0, maximumFileCount);
    const messages = [];
    if (rejectedNames.length) messages.push(`Skipped (only ${allowedExtensions.join(", ")}): ${rejectedNames.slice(0, 5).join(", ")}${rejectedNames.length > 5 ? ` and ${rejectedNames.length - 5} more` : ""}`);
    if (allowedFiles.length > maximumFileCount) messages.push(maximumFileCount === 1 ? `Only one file at a time - using ${acceptedFiles[0].file.name}` : `Only ${maximumFileCount} files at a time - the rest were skipped`);
    if (!allowedFiles.length && !rejectedNames.length) messages.push("That folder is empty");
    setRejectionMessage(messages.length ? messages.join(". ") : null);
    if (acceptedFiles.length) onFilesChosen(acceptedFiles.map((chosenFile) => chosenFile.file), acceptedFiles.map((chosenFile) => chosenFile.relativePath));
  };

  return (
    <div>
      <div
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDraggingOver(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setIsDraggingOver(false); }}
        onDrop={(event) => {
          event.preventDefault(); dragDepth.current = 0; setIsDraggingOver(false);
          if (isFolderAllowed) readDroppedFiles(event.dataTransfer).then(handleFiles, () => setRejectionMessage("Could not read that folder - choose the files instead"));
          else handleFiles(readInputFiles(event.dataTransfer.files));
        }}
        className={`rounded-2xl border-2 border-dashed text-center transition ${isCompact ? "p-5" : "p-8"} ${isDisabled ? "opacity-60" : ""} ${isDraggingOver ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}
      >
        <p className="text-sm font-medium">{isDraggingOver ? "Drop to upload" : title}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        <div className="mt-3 flex justify-center gap-2">
          <Button disabled={isDisabled} onClick={() => fileInput.current?.click()}>{buttonLabel}</Button>
          {isFolderAllowed ? <Button variant="ghost" disabled={isDisabled} onClick={() => folderInput.current?.click()}>Choose folder</Button> : null}
        </div>
        <input ref={fileInput} type="file" accept={allowedExtensions.join(",")} multiple={isMultiple} hidden
          onChange={(event) => { handleFiles(readInputFiles(event.target.files)); event.target.value = ""; }} />
        {isFolderAllowed ? (
          <input ref={folderInput} type="file" hidden multiple {...{ webkitdirectory: "" }}
            onChange={(event) => { handleFiles(readInputFiles(event.target.files)); event.target.value = ""; }} />
        ) : null}
      </div>
      {rejectionMessage ? <p className="mt-2 text-xs text-amber-800">{rejectionMessage}</p> : null}
    </div>
  );
}
