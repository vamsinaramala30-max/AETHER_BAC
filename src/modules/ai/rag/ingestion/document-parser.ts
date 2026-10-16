/**
 * AETHER AI - Document Parser
 * Production document text extractor.
 * Supports: TXT, Markdown, CSV, JSON, HTML, PDF, DOCX, XLSX, PPTX.
 *
 * OOXML formats (DOCX, XLSX, PPTX) are ZIP archives containing
 * DEFLATE-compressed XML entries. This parser correctly reads the
 * ZIP local-file structure, decompresses the relevant XML entries
 * using Node built-in zlib, and extracts text nodes.
 */

import zlib from 'zlib';
import type { Result } from '../../ai-types.js';
import { ok, fail } from '../../ai-types.js';
import { RAGFailedError } from '../../ai-errors.js';
import type { RawDocument, ParsedDocument } from '../rag-types.js';

export interface IDocumentParser {
  parse(document: RawDocument): Promise<Result<ParsedDocument>>;
  supports(mimeType: string): boolean;
}

// --- OOXML / ZIP Extraction Utilities ---

const ZIP_LOCAL_SIGNATURE = 0x04034b50;
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const MAX_DECOMPRESSED_SIZE = 50 * 1024 * 1024;

export interface ZipEntry {
  filename: string;
  compressedSize: number;
  uncompressedSize: number;
  compressionMethod: number;
  dataOffset: number;
}

export function parseZipEntries(buf: Buffer): ZipEntry[] {
  // Strategy 1: Central Directory inspection (standard ZIP specification)
  if (buf.length >= 22) {
    // Search for End of Central Directory Record (EOCD) from the end of buffer
    const maxSearch = Math.min(buf.length, 65536 + 22);
    const searchStart = buf.length - 22;
    const searchEnd = buf.length - maxSearch;
    let eocdOffset = -1;
    for (let p = searchStart; p >= searchEnd; p--) {
      if (buf.readUInt32LE(p) === ZIP_EOCD_SIGNATURE) {
        eocdOffset = p;
        break;
      }
    }

    if (eocdOffset !== -1) {
      const totalEntries = buf.readUInt16LE(eocdOffset + 10);
      const cdOffset = buf.readUInt32LE(eocdOffset + 16);

      if (cdOffset >= 0 && cdOffset < buf.length) {
        const cdEntries: ZipEntry[] = [];
        let p = cdOffset;
        let count = 0;

        while (p + 46 <= buf.length && count < totalEntries) {
          const sig = buf.readUInt32LE(p);
          if (sig !== ZIP_CENTRAL_SIGNATURE) break;

          const compressionMethod = buf.readUInt16LE(p + 10);
          const compressedSize = buf.readUInt32LE(p + 20);
          const uncompressedSize = buf.readUInt32LE(p + 24);
          const filenameLen = buf.readUInt16LE(p + 28);
          const extraLen = buf.readUInt16LE(p + 30);
          const commentLen = buf.readUInt16LE(p + 32);
          const localHeaderOffset = buf.readUInt32LE(p + 42);

          if (p + 46 + filenameLen > buf.length) break;
          const filename = buf.slice(p + 46, p + 46 + filenameLen).toString('utf-8');

          if (
            !filename.includes('..') &&
            !filename.startsWith('/') &&
            !filename.startsWith('\\') &&
            localHeaderOffset + 30 <= buf.length &&
            buf.readUInt32LE(localHeaderOffset) === ZIP_LOCAL_SIGNATURE
          ) {
            const localFnLen = buf.readUInt16LE(localHeaderOffset + 26);
            const localExtLen = buf.readUInt16LE(localHeaderOffset + 28);
            const dataOffset = localHeaderOffset + 30 + localFnLen + localExtLen;

            if (dataOffset >= 0 && dataOffset + compressedSize <= buf.length) {
              cdEntries.push({
                filename,
                compressionMethod,
                compressedSize,
                uncompressedSize,
                dataOffset,
              });
            }
          }

          p += 46 + filenameLen + extraLen + commentLen;
          count++;
        }

        if (cdEntries.length > 0) {
          return cdEntries;
        }
      }
    }
  }

  // Strategy 2: Fallback to sequential Local File Header scanning
  const entries: ZipEntry[] = [];
  let pos = 0;
  while (pos + 30 <= buf.length) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== ZIP_LOCAL_SIGNATURE) { pos++; continue; }
    if (pos + 30 > buf.length) break;
    const compressionMethod = buf.readUInt16LE(pos + 8);
    const compressedSize = buf.readUInt32LE(pos + 18);
    const uncompressedSize = buf.readUInt32LE(pos + 22);
    const filenameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    if (pos + 30 + filenameLen > buf.length) break;
    const filenameRaw = buf.slice(pos + 30, pos + 30 + filenameLen);
    const filename = filenameRaw.toString('utf-8');
    if (filename.includes('..') || filename.startsWith('/') || filename.startsWith('\\')) {
      pos = pos + 30 + filenameLen + extraLen + compressedSize;
      continue;
    }
    const dataOffset = pos + 30 + filenameLen + extraLen;
    if (dataOffset < 0 || dataOffset > buf.length) break;
    if (compressedSize > 0 && dataOffset + compressedSize > buf.length) {
      pos = pos + 30 + filenameLen + extraLen;
      continue;
    }
    entries.push({ filename, compressionMethod, compressedSize, uncompressedSize, dataOffset });
    pos = dataOffset + (compressedSize > 0 ? compressedSize : 0);
  }
  return entries;
}

