"use client";
import FileDropZone from "@/components/ui/FileDropZone";

const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAXIMUM_FILES_PER_UPLOAD = 10;

/** Identity documents: up to 10 PDF/JPG/PNG files at once. */
export default function DocumentDropZone({ onFilesChosen, isDisabled = false }: { onFilesChosen: (documentFiles: File[]) => void; isDisabled?: boolean }) {
  return (
    <FileDropZone allowedExtensions={DOCUMENT_EXTENSIONS} isMultiple maximumFileCount={MAXIMUM_FILES_PER_UPLOAD} isDisabled={isDisabled}
      title="Drop documents here" buttonLabel="Choose files" onFilesChosen={onFilesChosen}
      hint="Aadhaar (front and back), PAN, passport, driving licence · PDF, JPG or PNG · up to 10 files, 15MB each" />
  );
}
