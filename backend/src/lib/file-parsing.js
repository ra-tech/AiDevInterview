/**
 * Extracts plain text from an uploaded file so it can flow through the same
 * text-based pipeline as pasted content (JD extraction, resume context for
 * question generation). Runs server-side only — never trust a client to
 * have parsed its own upload correctly, and never execute anything from
 * the file itself.
 *
 * Takes a multer file object (memoryStorage: { buffer, mimetype, originalname,
 * size }), not the browser File API — this is the adaptation point from the
 * Next.js version, which used request.formData()'s native File objects.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB — plenty for a text-based resume/JD, keeps parsing fast
const MAX_EXTRACTED_CHARS = 20000; // matches the cap already enforced on pasted JD/resume text

export class FileParsingError extends Error {}

export async function extractTextFromUpload(file) {
  if (file.size > MAX_FILE_BYTES) {
    throw new FileParsingError(`File is too large (${Math.round(file.size / 1024 / 1024)}MB). Maximum is 5MB.`);
  }

  const buffer = file.buffer;
  const type = file.mimetype;
  const name = file.originalname.toLowerCase();

  let text;

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    text = await extractPdf(buffer);
  } else if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) {
    text = await extractDocx(buffer);
  } else if (type === 'text/plain' || name.endsWith('.txt')) {
    text = buffer.toString('utf-8');
  } else {
    throw new FileParsingError(
      `Unsupported file type "${type || name}". Upload a PDF, DOCX, or plain text file, or paste the text directly instead.`
    );
  }

  const trimmed = text.trim();
  if (!trimmed) {
    throw new FileParsingError('Could not extract any text from this file — it may be a scanned image without a text layer.');
  }

  return trimmed.slice(0, MAX_EXTRACTED_CHARS);
}

async function extractPdf(buffer) {
  try {
    // Pinned to pdf-parse@1.1.1 deliberately — v2 rewrote this around pdfjs-dist's full
    // rendering pipeline, which expects browser/worker APIs that don't exist in a plain
    // Node.js server context and fails with a cryptic "Object.defineProperty called on
    // non-object" error. v1's simpler text-extraction-only implementation has been reliably
    // used in Node server contexts for years — don't "upgrade" this without testing thoroughly.
    const pdfParse = (await import('pdf-parse')).default;
    const result = await pdfParse(buffer);
    return result.text;
  } catch (err) {
    throw new FileParsingError(`Could not read this PDF: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function extractDocx(buffer) {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (err) {
    throw new FileParsingError(`Could not read this DOCX file: ${err instanceof Error ? err.message : String(err)}`);
  }
}
