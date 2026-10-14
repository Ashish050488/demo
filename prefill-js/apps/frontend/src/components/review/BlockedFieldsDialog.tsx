"use client";
import { formatFieldLabel, getNomineeNumber } from "@prefill/shared";
import Dialog from "@/components/ui/Dialog";

interface BlockedFieldsDialogProps {
  blockedFields: { field: string; reason: string }[];
  onClose: () => void;
  onJumpToField: (fieldKey: string) => void;
  getSectionLabel: (fieldKey: string) => string;
}

/** Shown when "Continue" is pressed while fields still need fixing; each row jumps to its field. */
export default function BlockedFieldsDialog({ blockedFields, onClose, onJumpToField, getSectionLabel }: BlockedFieldsDialogProps) {
  const title = `${blockedFields.length} field${blockedFields.length === 1 ? "" : "s"} must be fixed before saving`;
  return (
    <Dialog title={title} isOpen={blockedFields.length > 0} onClose={onClose}>
      <ul className="space-y-1.5">
        {blockedFields.map((blockedField) => (
          <li key={blockedField.field}>
            <button type="button" onClick={() => onJumpToField(blockedField.field)}
              className="w-full rounded-lg border border-line px-3 py-2 text-left hover:border-red-300 hover:bg-red-50">
              <div className="text-sm font-medium">{getSectionLabel(blockedField.field)} – {formatFieldLabel(blockedField.field)}{getNomineeNumber(blockedField.field) ? ` (Nominee ${getNomineeNumber(blockedField.field)})` : ""}</div>
              <div className="text-xs text-red-700">{blockedField.reason}</div>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
