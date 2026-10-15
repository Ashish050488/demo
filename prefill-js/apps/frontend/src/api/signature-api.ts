import { buildApiUrl, requestJson, sendJson } from "./http-client";

export interface SignaturePlace {
  page: number;
  /** "subscriber" places get the uploaded signature; "entity" / "controlling_person" are always signed by hand. */
  signer: string;
  label: string;
  isSignedWithImage: boolean;
}

export const fetchSignaturePlaces = (caseId: string) =>
  requestJson<{ hasSignature: boolean; typedName: string | null; places: SignaturePlace[] }>(`/cases/${caseId}/signature/places`);

/** Cache-busted so a replaced signature shows at once. */
export const getSignatureImageUrl = (caseId: string, version: number) => buildApiUrl(`/cases/${caseId}/signature?v=${version}`);

export function uploadSignature(caseId: string, signatureFile: File) {
  const formData = new FormData();
  formData.append("file", signatureFile);
  return requestJson<{ hasSignature: boolean }>(`/cases/${caseId}/signature`, { method: "POST", body: formData });
}

/** The "digital" signature: the typed name, printed in a signature font. */
export const saveTypedSignature = (caseId: string, name: string) => sendJson<{ typedName: string }>(`/cases/${caseId}/signature/typed`, "POST", { name });

export const deleteSignature = (caseId: string) => sendJson<{ hasSignature: boolean }>(`/cases/${caseId}/signature`, "DELETE");

/** A file meant as the client's signature (signature.png, "sign.jpg", "Ashish sign.png") rather than an ID document. */
export const isSignatureFile = (file: File) => /sign/i.test(file.name) && /\.(png|jpe?g)$/i.test(file.name);
