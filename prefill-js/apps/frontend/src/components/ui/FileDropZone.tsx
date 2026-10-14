"use client";
import { useRef, useState, type ReactNode } from "react";
import Button from "./Button";

interface FileDropZoneProps {
  /** Allowed extensions, e.g. [".xlsx", ".csv"]. Dropped files are checked too (a drop ignores the picker filter). */
  allowedExtensions: string[];
  isMultiple?: boolean;
  maximumFileCount?: number;
  title: string;
  hint?: ReactNode;
  buttonLabel?: string;
  isDisabled?: boolean;
  isCompact?: boolean;
  onFilesChosen: (chosenFiles: File[]) => void;
}

const hasAllowedExtension = (chosenFile: File, allowedExtensions: string[]) =>
  allowedExtensions.some((extension) => chosenFile.name.toLowerCase().endsWith(extension.toLowerCase()));

/** Drag-and-drop area with a "Choose" button; rejects wrong file types and extra files with a clear message. */
export default function FileDropZone(props: FileDropZoneProps) {
  const { allowedExtensions, isMultiple = false, maximumFileCount = isMultiple ? 10 : 1, title, hint, buttonLabel = "Choose file", isDisabled = false, isCompact = false, onFilesChosen } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0); // dragenter/leave fire for every child element - count them so the highlight doesn't flicker
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [rejectionMessage, setRejectionMessage] = useState<string | null>(null);

  const handleFiles = (fileList: FileList | null) => {
    const allFiles = Array.from(fileList || []);
    if (!allFiles.length || isDisabled) return;
    const allowedFiles = allFiles.filter((chosenFile) => hasAllowedExtension(chosenFile, allowedExtensions));
    const rejectedNames = allFiles.filter((chosenFile) => !allowedFiles.includes(chosenFile)).map((chosenFile) => chosenFile.name);
    const acceptedFiles = allowedFiles.slice(0, maximumFileCount);
    const messages = [];
    if (rejectedNames.length) messages.push(`Not accepted (only ${allowedExtensions.join(", ")}): ${rejectedNames.join(", ")}`);
    if (allowedFiles.length > maximumFileCount) messages.push(maximumFileCount === 1 ? `Only one file at a time - using ${acceptedFiles[0].name}` : `Only ${maximumFileCount} files at a time - the rest were skipped`);
    setRejectionMessage(messages.length ? messages.join(". ") : null);
    if (acceptedFiles.length) onFilesChosen(acceptedFiles);
  };

  return (
    <div>
      <div
        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setIsDraggingOver(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setIsDraggingOver(false); }}
        onDrop={(event) => { event.preventDefault(); dragDepth.current = 0; setIsDraggingOver(false); handleFiles(event.dataTransfer.files); }}
        className={`rounded-2xl border-2 border-dashed text-center transition ${isCompact ? "p-5" : "p-8"} ${isDisabled ? "opacity-60" : ""} ${isDraggingOver ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}
      >
        <p className="text-sm font-medium">{isDraggingOver ? "Drop to upload" : title}</p>
        {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
        <Button className="mt-3" disabled={isDisabled} onClick={() => fileInput.current?.click()}>{buttonLabel}</Button>
        <input ref={fileInput} type="file" accept={allowedExtensions.join(",")} multiple={isMultiple} hidden
          onChange={(event) => { handleFiles(event.target.files); event.target.value = ""; }} />
      </div>
      {rejectionMessage ? <p className="mt-2 text-xs text-amber-800">{rejectionMessage}</p> : null}
    </div>
  );
}