function isZipBuffer(buf: Buffer): boolean {
  return buf.length >= 4 && buf.readUInt32LE(0) === ZIP_LOCAL_SIGNATURE;
}

function decompressEntry(buf: Buffer, entry: ZipEntry): Buffer {
  const compressed = buf.slice(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  if (entry.compressionMethod === 0) {
    if (entry.uncompressedSize > MAX_DECOMPRESSED_SIZE) {
      throw new Error('ZIP entry "' + entry.filename + '" exceeds maximum size limit');
    }
    return compressed;
  }
  if (entry.compressionMethod === 8) {
    return zlib.inflateRawSync(compressed, { maxOutputLength: MAX_DECOMPRESSED_SIZE });
  }
  throw new Error('Unsupported ZIP compression method ' + entry.compressionMethod + ' for entry "' + entry.filename + '"');
}

function extractZipEntry(buf: Buffer, targetPath: string): Buffer | null {
  const entries = parseZipEntries(buf);
  const entry = entries.find((e) => e.filename === targetPath || e.filename.endsWith('/' + targetPath));
  if (!entry) return null;
  return decompressEntry(buf, entry);
}

function extractZipEntriesMatching(buf: Buffer, prefix: string): Array<{ name: string; data: Buffer }> {
  const entries = parseZipEntries(buf);
  const results: Array<{ name: string; data: Buffer }> = [];
  for (const entry of entries) {
    if (entry.filename.startsWith(prefix) && entry.compressedSize > 0) {
      try { results.push({ name: entry.filename, data: decompressEntry(buf, entry) }); } catch { /* skip */ }
    }
  }
  return results;
}

function decodeXmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num: string) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

// --- Text / Markdown / CSV Parser ---

class TextBasedParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    const m = (mimeType || '').toLowerCase();
    return (
      m === 'text/plain' || m === 'text/markdown' || m === 'text/x-markdown' ||
      m === 'text/csv' || m === 'text/tab-separated-values' || m === 'text/tsv' ||
      m === 'text/css' || m === 'text/xml' || m === 'application/xml' ||
      m === 'application/x-yaml' || m === 'text/yaml' || m === 'text/x-yaml' ||
      m === 'application/javascript' || m === 'text/javascript' ||
      m === 'application/typescript' || m === 'text/typescript' ||
      m === 'application/sql' || m === 'text/x-sql' || m === 'application/toml' ||
      m.startsWith('text/')
    );
  }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const text = typeof document.content === 'string' ? document.content : document.content.toString('utf-8');
      if (!text || text.trim().length === 0) {
        return fail(new RAGFailedError('parse', 'Document "' + document.id + '" produced empty text'));
      }
      return ok({ id: document.id, text: text.trim(), metadata: document.metadata, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', error instanceof Error ? error.message : String(error)));
    }
  }
}

// --- JSON Parser ---

