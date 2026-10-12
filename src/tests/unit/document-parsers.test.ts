import { describe, it, expect } from 'vitest';
import { DocumentParser } from '../../modules/ai/rag/ingestion/document-parser.js';
import zlib from 'zlib';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Minimal ZIP builder for test fixtures
// Creates a valid OOXML-style ZIP buffer with DEFLATE-compressed entries.
// This is intentionally lightweight and only used in test code.
// ---------------------------------------------------------------------------

function buildLocalFileHeader(
  filename: string,
  compressedData: Buffer,
  uncompressedSize: number,
  compressionMethod: number
): Buffer {
  const nameBytes = Buffer.from(filename, 'utf-8');
  const crc32 = 0; // Tests don't verify CRC
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);   // PK signature
  header.writeUInt16LE(20, 4);            // version needed
  header.writeUInt16LE(0, 6);             // flags
  header.writeUInt16LE(compressionMethod, 8); // compression
  header.writeUInt16LE(0, 10);            // mod time
  header.writeUInt16LE(0, 12);            // mod date
  header.writeUInt32LE(crc32, 14);        // CRC-32
  header.writeUInt32LE(compressedData.length, 18); // compressed size
  header.writeUInt32LE(uncompressedSize, 22);       // uncompressed size
  header.writeUInt16LE(nameBytes.length, 26);       // filename length
  header.writeUInt16LE(0, 28);            // extra field length
  return Buffer.concat([header, nameBytes, compressedData]);
}

function makeZipEntry(filename: string, content: string): Buffer {
  const raw = Buffer.from(content, 'utf-8');
  const compressed = zlib.deflateRawSync(raw);
  return buildLocalFileHeader(filename, compressed, raw.length, 8);
}

function makeStoredEntry(filename: string, content: string): Buffer {
  const raw = Buffer.from(content, 'utf-8');
  return buildLocalFileHeader(filename, raw, raw.length, 0);
}

/**
 * Build a minimal valid DOCX ZIP buffer with the given word/document.xml content.
 */
function makeDOCXBuffer(documentXmlContent: string): Buffer {
  const contentTypes = makeStoredEntry('[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>');
  const docXml = makeZipEntry('word/document.xml', documentXmlContent);
  // Append minimal end-of-central-directory (22 bytes) so it's a valid ZIP
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  return Buffer.concat([contentTypes, docXml, eocd]);
}

/**
 * Build a minimal valid XLSX ZIP buffer with given sharedStrings and worksheet content.
 */
function makeXLSXBuffer(sharedStringsXml: string | null, worksheet1Xml: string): Buffer {
  const parts: Buffer[] = [];
  if (sharedStringsXml) {
    parts.push(makeZipEntry('xl/sharedStrings.xml', sharedStringsXml));
  }
  parts.push(makeZipEntry('xl/worksheets/sheet1.xml', worksheet1Xml));
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  parts.push(eocd);
  return Buffer.concat(parts);
}

/**
 * Build a minimal valid PPTX ZIP buffer with a single slide.
 */
