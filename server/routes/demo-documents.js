const express = require('express');

const router = express.Router();

function escapePdfText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function buildSimplePdfBuffer({ title, lines }) {
  const safeTitle = escapePdfText(title);
  const safeLines = (Array.isArray(lines) ? lines : []).map(escapePdfText);

  const chunks = [];
  let byteCount = 0;
  const offsets = [];

  const push = (str) => {
    chunks.push(str);
    byteCount += Buffer.byteLength(str, 'utf8');
  };

  const addObj = (num, body) => {
    offsets[num] = byteCount;
    push(`${num} 0 obj\n${body}\nendobj\n`);
  };

  push('%PDF-1.4\n');

  // Catalog
  addObj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  // Pages
  addObj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  // Page
  addObj(
    3,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>'
  );

  const contentLines = [
    `BT`,
    `/F1 20 Tf`,
    `72 740 Td`,
    `(${safeTitle}) Tj`,
    `/F1 12 Tf`,
    `0 -28 Td`,
    ...safeLines.flatMap((l) => [`(${l}) Tj`, `0 -16 Td`]),
    `ET`,
    '',
  ].join('\n');

  const contentStream = contentLines;
  const contentObjBody = `<< /Length ${Buffer.byteLength(contentStream, 'utf8')} >>\nstream\n${contentStream}endstream`;
  addObj(4, contentObjBody);

  // Font
  addObj(5, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const xrefStart = byteCount;
  const size = 6;

  const pad10 = (n) => String(n).padStart(10, '0');
  let xref = `xref\n0 ${size}\n`;
  xref += `0000000000 65535 f \n`;
  for (let i = 1; i < size; i += 1) {
    xref += `${pad10(offsets[i] ?? 0)} 00000 n \n`;
  }

  push(xref);
  push(`trailer\n<< /Size ${size} /Root 1 0 R >>\n`);
  push(`startxref\n${xrefStart}\n%%EOF\n`);

  return Buffer.from(chunks.join(''), 'utf8');
}

// Tiny 1x1 JPEG (white pixel)
const DEMO_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP/wAALCAABAAEBAREA/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AR//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AR//2Q==';

const DEMO_FILES = {
  'Demo_Document_1.pdf': {
    contentType: 'application/pdf',
    getBuffer: () =>
      buildSimplePdfBuffer({
        title: 'Demo Document 1',
        lines: [
          'This is a locally-generated PDF for demos/testing.',
          'It is not pulled from live data.',
        ],
      }),
  },
  'Demo_Document_2.pdf': {
    contentType: 'application/pdf',
    getBuffer: () =>
      buildSimplePdfBuffer({
        title: 'Demo Document 2',
        lines: [
          'Second demo PDF.',
          'Use it to validate document preview flows.',
        ],
      }),
  },
  'Demo_ID_Document.jpg': {
    contentType: 'image/jpeg',
    getBuffer: () => Buffer.from(DEMO_JPEG_BASE64, 'base64'),
  },
};

router.get('/:filename', (req, res) => {
  const filename = req.params.filename;
  const entry = DEMO_FILES[filename];

  if (!entry) {
    return res.status(404).json({ error: 'Demo document not found' });
  }

  const buffer = entry.getBuffer();
  res.setHeader('Content-Type', entry.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).send(buffer);
});

module.exports = router;
