// A minimal ZIP writer (no compression - "stored"), enough to hand over a folder of PDFs in one download without
// another dependency. PDFs are already compressed, so storing them loses almost nothing.

const CRC_TABLE = Array.from({ length: 256 }, (_unused, tableIndex) => {
  let crcValue = tableIndex;
  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) crcValue = crcValue & 1 ? 0xedb88320 ^ (crcValue >>> 1) : crcValue >>> 1;
  return crcValue >>> 0;
});

function computeCrc32(bytes) {
  let crcValue = 0xffffffff;
  for (const byte of bytes) crcValue = CRC_TABLE[(crcValue ^ byte) & 0xff] ^ (crcValue >>> 8);
  return (crcValue ^ 0xffffffff) >>> 0;
}

/** DOS date/time fields for "now". */
function getDosDateTime() {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  return { dosTime, dosDate };
}

/** files: [{name, bytes: Buffer}] -> one Buffer holding the .zip. Names are made unique and kept UTF-8. */
export function buildZipFile(files) {
  const { dosTime, dosDate } = getDosDateTime();
  const usedNames = new Set();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const { name, bytes } of files) {
    let uniqueName = name;
    for (let copyNumber = 2; usedNames.has(uniqueName.toLowerCase()); copyNumber += 1) uniqueName = name.replace(/(\.[^.]+)?$/, ` (${copyNumber})$1`);
    usedNames.add(uniqueName.toLowerCase());
    const nameBytes = Buffer.from(uniqueName, "utf8");
    const crcValue = computeCrc32(bytes);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 names
    localHeader.writeUInt16LE(0, 8); // stored
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(crcValue, 14);
    localHeader.writeUInt32LE(bytes.length, 18);
    localHeader.writeUInt32LE(bytes.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localParts.push(localHeader, nameBytes, bytes);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(crcValue, 16);
    centralHeader.writeUInt32LE(bytes.length, 20);
    centralHeader.writeUInt32LE(bytes.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + bytes.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}
