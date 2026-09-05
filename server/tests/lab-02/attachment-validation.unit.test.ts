import { describe, it, expect } from 'vitest';
import { validateAttachment } from '../../src/utils/validation';

describe('validateAttachment (UNIT-04)', () => {
  it('accepts JPG, PNG, WEBP, PDF under 5MB', () => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    for (const mimetype of validTypes) {
      const result = validateAttachment({ mimetype, size: 1024 * 1024 });
      expect(result.valid).toBe(true);
    }
  });

  it('rejects an unsupported MIME type (e.g. .exe)', () => {
    const result = validateAttachment({ mimetype: 'application/x-msdownload', size: 1024 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_FILE_TYPE');
  });

  it('rejects a file over 5MB', () => {
    const result = validateAttachment({ mimetype: 'image/png', size: 6 * 1024 * 1024 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('FILE_TOO_LARGE');
  });

  it('accepts a file exactly at the 5MB boundary', () => {
    const result = validateAttachment({ mimetype: 'image/png', size: 5 * 1024 * 1024 });
    expect(result.valid).toBe(true);
  });

  it('rejects a file that is both wrong type AND too large (type error wins)', () => {
    const result = validateAttachment({ mimetype: 'video/mp4', size: 10 * 1024 * 1024 });
    expect(result.valid).toBe(false);
    expect(result.error).toBe('UNSUPPORTED_FILE_TYPE');
  });
});