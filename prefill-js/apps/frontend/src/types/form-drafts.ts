/** One box the app found on a new form, with its proposed name and source - edited before the form is created. */
export interface DraftField {
  id: string;
  key: string;
  /** The printed text next to the box ("Name of the Subscriber"). */
  label: string;
  /** "typed" | "today" | "document.name|upper" | "copy.subscriber_name" | "default.PAN" ... */
  source: string;
  /** How the name was chosen: its label, its value's shape, the same value as another box, or nothing known. */
  matchedBy: "label" | "value" | "same value" | "new";
  page: number;
  x: number;
  y: number;
  fontSize: number;
  type: "text" | "multiline";
  maxWidth: number;
  maxY?: number;
  nominee: number | null;
  /** What the filled sample had here (kept in memory only, never saved). */
  sampleValue: string;
  alsoAt: { page: number; x: number; y: number; fontSize: number; maxWidth?: number }[];
  isRequired: boolean;
}

export interface FormDraft {
  draftId: string;
  blankFileName: string;
  method: "filled-sample" | "pdf-fields" | "printed-blanks";
  pageCount: number;
  pageSizes: { width: number; height: number }[];
  nomineeCount: number;
  fields: DraftField[];
}