class JSONParser implements IDocumentParser {
  public supports(mimeType: string): boolean { return mimeType === 'application/json'; }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawText = typeof document.content === 'string' ? document.content : document.content.toString('utf-8');
      const parsed: unknown = JSON.parse(rawText);
      const text = this.flattenToText(parsed).trim();
      if (!text || text.length === 0) {
        return fail(new RAGFailedError('parse', 'JSON document "' + document.id + '" produced no extractable text'));
      }
      return ok({ id: document.id, text, metadata: document.metadata, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', 'JSON parsing failed: ' + (error instanceof Error ? error.message : String(error))));
    }
  }
  private flattenToText(value: unknown, depth = 0): string {
    if (depth > 10 || value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return value.map((v) => this.flattenToText(v, depth + 1)).join('\n');
    if (typeof value === 'object') {
      return Object.entries(value as Record<string, unknown>)
        .map(([k, v]) => k + ': ' + this.flattenToText(v, depth + 1)).join('\n');
    }
    return '';
  }
}

// --- HTML Parser ---

class HTMLParser implements IDocumentParser {
  public supports(mimeType: string): boolean { return mimeType === 'text/html'; }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawText = typeof document.content === 'string' ? document.content : document.content.toString('utf-8');
      const text = rawText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/\s{2,}/g, ' ').trim();
      if (!text || text.length === 0) {
        return fail(new RAGFailedError('parse', 'HTML document "' + document.id + '" produced no text'));
      }
      return ok({ id: document.id, text, metadata: document.metadata, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', error instanceof Error ? error.message : String(error)));
    }
  }
}

// --- PDF Parser ---

class PDFParser implements IDocumentParser {
  public supports(mimeType: string): boolean { return mimeType === 'application/pdf'; }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const rawBuffer = Buffer.isBuffer(document.content) ? document.content : Buffer.from(document.content);
      const rawString = rawBuffer.toString('binary');
      const textBlocks: string[] = [];
      const btEtRegex = /BT[\s\S]*?ET/g;
      let match: RegExpExecArray | null;
      while ((match = btEtRegex.exec(rawString)) !== null) {
        const block = match[0];
        const strRegex = /\(([^)]*)\)|<([0-9a-fA-F]+)>/g;
        let strMatch: RegExpExecArray | null;
        while ((strMatch = strRegex.exec(block)) !== null) {
          if (strMatch[1]) { textBlocks.push(strMatch[1]); }
          else if (strMatch[2]) {
            const hex = strMatch[2]; let str = '';
            for (let i = 0; i < hex.length; i += 2) { str += String.fromCharCode(parseInt(hex.substr(i, 2), 16)); }
            textBlocks.push(str);
          }
        }
      }
      const text = textBlocks.join(' ').replace(/\\([()\\])/g, '$1').replace(/\s{2,}/g, ' ').trim();
      if (!text || text.length === 0) {
        return fail(new RAGFailedError('parse', 'PDF document "' + document.id + '" contains no extractable text'));
      }
      return ok({ id: document.id, text, metadata: { ...document.metadata, format: 'PDF' }, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', 'PDF text extraction failed: ' + (error instanceof Error ? error.message : String(error))));
    }
  }
}

// --- DOCX Parser ---
// DOCX = ZIP archive. Text in word/document.xml inside <w:t> tags per <w:p> paragraph.

class DOCXParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    );
  }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const buf = Buffer.isBuffer(document.content)
        ? document.content : Buffer.from(document.content as string, 'binary');
      if (!isZipBuffer(buf)) {
        return fail(new RAGFailedError('parse',
          'DOCX document "' + document.id + '" is not a valid OOXML/ZIP archive (missing PK signature). ' +
          'The file may be corrupt or is an older binary .doc format.'));
      }
      let xmlBuf: Buffer | null = null;
      try { xmlBuf = extractZipEntry(buf, 'word/document.xml'); }
      catch (zipErr) {
        return fail(new RAGFailedError('parse',
          'DOCX document "' + document.id + '" ZIP extraction failed: ' +
          (zipErr instanceof Error ? zipErr.message : String(zipErr))));
      }
      if (!xmlBuf) {
        return fail(new RAGFailedError('parse',
          'DOCX document "' + document.id + '" does not contain word/document.xml. ' +
          'The file may be corrupt or not a valid DOCX file.'));
      }
      const xmlStr = xmlBuf.toString('utf-8');
      const paragraphs: string[] = [];
      const paraRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;
      let paraMatch: RegExpExecArray | null;
      while ((paraMatch = paraRegex.exec(xmlStr)) !== null) {
        const paraXml = paraMatch[0];
        const textParts: string[] = [];
        const wtRegex = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
        let wtMatch: RegExpExecArray | null;
        while ((wtMatch = wtRegex.exec(paraXml)) !== null) {
          if (wtMatch[1]) textParts.push(decodeXmlEntities(wtMatch[1]));
        }
        const paraText = textParts.join('').trim();
        if (paraText.length > 0) paragraphs.push(paraText);
      }
      if (paragraphs.length === 0) {
        const flatMatches: string[] = [];
        const flatRegex = /<w:t(?:[^>]*)>([\s\S]*?)<\/w:t>/g;
        let flatMatch: RegExpExecArray | null;
        while ((flatMatch = flatRegex.exec(xmlStr)) !== null) {
          if (flatMatch[1]) flatMatches.push(decodeXmlEntities(flatMatch[1]));
        }
        const flatText = flatMatches.join(' ').replace(/\s{2,}/g, ' ').trim();
        if (flatText.length > 0) {
          return ok({ id: document.id, text: flatText, metadata: { ...document.metadata, format: 'DOCX' }, parsedAt: Date.now() });
        }
        return fail(new RAGFailedError('parse',
          'DOCX document "' + document.id + '" contains no extractable text. ' +
          'The document may be empty, image-only, or password-protected.'));
      }
      const text = paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      return ok({ id: document.id, text, metadata: { ...document.metadata, format: 'DOCX' }, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', 'DOCX text extraction failed: ' + (error instanceof Error ? error.message : String(error))));
    }
  }
}