function makePPTXBuffer(slide1Xml: string): Buffer {
  const parts: Buffer[] = [];
  parts.push(makeZipEntry('ppt/slides/slide1.xml', slide1Xml));
  const eocd = Buffer.alloc(22, 0);
  eocd.writeUInt32LE(0x06054b50, 0);
  parts.push(eocd);
  return Buffer.concat(parts);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Document Parser — OOXML / Office Preview Fix Tests', () => {
  const parser = new DocumentParser();

  // Existing text format tests preserved unchanged
  it('should successfully parse plain text, markdown, and CSV', async () => {
    const resTxt = await parser.parse({
      id: 'doc-txt',
      content: 'Aether architecture overview: modular backend service.',
      mimeType: 'text/plain',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });
    expect(resTxt.ok).toBe(true);
    if (resTxt.ok) expect(resTxt.value.text).toContain('Aether architecture');

    const resMd = await parser.parse({
      id: 'doc-md',
      content: '# Heading\n- Item 1\n- Item 2',
      mimeType: 'text/markdown',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });
    expect(resMd.ok).toBe(true);

    const resCsv = await parser.parse({
      id: 'doc-csv',
      content: 'id,name,role\n1,Alice,Dev\n2,Bob,Lead',
      mimeType: 'text/csv',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });
    expect(resCsv.ok).toBe(true);
  });

  it('should parse JSON documents into extractable text', async () => {
    const jsonContent = JSON.stringify({ projectName: 'Aether Engine', modules: ['Memory', 'RAG', 'Knowledge'] });
    const res = await parser.parse({
      id: 'doc-json', content: jsonContent, mimeType: 'application/json',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.text).toContain('projectName: Aether Engine');
  });

  it('should parse HTML content by stripping tags and extracting plain text', async () => {
    const htmlContent = '<html><body><h1>Title</h1><p>Aether system notes.</p></body></html>';
    const res = await parser.parse({
      id: 'doc-html', content: htmlContent, mimeType: 'text/html',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Title');
      expect(res.value.text).toContain('Aether system notes.');
    }
  });

  it('should parse PDF format text streams', async () => {
    const pdfStream = 'BT /F1 12 Tf (Aether PDF Test Document Content) Tj ET';
    const res = await parser.parse({
      id: 'doc-pdf', content: Buffer.from(pdfStream), mimeType: 'application/pdf',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.text).toContain('Aether PDF Test Document Content');
  });

  // DOCX tests — real ZIP-based OOXML fixtures
  it('DOCX: should extract text from valid DEFLATE-compressed ZIP/OOXML buffer', async () => {
    const docXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello from AETHER DOCX Extraction</w:t></w:r></w:p><w:p><w:r><w:t>Second paragraph content</w:t></w:r></w:p></w:body></w:document>';
    const buf = makeDOCXBuffer(docXml);
    const res = await parser.parse({
      id: 'doc-docx-zip', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Hello from AETHER DOCX Extraction');
      expect(res.value.text).toContain('Second paragraph content');
    }
  });

  it('DOCX: should preserve paragraph boundaries (newlines between paragraphs)', async () => {
    const docXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Line One</w:t></w:r></w:p><w:p><w:r><w:t>Line Two</w:t></w:r></w:p></w:body></w:document>';
    const buf = makeDOCXBuffer(docXml);
    const res = await parser.parse({
      id: 'doc-docx-para', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Line One');
      expect(res.value.text).toContain('Line Two');
      // paragraphs separated by newline
      expect(res.value.text).toMatch(/Line One[\r\n]+Line Two/);
    }
  });

  it('DOCX: should decode XML entities correctly', async () => {
    const docXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>R&amp;D &lt;Research&gt; &quot;Division&quot;</w:t></w:r></w:p></w:body></w:document>';
    const buf = makeDOCXBuffer(docXml);
    const res = await parser.parse({
      id: 'doc-docx-entities', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('R&D');
      expect(res.value.text).toContain('<Research>');
      expect(res.value.text).toContain('"Division"');
    }
  });

  it('DOCX: should return extraction error for non-ZIP buffer (not return 415-style unsupported)', async () => {
    const rawXml = '<w:p><w:r><w:t>This is raw XML, not a ZIP</w:t></w:r></w:p>';
    const res = await parser.parse({
      id: 'doc-docx-invalid', content: Buffer.from(rawXml),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    // Must fail with a corrupt/not-ZIP message, NOT with "Unsupported document format"
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).not.toContain('Unsupported document format');
      expect(res.error.message).toContain('not a valid OOXML/ZIP');
    }
  });

  it('DOCX: should return clear failure for empty document (no w:t nodes)', async () => {
    const docXml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/></w:body></w:document>';
    const buf = makeDOCXBuffer(docXml);
    const res = await parser.parse({
      id: 'doc-docx-empty', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('no extractable text');
    }
  });

  // XLSX tests — real ZIP-based OOXML fixtures
  it('XLSX: should extract cell text from worksheet with shared strings', async () => {
    const ssXml = '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>Alice</t></si><si><t>Bob</t></si></sst>';
    const wsXml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c t="s"><v>0</v></c></row><row><c t="s"><v>1</v></c></row><row><c t="s"><v>2</v></c></row></sheetData></worksheet>';
    const buf = makeXLSXBuffer(ssXml, wsXml);
    const res = await parser.parse({
      id: 'doc-xlsx-shared', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Name');
      expect(res.value.text).toContain('Alice');
      expect(res.value.text).toContain('Bob');
    }
  });

  it('XLSX: should extract inline numeric cell values without shared strings', async () => {
    const wsXml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c><v>42</v></c><c><v>3.14</v></c></row></sheetData></worksheet>';
    const buf = makeXLSXBuffer(null, wsXml);
    const res = await parser.parse({
      id: 'doc-xlsx-numeric', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('42');
      expect(res.value.text).toContain('3.14');
    }
  });

  it('XLSX: should label sheets in output', async () => {
    const wsXml = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row><c><v>100</v></c></row></sheetData></worksheet>';
    const buf = makeXLSXBuffer(null, wsXml);
    const res = await parser.parse({
      id: 'doc-xlsx-sheetlabel', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Sheet 1');
    }
  });

  it('XLSX: should fail for non-ZIP buffer with clear error (not Unsupported format)', async () => {
    const rawXml = '<sheetData><row><c><v>test</v></c></row></sheetData>';
    const res = await parser.parse({
      id: 'doc-xlsx-invalid', content: Buffer.from(rawXml),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).not.toContain('Unsupported document format');
      expect(res.error.message).toContain('not a valid OOXML/ZIP');
    }
  });

  // PPTX tests
  it('PPTX: should extract slide text from valid PPTX ZIP buffer', async () => {
    const slideXml = '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>AETHER PPTX Slide Content</a:t></a:r></a:p><a:p><a:r><a:t>Second bullet point</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    const buf = makePPTXBuffer(slideXml);
    const res = await parser.parse({
      id: 'doc-pptx', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('AETHER PPTX Slide Content');
      expect(res.value.text).toContain('Second bullet point');
      expect(res.value.text).toContain('Slide 1');
    }
  });

  it('PPTX: should label each slide separately', async () => {
    const slide1Xml = '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Slide One Title</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
    const buf = makePPTXBuffer(slide1Xml);
    const res = await parser.parse({
      id: 'doc-pptx-label', content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toMatch(/--- Slide 1 ---/);
      expect(res.value.text).toContain('Slide One Title');
    }
  });

  it('PPTX: should return clear failure for non-ZIP buffer', async () => {
    const rawXml = '<a:p><a:r><a:t>Not a ZIP</a:t></a:r></a:p>';
    const res = await parser.parse({
      id: 'doc-pptx-invalid', content: Buffer.from(rawXml),
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).not.toContain('Unsupported document format');
      expect(res.error.message).toContain('not a valid OOXML/ZIP');
    }
  });

  // Security tests
  it('Security: should reject ZIP entries with path traversal filenames', async () => {
    // Build a malicious ZIP with path traversal in filename
    // The parser should skip these entries, and if no valid entries found, return failure
    const maliciousFilename = '../../../etc/passwd';
    const nameBytes = Buffer.from(maliciousFilename, 'utf-8');
    const content = Buffer.from('malicious content');
    const compressed = zlib.deflateRawSync(content);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(content.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    const maliciousEntry = Buffer.concat([header, nameBytes, compressed]);
    const eocd = Buffer.alloc(22, 0);
    eocd.writeUInt32LE(0x06054b50, 0);
    const maliciousZip = Buffer.concat([maliciousEntry, eocd]);

    // Try to parse as DOCX - should fail (word/document.xml not found) but NOT throw/crash
    const res = await parser.parse({
      id: 'doc-traversal', content: maliciousZip,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(false);
    // Should fail cleanly, not expose filesystem paths
    if (!res.ok) {
      expect(res.error.message).not.toContain('etc/passwd');
    }
  });

  // Unsupported format test
  it('should return a clear failure result for genuinely unsupported document formats', async () => {
    const res = await parser.parse({
      id: 'doc-binary',
      content: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      mimeType: 'application/x-executable',
      metadata: { source: 'unit_test' }, loadedAt: Date.now(),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Unsupported document format');
    }
  });

  // Real failing files from root cause report
  it('Real File: should extract text from actual ReactJSPrograms.docx upload', async () => {
    const filePath = path.resolve('uploads/1790996011564_46985cf2bdd9962b.docx');
    if (!fs.existsSync(filePath)) {
      // Skip if file doesn't exist in local uploads directory
      return;
    }
    const buf = fs.readFileSync(filePath);
    const initialBufCopy = Buffer.from(buf);

    const res = await parser.parse({
      id: 'f723ba9b-e9fd-4210-9320-04741965e1da',
      content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { filename: 'ReactJSPrograms.docx' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text.length).toBeGreaterThan(500);
      expect(res.value.metadata?.format).toBe('DOCX');
    }

    // Binary preservation: buffer was not mutated
    expect(buf.equals(initialBufCopy)).toBe(true);
  });

  it('Real File: should extract text from actual ReactJSPrograms (1).docx upload', async () => {
    const filePath = path.resolve('uploads/1791022533507_926f1a07123d94f7.docx');
    if (!fs.existsSync(filePath)) {
      return;
    }
    const buf = fs.readFileSync(filePath);
    const initialBufCopy = Buffer.from(buf);

    const res = await parser.parse({
      id: 'cefae21a-01cb-4bdc-bb4a-727ece04f46e',
      content: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { filename: 'ReactJSPrograms (1).docx' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text.length).toBeGreaterThan(500);
      expect(res.value.metadata?.format).toBe('DOCX');
    }

    // Binary preservation
    expect(buf.equals(initialBufCopy)).toBe(true);
  });

  // Corrupt zip and deflate tests
  it('Corrupt Archive: handles corrupted DEFLATE stream without crashing', async () => {
    // Valid ZIP header but corrupted deflate payload for word/document.xml
    const nameBytes = Buffer.from('word/document.xml', 'utf-8');
    const corruptedPayload = Buffer.from([0x78, 0x9c, 0xff, 0xff, 0x00, 0x01]); // bad deflate
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8); // deflate
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(corruptedPayload.length, 18);
    header.writeUInt32LE(100, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    const corruptZip = Buffer.concat([header, nameBytes, corruptedPayload]);

    const res = await parser.parse({
      id: 'doc-corrupt-deflate',
      content: corruptZip,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('ZIP extraction failed');
    }
  });

  // supports() method tests
  it('should report correct supported MIME types', () => {
    expect(parser.supports('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true);
    expect(parser.supports('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    expect(parser.supports('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(true);
    expect(parser.supports('text/plain')).toBe(true);
    expect(parser.supports('application/pdf')).toBe(true);
    expect(parser.supports('application/json')).toBe(true);
    expect(parser.supports('application/x-executable')).toBe(false);
    expect(parser.supports('image/png')).toBe(false);
  });
});
