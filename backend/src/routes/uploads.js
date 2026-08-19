import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../auth/middleware.js';
import { extractTextFromUpload, FileParsingError } from '../lib/file-parsing.js';

const router = Router();

// memoryStorage: files never touch disk — extracted in-process and discarded. Fine at the
// 5MB cap enforced here AND inside extractTextFromUpload (defense in depth: multer rejects
// oversized uploads before they're even fully received, not just after).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/**
 * Generic "give me a file, get back text" endpoint. Not tied to JD or resume specifically —
 * the wizard calls this for either upload field, then treats the extracted text exactly like
 * something the candidate pasted directly.
 */
router.post('/extract-text', requireAuth, (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is too large. Maximum is 5MB.' });
      }
      return res.status(400).json({ error: 'Could not process this upload.' });
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }

  try {
    const text = await extractTextFromUpload(req.file);
    res.json({ text });
  } catch (err) {
    if (err instanceof FileParsingError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Unexpected file parsing error:', err);
    res.status(500).json({ error: 'Could not process this file. Please try pasting the text instead.' });
  }
});

export default router;
