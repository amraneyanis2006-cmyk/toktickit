import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { requireActiveRequester } from '../../src/middleware/requesterContext';
import express from 'express';

const prisma = new PrismaClient();

describe('GET /api/requesters', () => {
  it('API-23: returns only active requesters, excludes inactive ones', async () => {
    const res = await request(app).get('/api/requesters');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const allRequesters = await prisma.requesterUser.findMany();
    const inactive = allRequesters.filter((r) => !r.isActive);

    for (const inactiveRequester of inactive) {
      const found = res.body.find((r: any) => r.id === inactiveRequester.id);
      expect(found).toBeUndefined();
    }
  });

  it('response items only expose id, name, and email', async () => {
    const res = await request(app).get('/api/requesters');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      const keys = Object.keys(res.body[0]).sort();
      expect(keys).toEqual(['email', 'id', 'name']);
    }
  });
});

describe('requireActiveRequester middleware', () => {
  // Build a tiny throwaway app that protects a test route with the middleware,
  // so the middleware can be tested in isolation from any real endpoint.
  const testApp = express();
  testApp.get('/protected', requireActiveRequester, (req, res) => {
    res.status(200).json({ requester: req.requester });
  });

  it('API-05 pattern: missing x-requester-id header -> 401 MISSING_REQUESTER', async () => {
    const res = await request(testApp).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_REQUESTER');
  });

  it('non-numeric x-requester-id -> 401 INVALID_REQUESTER', async () => {
    const res = await request(testApp).get('/protected').set('x-requester-id', 'abc');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REQUESTER');
  });

  it('x-requester-id referencing a nonexistent requester -> 401 INVALID_REQUESTER', async () => {
    const res = await request(testApp).get('/protected').set('x-requester-id', '999999');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_REQUESTER');
  });

  it('API-06 pattern: x-requester-id referencing an inactive requester -> 403 REQUESTER_INACTIVE', async () => {
    const inactive = await prisma.requesterUser.findFirst({ where: { isActive: false } });
    expect(inactive).not.toBeNull();

    const res = await request(testApp)
      .get('/protected')
      .set('x-requester-id', String(inactive!.id));

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('REQUESTER_INACTIVE');
  });

  it('valid active requester -> 200, req.requester populated', async () => {
    const active = await prisma.requesterUser.findFirst({ where: { isActive: true } });
    expect(active).not.toBeNull();

    const res = await request(testApp)
      .get('/protected')
      .set('x-requester-id', String(active!.id));

    expect(res.status).toBe(200);
    expect(res.body.requester.id).toBe(active!.id);
    expect(res.body.requester.name).toBe(active!.name);
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
