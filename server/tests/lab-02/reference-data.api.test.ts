import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';

const prisma = new PrismaClient();

describe('GET /api/categories', () => {
  it('API-24: returns only active categories', async () => {
    const res = await request(app).get('/api/categories');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(4);

    const names = res.body.map((c: any) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['Account and Access', 'Hardware', 'Software', 'Network'])
    );

    const allCategories = await prisma.category.findMany();
    const inactive = allCategories.filter((c) => !c.isActive);
    for (const inactiveCategory of inactive) {
      expect(res.body.find((c: any) => c.id === inactiveCategory.id)).toBeUndefined();
    }
  });

  it('response items only expose id and name', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
    }
  });
});

describe('GET /api/related-systems', () => {
  it('API-24: returns only active related systems, at least the 7 seeded', async () => {
    const res = await request(app).get('/api/related-systems');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6);

    const names = res.body.map((r: any) => r.name);
    expect(names).toEqual(expect.arrayContaining(['Email', 'VPN', 'Corporate Laptop']));
  });

  it('response items only expose id and name', async () => {
    const res = await request(app).get('/api/related-systems');
    expect(res.status).toBe(200);
    if (res.body.length > 0) {
      expect(Object.keys(res.body[0]).sort()).toEqual(['id', 'name']);
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
