// Groups a case's documents by person and gives each person a nominee slot. Re-run on the WHOLE case after every
// document is read (and after a move or remove), one run per case at a time, so files that finish together can
// never race each other into the wrong slot.
//
// Who is the same person - strongest clue first:
//   1. Same Aadhaar last 4 (front and back of one card both carry it).
//   2. Same name (fuzzy - see isSamePersonName in @prefill/shared).
//   3. Same date of birth, or the same upload folder, when the names don't contradict it.
//   4. A document with no name (e.g. an Aadhaar back with an unreadable number) stays with the document uploaded
//      next to it in the same folder.
// Which slot each person gets - first rule that applies:
//   1. A document you placed by hand fixes its person's slot (and is never moved).
//   2. A nominee name already typed/imported from Excel (name_n1, name_n2, ...).
//   3. A folder named like "Nominee 2", "N2" or "2".
//   4. Upload order, into the free slots.
import { isSamePersonName } from "@prefill/shared";
import { getCase, updateCaseDocument } from "../storage/case-store-service.js";
import { getIdentityRecord } from "./identity-number-memory-service.js";

const MAXIMUM_NOMINEE_NUMBER = 3;
const runningGroupingByCaseId = new Map(); // caseId -> promise of the run in progress

export function readPersonClues(caseDocument, uploadIndex) {
  const identityRecord = getIdentityRecord(caseDocument.id);
  return {
    caseDocument, uploadIndex,
    personName: caseDocument.foundName || caseDocument.holderName || identityRecord?.name || null,
    dateOfBirth: caseDocument.foundDob || caseDocument.holderDob || identityRecord?.dob || null,
    aadhaarLast4: caseDocument.foundLast4 || null,
    folderName: caseDocument.folderName || null,
  };
}

/** Folder names that say which nominee they hold: "Nominee 2", "nominee_3", "N2", "2". */
export function readNomineeNumberFromFolder(folderName) {
  const folderMatch = /^(?:nominee|nom|n)?[\s_-]*([1-9])$/i.exec(String(folderName || "").trim());
  const nomineeNumber = folderMatch ? Number(folderMatch[1]) : null;
  return nomineeNumber && nomineeNumber <= MAXIMUM_NOMINEE_NUMBER ? nomineeNumber : null;
}

/** Union-find over documents; a "soft" link is refused when it would put two different names in one group. */
export function buildPersonGroups(documentClues) {
  const parentIndexes = documentClues.map((_unused, index) => index);
  const findRoot = (index) => (parentIndexes[index] === index ? index : (parentIndexes[index] = findRoot(parentIndexes[index])));
  const groupNames = (rootIndex) => documentClues.filter((_clues, index) => findRoot(index) === rootIndex).map((clues) => clues.personName).filter(Boolean);
  const namesConflict = (firstRoot, secondRoot) => groupNames(firstRoot).some((firstName) => groupNames(secondRoot).some((secondName) => !isSamePersonName(firstName, secondName)));
  const link = (firstIndex, secondIndex, isSoftLink) => {
    const firstRoot = findRoot(firstIndex);
    const secondRoot = findRoot(secondIndex);
    if (firstRoot === secondRoot || (isSoftLink && namesConflict(firstRoot, secondRoot))) return;
    parentIndexes[Math.max(firstRoot, secondRoot)] = Math.min(firstRoot, secondRoot);
  };
  documentClues.forEach((firstClues, firstIndex) => documentClues.slice(0, firstIndex).forEach((secondClues, secondIndex) => {
    if (firstClues.aadhaarLast4 && firstClues.aadhaarLast4 === secondClues.aadhaarLast4) link(firstIndex, secondIndex, false);
    else if (firstClues.personName && secondClues.personName && isSamePersonName(firstClues.personName, secondClues.personName)) link(firstIndex, secondIndex, false);
  }));
  documentClues.forEach((firstClues, firstIndex) => documentClues.slice(0, firstIndex).forEach((secondClues, secondIndex) => {
    if (firstClues.dateOfBirth && firstClues.dateOfBirth === secondClues.dateOfBirth) link(firstIndex, secondIndex, true);
  }));
  // A folder says "one person" when it is named for a nominee, or when files came in several folders.
  const hasSeveralFolders = new Set(documentClues.map((clues) => clues.folderName).filter(Boolean)).size > 1;
  documentClues.forEach((firstClues, firstIndex) => documentClues.slice(0, firstIndex).forEach((secondClues, secondIndex) => {
    const isSameFolder = firstClues.folderName && firstClues.folderName === secondClues.folderName;
    if (isSameFolder && (hasSeveralFolders || readNomineeNumberFromFolder(firstClues.folderName))) link(firstIndex, secondIndex, true);
  }));
  // Still alone and nameless: join the document uploaded just before it, from the same folder.
  documentClues.forEach((clues, index) => {
    const isAlone = documentClues.every((_other, otherIndex) => otherIndex === index || findRoot(otherIndex) !== findRoot(index));
    if (!isAlone || clues.personName) return;
    const sameFolderIndexes = [...documentClues.keys()].filter((candidateIndex) => candidateIndex !== index && documentClues[candidateIndex].folderName === clues.folderName);
    const nearestIndex = sameFolderIndexes.sort((first, second) => Math.abs(first - index) - Math.abs(second - index) || first - second)[0];
    if (nearestIndex != null) link(index, nearestIndex, true);
  });
  const groupsByRoot = new Map();
  documentClues.forEach((clues, index) => {
    const rootIndex = findRoot(index);
    if (!groupsByRoot.has(rootIndex)) groupsByRoot.set(rootIndex, []);
    groupsByRoot.get(rootIndex).push(clues);
  });
  return [...groupsByRoot.values()]; // in upload order of each group's first document
}

