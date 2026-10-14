"use client";
import FileDropZone from "@/components/ui/FileDropZone";

const DOCUMENT_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
const MAXIMUM_FILES_PER_UPLOAD = 15;

interface DocumentDropZoneProps {
  onFilesChosen: (documentFiles: File[], relativePaths: string[]) => void;
  isDisabled?: boolean;
}

/** Identity documents: up to 15 PDF/JPG/PNG files, loose or in folders (one folder per person helps grouping). */
export default function DocumentDropZone({ onFilesChosen, isDisabled = false }: DocumentDropZoneProps) {
  return (
    <FileDropZone allowedExtensions={DOCUMENT_EXTENSIONS} isMultiple isFolderAllowed maximumFileCount={MAXIMUM_FILES_PER_UPLOAD} isDisabled={isDisabled}
      title="Drop documents or folders here" buttonLabel="Choose files" onFilesChosen={onFilesChosen}
      hint={<>Aadhaar (front and back), PAN, passport, driving licence · PDF, JPG or PNG · up to 15 files, 15MB each.<br />
        Mixed people are fine - files are grouped by the name on them. A folder per person (or named &quot;Nominee 2&quot;) helps.</>} />
  );
}
