import { describe, it, expect } from 'vitest';
import { DocumentParser } from '../../modules/ai/rag/ingestion/document-parser.js';

describe('Prompt 5 — Document Parser Quality & Verification Unit Tests', () => {
  const parser = new DocumentParser();

  it('should successfully parse plain text, markdown, and CSV', async () => {
    const resTxt = await parser.parse({
      id: 'doc-txt',
      content: 'Aether architecture overview: modular backend service.',
      mimeType: 'text/plain',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });
    expect(resTxt.ok).toBe(true);
    if (resTxt.ok) {
      expect(resTxt.value.text).toContain('Aether architecture');
    }

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
    const jsonContent = JSON.stringify({
      projectName: 'Aether Engine',
      modules: ['Memory', 'RAG', 'Knowledge'],
    });

    const res = await parser.parse({
      id: 'doc-json',
      content: jsonContent,
      mimeType: 'application/json',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('projectName: Aether Engine');
    }
  });

  it('should parse HTML content by stripping tags and extracting plain text', async () => {
    const htmlContent = '<html><body><h1>Title</h1><p>Aether system notes.</p></body></html>';
    const res = await parser.parse({
      id: 'doc-html',
      content: htmlContent,
      mimeType: 'text/html',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
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
      id: 'doc-pdf',
      content: Buffer.from(pdfStream),
      mimeType: 'application/pdf',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Aether PDF Test Document Content');
    }
  });

  it('should parse DOCX format XML text tags', async () => {
    const docxXml = '<w:p><w:r><w:t>Aether Word Document Text Content</w:t></w:r></w:p>';
    const res = await parser.parse({
      id: 'doc-docx',
      content: Buffer.from(docxXml),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Aether Word Document Text Content');
    }
  });

  it('should parse XLSX spreadsheet cell text', async () => {
    const xlsxXml = '<sheetData><row><c><v>Aether Spreadsheet Cell Data</v></c></row></sheetData>';
    const res = await parser.parse({
      id: 'doc-xlsx',
      content: Buffer.from(xlsxXml),
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.value.text).toContain('Aether Spreadsheet Cell Data');
    }
  });

  it('should return a clear failure result for unsupported document formats', async () => {
    const res = await parser.parse({
      id: 'doc-binary',
      content: Buffer.from([0x00, 0x01, 0x02, 0x03]),
      mimeType: 'application/x-executable',
      metadata: { source: 'unit_test' },
      loadedAt: Date.now(),
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.message).toContain('Unsupported document format');
    }
  });
});