// --- XLSX Parser ---
// XLSX = ZIP archive. Shared strings in xl/sharedStrings.xml. Cell data in xl/worksheets/sheet*.xml.

class XLSXParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel'
    );
  }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const buf = Buffer.isBuffer(document.content)
        ? document.content : Buffer.from(document.content as string, 'binary');
      if (!isZipBuffer(buf)) {
        return fail(new RAGFailedError('parse',
          'XLSX document "' + document.id + '" is not a valid OOXML/ZIP archive (missing PK signature). ' +
          'The file may be corrupt or is an older binary .xls format not supported for preview.'));
      }
      const sharedStrings: string[] = [];
      try {
        const ssBuf = extractZipEntry(buf, 'xl/sharedStrings.xml');
        if (ssBuf) {
          const ssXml = ssBuf.toString('utf-8');
          const siRegex = /<si>([\s\S]*?)<\/si>/g;
          let siMatch: RegExpExecArray | null;
          while ((siMatch = siRegex.exec(ssXml)) !== null) {
            const siContent = siMatch[1];
            const tParts: string[] = [];
            const tRegex = /<t(?:[^>]*)>([\s\S]*?)<\/t>/g;
            let tMatch: RegExpExecArray | null;
            while ((tMatch = tRegex.exec(siContent)) !== null) {
              if (tMatch[1]) tParts.push(decodeXmlEntities(tMatch[1]));
            }
            sharedStrings.push(tParts.join(''));
          }
        }
      } catch { /* non-fatal */ }
      const worksheetEntries = extractZipEntriesMatching(buf, 'xl/worksheets/sheet');
      if (worksheetEntries.length === 0) {
        return fail(new RAGFailedError('parse',
          'XLSX document "' + document.id + '" contains no worksheet data. The file may be empty or corrupt.'));
      }
      const sheetTexts: string[] = [];
      for (let si = 0; si < worksheetEntries.length; si++) {
        const wsXml = worksheetEntries[si].data.toString('utf-8');
        const sheetName = 'Sheet ' + (si + 1);
        const rowLines: string[] = [];
        const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
        let rowMatch: RegExpExecArray | null;
        while ((rowMatch = rowRegex.exec(wsXml)) !== null) {
          const rowContent = rowMatch[1];
          const cellValues: string[] = [];
          const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
          let cellMatch: RegExpExecArray | null;
          while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
            const cellAttrs = cellMatch[1];
            const cellContent = cellMatch[2];
            const typeMatch = /\bt="([^"]+)"/.exec(cellAttrs);
            const cellType = typeMatch ? typeMatch[1] : '';
            const vMatch = /<v[^>]*>([\s\S]*?)<\/v>/.exec(cellContent);
            const isMatch = /<is>[\s\S]*?<t[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/.exec(cellContent);
            let cellText = '';
            if (isMatch) { cellText = decodeXmlEntities(isMatch[1]); }
            else if (vMatch) {
              const rawVal = vMatch[1].trim();
              if (cellType === 's') {
                const idx = parseInt(rawVal, 10);
                cellText = (!isNaN(idx) && idx >= 0 && idx < sharedStrings.length) ? sharedStrings[idx] : rawVal;
              } else { cellText = rawVal; }
            }
            if (cellText.trim().length > 0) cellValues.push(cellText.trim());
          }
          if (cellValues.length > 0) rowLines.push(cellValues.join('\t'));
        }
        if (rowLines.length > 0) sheetTexts.push('=== ' + sheetName + ' ===\n' + rowLines.join('\n'));
      }
      if (sheetTexts.length === 0) {
        return fail(new RAGFailedError('parse',
          'XLSX document "' + document.id + '" contains no extractable cell data. ' +
          'The spreadsheet may be empty or contain only formatting.'));
      }
      const text = sheetTexts.join('\n\n').trim();
      return ok({ id: document.id, text, metadata: { ...document.metadata, format: 'XLSX' }, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', 'XLSX text extraction failed: ' + (error instanceof Error ? error.message : String(error))));
    }
  }
}

