// Paste this into the Google Sheet: Extensions > Apps Script, replace everything, Save, then
// Deploy > New deployment > type "Web app" > Execute as: Me > Who has access: Anyone > Deploy.
// Copy the Web app URL into the prefill app (Settings), together with the SECRET below.
//
// One tab per form ("CRN Broking & Demat", "CAMS Mutual Fund"). Row 1 = column headings. Saving the same
// case again updates its row instead of adding a duplicate.

const SECRET = 'Demo986532';

// Don't press Run on doPost - it only runs when the prefill app sends a save. To check the setup from the
// editor, choose testSetup in the function dropdown and press Run instead.
function testSetup() {
  const res = doPost({ postData: { contents: JSON.stringify({
    secret: SECRET, tab: 'Setup test',
    headers: [{ key: 'case_id', label: 'Case ID' }, { key: 'note', label: 'Note' }],
    row: { case_id: 'test-' + new Date().getTime(), note: 'Setup works - you can delete this tab' },
  }) } });
  Logger.log(res.getContent());
}

function doPost(e) {
  if (!e || !e.postData) return out({ ok: false, error: 'No data - doPost runs when the app saves. To test, run testSetup instead.' });
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return out({ ok: false, error: 'wrong secret' });
  if (body.ping) return out({ ok: true, sheet: SpreadsheetApp.getActive().getName() });

  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(body.tab) || ss.insertSheet(body.tab);
  const headers = body.headers; // [{key, label}]

  // Header row: keep existing columns, add any new ones at the end (never reorder what's there).
  let existing = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  if (!existing.length || existing.every((v) => v === '')) existing = [];
  const labels = existing.slice();
  for (const h of headers) if (!labels.includes(h.label)) labels.push(h.label);
  sheet.getRange(1, 1, 1, labels.length).setValues([labels]).setFontWeight('bold');
  sheet.setFrozenRows(1);

  const byLabel = {};
  for (const h of headers) byLabel[h.label] = body.row[h.key] ?? '';
  const values = labels.map((l) => (l in byLabel ? String(byLabel[l]) : ''));

  // Update the row for this case if it exists (column "Case ID"), else append.
  const idCol = labels.indexOf('Case ID') + 1;
  let rowIndex = -1;
  if (idCol > 0 && sheet.getLastRow() > 1) {
    const ids = sheet.getRange(2, idCol, sheet.getLastRow() - 1, 1).getValues().map((r) => r[0]);
    const i = ids.indexOf(body.row.case_id);
    if (i !== -1) rowIndex = i + 2;
  }
  if (rowIndex === -1) rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, values.length).setNumberFormat('@').setValues([values]);
  return out({ ok: true, tab: body.tab, row: rowIndex });
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}