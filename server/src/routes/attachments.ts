import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import multer from 'multer';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { requireActiveRequester } from '../middleware/requesterContext';

const router = Router();
const prisma = new PrismaClient();

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(new Error('UNSUPPORTED_FILE_TYPE'));
    }
    cb(null, true);
  },
});

// ──────────────────────────────────────────────
// POST /api/tickets/:ticketNumber/attachments - Upload d'une pièce jointe
// ──────────────────────────────────────────────
router.post(
  '/tickets/:ticketNumber/attachments',
  requireActiveRequester,
  (req: Request, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: any) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            error: 'FILE_TOO_LARGE',
            message: 'File exceeds the 5MB limit.',
          });
        }
        if (err.message === 'UNSUPPORTED_FILE_TYPE') {
          return res.status(422).json({
            error: 'UNSUPPORTED_FILE_TYPE',
            message: 'Only JPG, PNG, WEBP, and PDF files are allowed.',
          });
        }
        console.error('Error during upload:', err);
        return res.status(500).json({
          error: 'UPLOAD_FAILED',
          message: 'Unable to upload attachment.',
        });
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const requesterId = req.requester!.id;
      const { ticketNumber } = req.params;

      if (!req.file) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'No file provided.',
        });
      }

      const ticket = await prisma.ticket.findFirst({
        where: { ticketNumber, requesterId }, // BR-27: ownership check inside the query itself
      });

      if (!ticket) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Ticket not found.',
        });
      }

      const activeCount = await prisma.attachment.count({
        where: { ticketId: ticket.id, isRemoved: false },
      });

      if (activeCount >= 5) {
        return res.status(409).json({
          error: 'ATTACHMENT_LIMIT_REACHED',
          message: 'A ticket may have at most 5 active attachments.',
        });
      }

      // storedFileName généré (UUID + extension d'origine) pour éviter
      // path traversal / collisions à partir d'un nom fourni par l'utilisateur.
      const extension = path.extname(req.file.originalname);
      const storedFileName = `${randomUUID()}${extension}`;

      try {
        await fs.mkdir(UPLOADS_DIR, { recursive: true });
        await fs.writeFile(path.join(UPLOADS_DIR, storedFileName), req.file.buffer);
      } catch (writeError) {
        console.error('Error writing attachment file:', writeError);
        return res.status(500).json({
          error: 'UPLOAD_FAILED',
          message: 'Unable to upload attachment.',
        });
      }

      const attachment = await prisma.attachment.create({
        data: {
          ticketId: ticket.id,
          originalFileName: req.file.originalname,
          storedFileName,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
        },
      });

      res.status(201).json({
        id: attachment.id,
        ticketId: attachment.ticketId,
        originalFileName: attachment.originalFileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        uploadedAt: attachment.uploadedAt,
        isRemoved: attachment.isRemoved,
      });

    } catch (error) {
      console.error('Error uploading attachment:', error);
      res.status(500).json({
        error: 'UPLOAD_FAILED',
        message: 'Unable to upload attachment.',
      });
    }
  }
);

export default router;