// Pure validation/normalization functions extracted from routes/tickets.ts
// and routes/attachments.ts so they can be unit-tested in isolation
// (UNIT-03, UNIT-04, UNIT-05), with no DB or HTTP involved.

export interface TicketFieldErrors {
  summary?: string;
  description?: string;
}

/**
 * Validates Summary (5-150 chars) and Description (10-2000 chars) after
 * trimming, per BR-14/BR-15. Same rules and messages as the inline checks
 * that used to live in routes/tickets.ts POST /tickets.
 */
export function validateTicketFields(input: {
  summary?: string;
  description?: string;
}): TicketFieldErrors {
  const errors: TicketFieldErrors = {};

  const trimmedSummary = input.summary?.trim();
  if (!trimmedSummary || trimmedSummary.length < 5) {
    errors.summary = 'Summary must be at least 5 characters.';
  } else if (trimmedSummary.length > 150) {
    errors.summary = 'Summary must not exceed 150 characters.';
  }

  const trimmedDescription = input.description?.trim();
  if (!trimmedDescription || trimmedDescription.length < 10) {
    errors.description = 'Description must be at least 10 characters.';
  } else if (trimmedDescription.length > 2000) {
    errors.description = 'Description must not exceed 2000 characters.';
  }

  return errors;
}

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];
export const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB

export interface AttachmentValidationResult {
  valid: boolean;
  error?: 'UNSUPPORTED_FILE_TYPE' | 'FILE_TOO_LARGE';
}

/**
 * Validates an attachment's MIME type and size per BR-20. Same rule set
 * previously split across attachments.ts's multer fileFilter (MIME) and
 * limits.fileSize (size) — combined here into one pure, testable function.
 */
export function validateAttachment(file: {
  mimetype: string;
  size: number;
}): AttachmentValidationResult {
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
    return { valid: false, error: 'UNSUPPORTED_FILE_TYPE' };
  }
  if (file.size > MAX_ATTACHMENT_SIZE) {
    return { valid: false, error: 'FILE_TOO_LARGE' };
  }
  return { valid: true };
}

export interface NormalizedPagination {
  page: number;
  pageSize: number;
}

/**
 * Normalizes page/pageSize query params per BR-12: invalid or missing
 * values fall back to page=1, pageSize=10; valid pageSize (1-100) passes
 * through unchanged. Same rules as the inline checks that used to live in
 * routes/tickets.ts GET /tickets.
 */
export function normalizePagination(input: {
  page?: unknown;
  pageSize?: unknown;
}): NormalizedPagination {
  let page = Number(input.page) || 1;
  if (page < 1 || !Number.isInteger(page)) page = 1;

  let pageSize = Number(input.pageSize) || 10;
  if (pageSize < 1 || pageSize > 100 || !Number.isInteger(pageSize)) {
    pageSize = 10;
  }

  return { page, pageSize };
}
