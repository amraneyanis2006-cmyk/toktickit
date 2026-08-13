import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server/src/app';

describe('GET /api/health', () => {
  it('should return 200 OK with expected JSON body', async () => {
    const response = await request(app).get('/api/health');
    
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'TokTickIT API'
    });
  });
});