"use client";
import { useRef, useState } from "react";
import Button from "@/components/ui/Button";

const MAXIMUM_FILES_PER_UPLOAD = 10;

/** Drag-and-drop or pick up to 10 PDF/JPG/PNG files at once. */
export default function DocumentDropZone({ onFilesChosen, isDisabled = false }: { onFilesChosen: (documentFiles: File[]) => void; isDisabled?: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const handleFiles = (fileList: FileList | null) => {
    const documentFiles = Array.from(fileList || []).slice(0, MAXIMUM_FILES_PER_UPLOAD);
    if (documentFiles.length) onFilesChosen(documentFiles);
  };

  return (
    <div
      onDragOver={(event) => { event.preventDefault(); setIsDraggingOver(true); }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={(event) => { event.preventDefault(); setIsDraggingOver(false); handleFiles(event.dataTransfer.files); }}
      className={`rounded-2xl border-2 border-dashed p-8 text-center transition ${isDraggingOver ? "border-brand-500 bg-brand-50" : "border-line bg-white"}`}
    >
      <p className="text-sm font-medium">Drop documents here</p>
      <p className="mt-1 text-xs text-muted">Aadhaar (front and back), PAN, passport, driving licence · PDF, JPG or PNG · up to 10 files, 15MB each</p>
      <Button className="mt-4" disabled={isDisabled} onClick={() => fileInput.current?.click()}>Choose files</Button>
      <input ref={fileInput} type="file" accept=".pdf,.jpg,.jpeg,.png" multiple hidden
        onChange={(event) => { handleFiles(event.target.files); event.target.value = ""; }} />
    </div>
  );
}
