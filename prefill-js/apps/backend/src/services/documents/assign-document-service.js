// Puts a freshly read document with the nominee whose other documents show the same name; a new name goes to
// the first nominee with no named documents yet. A document with no name on it (e.g. Aadhaar back) joins the
// nominee of the most recent named document. A document the user placed by hand is never moved.
import { getCase, updateCaseDocument } from "../storage/case-store-service.js";
import { getIdentityRecord } from "./identity-number-memory-service.js";

const MAXIMUM_NOMINEE_NUMBER = 3;

function normalizeNameWords(personName) {
  return (personName || "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((word) => word.length > 1).sort();
}

function getDocumentName(caseDocument) {
  return caseDocument.foundName || getIdentityRecord(caseDocument.id)?.name || null;
}

export function isSamePersonName(firstName, secondName) {
  const firstWords = normalizeNameWords(firstName);
  const secondWords = normalizeNameWords(secondName);
  if (!firstWords.length || !secondWords.length) return false;
  const sharedWordCount = firstWords.filter((word) => secondWords.includes(word)).length;
  return sharedWordCount >= Math.min(2, firstWords.length, secondWords.length);
}

export async function assignDocumentToNominee(caseId, documentId) {
  const caseEntry = await getCase(caseId);
  const caseDocument = caseEntry?.documents.find((candidate) => candidate.id === documentId);
  if (!caseDocument || caseDocument.assignedManually || caseDocument.status !== "done") return;
  const otherDocuments = caseEntry.documents.filter((candidate) => candidate.id !== documentId && candidate.status === "done");
  const documentName = getDocumentName(caseDocument);
  let targetNominee = null;
  let assignedBy = null;
  if (documentName) {
    const sameNameDocument = otherDocuments.find((candidate) => getDocumentName(candidate) && isSamePersonName(getDocumentName(candidate), documentName));
    if (sameNameDocument) {
      targetNominee = sameNameDocument.assignedNominee;
      assignedBy = "same name as another document";
    } else {
      const namedNominees = new Set(otherDocuments.filter((candidate) => getDocumentName(candidate)).map((candidate) => candidate.assignedNominee));
      targetNominee = Array.from({ length: MAXIMUM_NOMINEE_NUMBER }, (_unused, index) => index + 1).find((nomineeNumber) => !namedNominees.has(nomineeNumber)) || 1;
      assignedBy = namedNominees.size ? "new name - next free nominee" : "first person";
    }
  } else {
    const lastNamedDocument = [...otherDocuments].reverse().find((candidate) => getDocumentName(candidate));
    if (lastNamedDocument) {
      targetNominee = lastNamedDocument.assignedNominee;
      assignedBy = "no name on it - kept with the last named document";
    }
  }
  if (targetNominee) await updateCaseDocument(caseId, documentId, { assignedNominee: targetNominee, assignedBy });
}
