// A minimal ZIP writer: files stored as they are (WAVs don't compress), for
// handing several exports over as one download.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(parts) {
  let crc = 0xffffffff;
  for (const bytes of parts) for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// MS-DOS time and date fields.
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// files: [{ name, parts: [Uint8Array, ...] }] -> Blob
export function zipBlob(files, now = new Date()) {
  const { time, date } = dosTime(now);
  const out = [];
  const central = [];
  let offset = 0;
  for (const { name, parts } of files) {
    const nameBytes = new TextEncoder().encode(name);
    const size = parts.reduce((n, p) => n + p.length, 0);
    const crc = crc32(parts);
    // Bit 11: the name is UTF-8.
    const common = (v, at) => {
      v.setUint16(at, 20, true); // version needed
      v.setUint16(at + 2, 0x0800, true);
      v.setUint16(at + 4, 0, true); // stored
      v.setUint16(at + 6, time, true);
      v.setUint16(at + 8, date, true);
      v.setUint32(at + 10, crc, true);
      v.setUint32(at + 14, size, true);
      v.setUint32(at + 18, size, true);
      v.setUint16(at + 22, nameBytes.length, true);
    };
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    common(local, 4);
    out.push(new Uint8Array(local.buffer), nameBytes, ...parts);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true); // version made by
    common(entry, 6);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + size;
  }
  const centralSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...out, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}
