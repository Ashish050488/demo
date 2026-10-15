"use client";
import { useEffect, useRef, useState } from "react";
import { deleteSignature, fetchSignaturePlaces, getSignatureImageUrl, saveTypedSignature, uploadSignature, type SignaturePlace } from "@/api/signature-api";

interface SignatureCardProps {
  caseId: string;
  /** Offered for the typed signature (the subscriber's name on the form). */
  suggestedName: string;
  /** The PDF was rebuilt with (or without) the signature - refresh the preview. */
  onChanged: () => void;
  onGoToPage: (pageNumber: number) => void;
}

type SignatureMode = "typed" | "image";

/** Where this form must be signed, and how: a typed ("digital") name, an uploaded image, or by hand. */
export default function SignatureCard({ caseId, suggestedName, onChanged, onGoToPage }: SignatureCardProps) {
  const [places, setPlaces] = useState<SignaturePlace[]>([]);
  const [hasImage, setHasImage] = useState(false);
  const [typedName, setTypedName] = useState<string | null>(null);
  const [mode, setMode] = useState<SignatureMode>("typed");
  const [draftName, setDraftName] = useState("");
  const [version, setVersion] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // One line in the sidebar; the controls open in a popover so the page list keeps the room.
  const [isOpen, setIsOpen] = useState(false);
  const cardElement = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => { if (!cardElement.current?.contains(event.target as Node)) setIsOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setIsOpen(false); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("mousedown", closeOnOutsideClick); document.removeEventListener("keydown", closeOnEscape); };
  }, [isOpen]);
  useEffect(() => {
    fetchSignaturePlaces(caseId).then((result) => {
      setPlaces(result.places);
      setHasImage(result.hasSignature);
      setTypedName(result.typedName);
      if (result.hasSignature) setMode("image");
    }).catch(() => setPlaces([]));
  }, [caseId, version]);
  // The saved typed signature wins; otherwise offer the name on the form.
  useEffect(() => { if (typedName) setDraftName(typedName); }, [typedName]);
  useEffect(() => { setDraftName((current) => current || suggestedName); }, [suggestedName]);
  if (!places.length) return null;

  async function change(action: () => Promise<unknown>) {
    setIsWorking(true);
    setErrorMessage(null);
    try {
      await action();
      setVersion((current) => current + 1);
      onChanged();
    } catch (error) {
      setErrorMessage((error as Error).message);
    } finally {
      setIsWorking(false);
    }
  }
  const signedPlaces = places.filter((place) => place.isSignedWithImage);
  // One button per page (page 37 has two signatories).
  const handPlaces = places.filter((place) => !place.isSignedWithImage).filter((place, index, all) => all.findIndex((other) => other.page === place.page) === index);
  const isSigned = hasImage || Boolean(typedName);
  const pageButton = (place: SignaturePlace, index: number) => (
    <button key={`${place.page}-${index}`} type="button" title={place.label} onClick={() => onGoToPage(place.page)}
      className="rounded-full border border-line px-1.5 tabular-nums hover:bg-canvas">{place.page}</button>
  );
  const tabClasses = (tabMode: SignatureMode) => `flex-1 rounded-full px-2 py-0.5 ${mode === tabMode ? "bg-ink text-white" : "text-muted hover:text-ink"}`;

  return (
    <div ref={cardElement} className="relative text-[11px]">
      <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((current) => !current)}
        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left hover:bg-canvas ${isOpen ? "border-ink" : "border-line"}`}>
        <span aria-hidden>✍</span>
        <span className="font-semibold text-ink">Signature</span>
        <span className={`ml-auto truncate whitespace-nowrap rounded-full px-1.5 py-px ${isSigned ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
          {hasImage ? "Image ✓" : typedName ? "Typed ✓" : "By hand"}
        </span>
        <span className="text-muted" aria-hidden>{isOpen ? "▾" : "▸"}</span>
      </button>
      {isOpen ? (
      <div className="absolute bottom-full left-0 z-40 mb-1.5 w-72 rounded-xl border border-line bg-white p-3 shadow-xl">
      <div className="mb-2 flex items-center">
        <span className="text-xs font-semibold text-ink">Signature</span>
        {isSigned ? <button type="button" disabled={isWorking} onClick={() => change(() => deleteSignature(caseId))} className="ml-auto text-muted hover:text-red-700">Remove signature</button> : null}
      </div>
      <div className="mb-2 flex rounded-full border border-line p-0.5" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "typed"} className={tabClasses("typed")} onClick={() => setMode("typed")}>Type name</button>
        <button type="button" role="tab" aria-selected={mode === "image"} className={tabClasses("image")} onClick={() => setMode("image")}>Image</button>
      </div>
      {mode === "typed" ? (
        <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); if (draftName.trim()) change(() => saveTypedSignature(caseId, draftName.trim())); }}>
          <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Name to sign with"
            className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1 font-serif text-[13px] italic text-black" />
          <button type="submit" disabled={isWorking || !draftName.trim() || draftName.trim() === typedName} className="w-16 shrink-0 rounded-lg bg-ink font-medium text-white disabled:bg-ink/30">
            {isWorking ? "…" : typedName ? "Update" : "Sign"}
          </button>
        </form>
      ) : (
        <div className="flex items-center gap-2">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element -- the case's own signature from the local API
            <img src={getSignatureImageUrl(caseId, version)} alt="Client's signature" className="h-9 min-w-0 flex-1 rounded border border-line bg-canvas object-contain" />
          ) : <span className="min-w-0 flex-1 text-muted">Photo or scan of the signature - the paper is removed for you</span>}
          <label className={`w-16 shrink-0 cursor-pointer rounded-lg border border-line py-1 text-center font-medium text-ink hover:bg-canvas ${isWorking ? "pointer-events-none opacity-50" : ""}`}>
            {isWorking ? "Saving…" : hasImage ? "Replace" : "Upload"}
            <input type="file" accept=".png,.jpg,.jpeg" className="hidden"
              onChange={(event) => { const signatureFile = event.target.files?.[0]; event.target.value = ""; if (signatureFile) change(() => uploadSignature(caseId, signatureFile)); }} />
          </label>
        </div>
      )}
      <div className="mt-3 grid grid-cols-[4.5rem_1fr] items-start gap-x-2 gap-y-1.5 border-t border-line pt-2.5 text-muted">
        <span className="pt-0.5">Signed on</span>
        <span className="flex flex-wrap gap-1">{signedPlaces.map(pageButton)}</span>
        {handPlaces.length ? <>
          <span className="pt-0.5" title="Entity signatories and controlling persons always sign by hand">By hand</span>
          <span className="flex flex-wrap items-center gap-1">{handPlaces.map(pageButton)}<span className="text-[10px]">entities only</span></span>
        </> : null}
      </div>
      {errorMessage ? <div className="mt-1 text-red-700">{errorMessage}</div> : null}
      </div>
      ) : null}
    </div>
  );
}