// --- PPTX Parser ---
// PPTX = ZIP archive. Slides in ppt/slides/slide*.xml. Text in <a:t> nodes per <a:p> paragraph.

class PPTXParser implements IDocumentParser {
  public supports(mimeType: string): boolean {
    return (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeType === 'application/vnd.ms-powerpoint'
    );
  }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    try {
      const buf = Buffer.isBuffer(document.content)
        ? document.content : Buffer.from(document.content as string, 'binary');
      if (!isZipBuffer(buf)) {
        return fail(new RAGFailedError('parse',
          'PPTX document "' + document.id + '" is not a valid OOXML/ZIP archive (missing PK signature). ' +
          'The file may be corrupt or is an older binary .ppt format not supported for preview.'));
      }
      const slideEntries = extractZipEntriesMatching(buf, 'ppt/slides/slide');
      if (slideEntries.length === 0) {
        return fail(new RAGFailedError('parse',
          'PPTX document "' + document.id + '" contains no slides. The file may be empty or corrupt.'));
      }
      slideEntries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      const slideTexts: string[] = [];
      for (let si = 0; si < slideEntries.length; si++) {
        const slideXml = slideEntries[si].data.toString('utf-8');
        const slideNumber = si + 1;
        const paragraphs: string[] = [];
        const paraRegex = /<a:p>([\s\S]*?)<\/a:p>/g;
        let paraMatch: RegExpExecArray | null;
        while ((paraMatch = paraRegex.exec(slideXml)) !== null) {
          const paraContent = paraMatch[1];
          const textParts: string[] = [];
          const atRegex = /<a:t(?:[^>]*)>([\s\S]*?)<\/a:t>/g;
          let atMatch: RegExpExecArray | null;
          while ((atMatch = atRegex.exec(paraContent)) !== null) {
            if (atMatch[1]) textParts.push(decodeXmlEntities(atMatch[1]));
          }
          const paraText = textParts.join('').trim();
          if (paraText.length > 0) paragraphs.push(paraText);
        }
        if (paragraphs.length > 0) slideTexts.push('--- Slide ' + slideNumber + ' ---\n' + paragraphs.join('\n'));
      }
      if (slideTexts.length === 0) {
        return fail(new RAGFailedError('parse',
          'PPTX document "' + document.id + '" contains no extractable slide text. ' +
          'The presentation may contain only images or be empty.'));
      }
      const text = slideTexts.join('\n\n').trim();
      return ok({ id: document.id, text, metadata: { ...document.metadata, format: 'PPTX' }, parsedAt: Date.now() });
    } catch (error) {
      return fail(new RAGFailedError('parse', 'PPTX text extraction failed: ' + (error instanceof Error ? error.message : String(error))));
    }
  }
}

// --- Composite Document Parser ---

export class DocumentParser implements IDocumentParser {
  private readonly parsers: IDocumentParser[];
  constructor() {
    this.parsers = [
      new TextBasedParser(), new JSONParser(), new HTMLParser(),
      new PDFParser(), new DOCXParser(), new XLSXParser(), new PPTXParser(),
    ];
  }
  public supports(mimeType: string): boolean {
    return this.parsers.some((p) => p.supports(mimeType));
  }
  public async parse(document: RawDocument): Promise<Result<ParsedDocument>> {
    const parser = this.parsers.find((p) => p.supports(document.mimeType));
    if (!parser) {
      return fail(new RAGFailedError('parse',
        'Unsupported document format: MIME type "' + document.mimeType + '". ' +
        'Supported types: text/plain, text/markdown, text/csv, text/html, application/json, application/pdf, ' +
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document, ' +
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, ' +
        'application/vnd.openxmlformats-officedocument.presentationml.presentation.'));
    }
    return parser.parse(document);
  }
}

export { DocumentParser as DocumentParserRegistry };
export const documentParser = new DocumentParser();