/** Slot for every group, with the reason shown on the card. */
export function chooseNomineeSlots(personGroups, typedValues) {
  const slotByGroup = new Map();
  const takenSlots = new Set();
  const give = (personGroup, nomineeNumber, reason) => {
    if (slotByGroup.has(personGroup) || takenSlots.has(nomineeNumber)) return;
    slotByGroup.set(personGroup, { nomineeNumber, reason });
    takenSlots.add(nomineeNumber);
  };
  for (const personGroup of personGroups) {
    const manualDocument = personGroup.find((clues) => clues.caseDocument.assignedManually);
    if (manualDocument) give(personGroup, manualDocument.caseDocument.assignedNominee, "same person as a document you placed");
  }
  for (let nomineeNumber = 1; nomineeNumber <= MAXIMUM_NOMINEE_NUMBER; nomineeNumber += 1) {
    const typedName = typedValues?.[`name_n${nomineeNumber}`];
    const matchingGroup = typedName && personGroups.find((personGroup) => !slotByGroup.has(personGroup)
      && personGroup.some((clues) => clues.personName && isSamePersonName(clues.personName, typedName)));
    if (matchingGroup) give(matchingGroup, nomineeNumber, `name matches Nominee ${nomineeNumber} in the Excel`);
  }
  for (const personGroup of personGroups) {
    const folderNominee = personGroup.map((clues) => readNomineeNumberFromFolder(clues.folderName)).find(Boolean);
    if (folderNominee) give(personGroup, folderNominee, `from folder "${personGroup.find((clues) => clues.folderName)?.folderName}"`);
  }
  for (const personGroup of personGroups) {
    if (slotByGroup.has(personGroup)) continue;
    const freeSlot = Array.from({ length: MAXIMUM_NOMINEE_NUMBER }, (_unused, index) => index + 1).find((nomineeNumber) => !takenSlots.has(nomineeNumber));
    if (freeSlot) give(personGroup, freeSlot, slotByGroup.size ? "new person - next free nominee" : "first person");
    else slotByGroup.set(personGroup, { nomineeNumber: MAXIMUM_NOMINEE_NUMBER, reason: `more than ${MAXIMUM_NOMINEE_NUMBER} people - check` });
  }
  return slotByGroup;
}

async function regroup(caseId) {
  const caseEntry = await getCase(caseId);
  if (!caseEntry || caseEntry.confirmedAt) return;
  const documentClues = caseEntry.documents.filter((caseDocument) => caseDocument.status === "done").map(readPersonClues);
  const personGroups = buildPersonGroups(documentClues);
  const slotByGroup = chooseNomineeSlots(personGroups, caseEntry.typedValues);
  for (const personGroup of personGroups) {
    const { nomineeNumber, reason } = slotByGroup.get(personGroup);
    for (const { caseDocument } of personGroup) {
      if (caseDocument.assignedManually) continue;
      if (caseDocument.assignedNominee !== nomineeNumber || caseDocument.assignedBy !== reason) {
        await updateCaseDocument(caseId, caseDocument.id, { assignedNominee: nomineeNumber, assignedBy: reason });
      }
    }
  }
}

/** Regroups the case; calls for one case run one after another. */
export function groupCaseDocuments(caseId) {
  const previousRun = runningGroupingByCaseId.get(caseId) || Promise.resolve();
  const nextRun = previousRun.catch(() => {}).then(() => regroup(caseId));
  runningGroupingByCaseId.set(caseId, nextRun);
  nextRun.finally(() => { if (runningGroupingByCaseId.get(caseId) === nextRun) runningGroupingByCaseId.delete(caseId); }).catch(() => {});
  return nextRun;
}
