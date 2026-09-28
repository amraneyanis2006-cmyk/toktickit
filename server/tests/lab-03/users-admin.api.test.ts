import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';

const prisma = new PrismaClient();

const PASSWORD = 'Ua19TestPass1!';
const EMAILS = {
  admin: 'ua19-admin@example.com',
  staff: 'ua19-staff@example.com',
  requester: 'ua19-requester@example.com',
};

let adminId: number;
let staffId: number;
let requesterId: number;
let categoryId: number;
let relatedSystemId: number;
let logSpy: { mock: { calls: unknown[][] } };

function requireCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie || typeof cookie !== 'string') throw new Error('Expected a Set-Cookie header');
  return cookie;
}

async function loginAs(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  return requireCookie(res);
}

async function createFixtureUser(name: string, email: string, role: 'REQUESTER' | 'IT_STAFF' | 'ADMINISTRATOR') {
  return prisma.user.create({
    data: { name, email, role, isActive: true, mustChangePassword: false, passwordHash: await hashPassword(PASSWORD) },
  });
}

async function createViaApi(cookie: string, name: string, email: string, role = 'IT_STAFF'): Promise<number> {
  const res = await request(app).post('/api/admin/users').set('Cookie', cookie).send({ name, email, role });
  expect(res.status).toBe(201);
  return res.body.id;
}

/** The generated initial password is delivered on the server console only (api-spec.md sec 15/17). */
function capturedPassword(email: string): string {
  const prefix = `[LOCAL DEV ONLY] initial password for ${email}: `;
  for (let i = logSpy.mock.calls.length - 1; i >= 0; i--) {
    const first = logSpy.mock.calls[i]?.[0];
    if (typeof first === 'string' && first.startsWith(prefix)) return first.slice(prefix.length);
  }
  throw new Error(`No initial password was logged for ${email}`);
}

beforeAll(async () => {
  // Records the calls (capturedPassword reads them) but does not print: the generated
  // initial passwords must not end up in test output or CI logs.
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

  const [admin, staff, requester, category, relatedSystem] = await Promise.all([
    createFixtureUser('UA19 Admin', EMAILS.admin, 'ADMINISTRATOR'),
    createFixtureUser('UA19 Staff', EMAILS.staff, 'IT_STAFF'),
    createFixtureUser('UA19 Requester', EMAILS.requester, 'REQUESTER'),
    prisma.category.create({ data: { name: 'UA19 Test Category' } }),
    prisma.relatedSystem.create({ data: { name: 'UA19 Test System' } }),
  ]);
  adminId = admin.id;
  staffId = staff.id;
  requesterId = requester.id;
  categoryId = category.id;
  relatedSystemId = relatedSystem.id;
});

afterAll(async () => {
  const users = await prisma.user.findMany({ where: { email: { startsWith: 'ua19-' } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await prisma.ticketComment.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.ticketInternalNote.deleteMany({ where: { authorId: { in: ids } } });
  await prisma.ticket.deleteMany({ where: { OR: [{ requesterId: { in: ids } }, { ticketOwnerId: { in: ids } }] } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { name: 'UA19 Test Category' } });
  await prisma.relatedSystem.deleteMany({ where: { name: 'UA19 Test System' } });
  await prisma.$disconnect();
});

describe('access control (API-28, SEC-03, AC-16)', () => {
  const calls = [
    (c: string) => request(app).get('/api/admin/users').set('Cookie', c),
    (c: string) => request(app).post('/api/admin/users').set('Cookie', c).send({}),
    (c: string) => request(app).patch('/api/admin/users/1').set('Cookie', c).send({}),
    (c: string) => request(app).patch('/api/admin/users/1/reset-password').set('Cookie', c),
  ];

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(app).get('/api/admin/users');
    expect(res.status).toBe(401);
  });

  for (const [label, email] of [['IT Staff', EMAILS.staff], ['Requester', EMAILS.requester]] as const) {
    it(`${label} session gets 403 FORBIDDEN on every /api/admin/* route`, async () => {
      const cookie = await loginAs(email, PASSWORD);
      const responses = await Promise.all(calls.map((call) => call(cookie)));
      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('FORBIDDEN');
      }
    });
  }
});

describe('GET /api/admin/users (API-30, FR-17)', () => {
  it('searches name or email case-insensitively and exposes only the list fields', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).get('/api/admin/users').query({ search: 'UA19 STAFF' }).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.map((u: { id: number }) => u.id)).toContain(staffId);
    expect(res.body.map((u: { id: number }) => u.id)).not.toContain(requesterId);
    for (const u of res.body) {
      expect(Object.keys(u).sort()).toEqual(['email', 'id', 'isActive', 'name', 'role']);
    }
  });

  it('filters by role, alone or combined with a search', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).get('/api/admin/users').query({ search: 'ua19', role: 'IT_STAFF' }).set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.every((u: { role: string }) => u.role === 'IT_STAFF')).toBe(true);
    const ids = res.body.map((u: { id: number }) => u.id);
    expect(ids).toContain(staffId);
    expect(ids).not.toContain(requesterId);
    expect(ids).not.toContain(adminId);
  });
});

describe('POST /api/admin/users (API-31, API-32, FR-18, BR-19, BR-23)', () => {
  it('creates a user: email lowercased, password generated, logged, hashed, never returned', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ name: 'UA19 Created', email: 'UA19-Created@Example.com', role: 'IT_STAFF' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      name: 'UA19 Created',
      email: 'ua19-created@example.com',
      role: 'IT_STAFF',
      isActive: true,
      mustChangePassword: true,
    });

    const plain = capturedPassword('ua19-created@example.com');
    expect(plain.length).toBeGreaterThanOrEqual(12);
    expect(JSON.stringify(res.body)).not.toContain(plain);

    const row = await prisma.user.findUniqueOrThrow({ where: { email: 'ua19-created@example.com' } });
    expect(row.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(row.passwordHash).not.toBe(plain);

    const login = await request(app).post('/api/auth/login').send({ email: 'ua19-created@example.com', password: plain });
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
  });

  it('honours isActive:false, and that account cannot log in', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ name: 'UA19 Inactive', email: 'ua19-inactive@example.com', role: 'REQUESTER', isActive: false });

    expect(res.status).toBe(201);
    expect(res.body.isActive).toBe(false);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ua19-inactive@example.com', password: capturedPassword('ua19-inactive@example.com') });
    expect(login.status).toBe(401);
  });

  it('400 VALIDATION_ERROR reports every invalid field', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ email: 'not-an-email', role: 'SUPERUSER' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'name', 'role']);
  });

  it('AC-13: 409 DUPLICATE_EMAIL, case-insensitive across roles, and no record is created', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const countBefore = await prisma.user.count({ where: { email: { equals: EMAILS.staff, mode: 'insensitive' } } });

    const res = await request(app)
      .post('/api/admin/users')
      .set('Cookie', cookie)
      .send({ name: 'Imposter', email: 'UA19-STAFF@example.com', role: 'REQUESTER' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE_EMAIL');
    const countAfter = await prisma.user.count({ where: { email: { equals: EMAILS.staff, mode: 'insensitive' } } });
    expect(countAfter).toBe(countBefore);
  });
});

describe('PATCH /api/admin/users/:id (API-33, FR-19, BR-19, BR-20)', () => {
  it('changes only the supplied fields', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const id = await createViaApi(cookie, 'UA19 Partial', 'ua19-partial@example.com');
    const before = await prisma.user.findUniqueOrThrow({ where: { id } });

    const res = await request(app).patch(`/api/admin/users/${id}`).set('Cookie', cookie).send({ name: 'UA19 Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('UA19 Renamed');

    const after = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(after.name).toBe('UA19 Renamed');
    expect(after.email).toBe(before.email);
    expect(after.role).toBe(before.role);
    expect(after.isActive).toBe(before.isActive);
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('AC-13: 409 DUPLICATE_EMAIL on edit leaves the record unchanged', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const idA = await createViaApi(cookie, 'UA19 Edit A', 'ua19-edit-a@example.com');
    const idB = await createViaApi(cookie, 'UA19 Edit B', 'ua19-edit-b@example.com');

    const res = await request(app).patch(`/api/admin/users/${idB}`).set('Cookie', cookie).send({ email: 'UA19-Edit-A@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE_EMAIL');

    const rowB = await prisma.user.findUniqueOrThrow({ where: { id: idB } });
    expect(rowB.email).toBe('ua19-edit-b@example.com');
    expect(idA).not.toBe(idB);
  });

  it('re-submitting a user\'s own email in a different case is not a duplicate', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const id = await createViaApi(cookie, 'UA19 Self Email', 'ua19-self-email@example.com');

    const res = await request(app).patch(`/api/admin/users/${id}`).set('Cookie', cookie).send({ email: 'UA19-Self-Email@Example.com' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ua19-self-email@example.com');
  });

  it('400 on a malformed email or an invalid role', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).patch(`/api/admin/users/${staffId}`).set('Cookie', cookie).send({ email: 'nope', role: 'ROOT' });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.fields).sort()).toEqual(['email', 'role']);
  });

  it('404 for an unknown id and for a non-numeric id', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const unknown = await request(app).patch('/api/admin/users/999999999').set('Cookie', cookie).send({ name: 'x' });
    const bad = await request(app).patch('/api/admin/users/abc').set('Cookie', cookie).send({ name: 'x' });
    expect(unknown.status).toBe(404);
    expect(bad.status).toBe(404);
  });

  it('BR-20: a role change applies to the user\'s EXISTING session on their next request', async () => {
    const promotee = await createFixtureUser('UA19 Promotee', 'ua19-promotee@example.com', 'REQUESTER');
    const promoteeCookie = await loginAs('ua19-promotee@example.com', PASSWORD);
    const adminCookie = await loginAs(EMAILS.admin, PASSWORD);

    const before = await request(app).get('/api/staff/tickets').set('Cookie', promoteeCookie);
    expect(before.status).toBe(403);

    const patch = await request(app).patch(`/api/admin/users/${promotee.id}`).set('Cookie', adminCookie).send({ role: 'IT_STAFF' });
    expect(patch.status).toBe(200);

    const after = await request(app).get('/api/staff/tickets').set('Cookie', promoteeCookie);
    expect(after.status).toBe(200);
  });
});

describe('PATCH /api/admin/users/:id/reset-password (API-34, AC-14, FR-20, BR-23)', () => {
  it('forces a password change: old password dead, existing session gated, new password must be changed', async () => {
    await createFixtureUser('UA19 Reset', 'ua19-reset@example.com', 'REQUESTER');
    const target = await prisma.user.findUniqueOrThrow({ where: { email: 'ua19-reset@example.com' } });
    const oldSession = await loginAs('ua19-reset@example.com', PASSWORD);
    const adminCookie = await loginAs(EMAILS.admin, PASSWORD);

    const reset = await request(app).patch(`/api/admin/users/${target.id}/reset-password`).set('Cookie', adminCookie);
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ id: target.id, mustChangePassword: true });

    const oldPasswordLogin = await request(app).post('/api/auth/login').send({ email: 'ua19-reset@example.com', password: PASSWORD });
    expect(oldPasswordLogin.status).toBe(401);

    // The user's pre-existing session is not killed, but it is now gated behind Change Password.
    const gated = await request(app).get('/api/tickets').set('Cookie', oldSession);
    expect(gated.status).toBe(403);
    expect(gated.body.error).toBe('PASSWORD_CHANGE_REQUIRED');

    const newPassword = capturedPassword('ua19-reset@example.com');
    const login = await request(app).post('/api/auth/login').send({ email: 'ua19-reset@example.com', password: newPassword });
    expect(login.status).toBe(200);
    expect(login.body.mustChangePassword).toBe(true);
    const newSession = requireCookie(login);

    const change = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', newSession)
      .send({ currentPassword: newPassword, newPassword: 'ChosenByUser1!' });
    expect(change.status).toBe(200);

    const ungated = await request(app).get('/api/tickets').set('Cookie', newSession);
    expect(ungated.status).toBe(200);
  });

  it('404 for an unknown user', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).patch('/api/admin/users/999999999/reset-password').set('Cookie', cookie);
    expect(res.status).toBe(404);
  });
});

describe('self-deactivation (API-35, AC-12, FR-21, BR-22)', () => {
  it('403 SELF_DEACTIVATION_FORBIDDEN even when other active Administrators exist, and the account stays active', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).patch(`/api/admin/users/${adminId}`).set('Cookie', cookie).send({ isActive: false });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('SELF_DEACTIVATION_FORBIDDEN');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(row.isActive).toBe(true);
  });
});

describe('deactivation keeps data (API-37, API-38, BR-01, BR-21)', () => {
  it('a just-deactivated user cannot use their session or log in, but their tickets and comments remain visible to staff', async () => {
    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: 'TKT-UA19-000001',
        requesterId,
        categoryId,
        relatedSystemId,
        summary: 'UA19 ticket owned by a soon-deactivated user',
        description: 'Fixture ticket proving deactivation never deletes history.',
        requestedPriority: 'LOW',
      },
    });
    await prisma.ticketComment.create({
      data: { ticketId: ticket.id, authorId: requesterId, content: 'History that must survive deactivation.' },
    });

    const requesterCookie = await loginAs(EMAILS.requester, PASSWORD);
    const adminCookie = await loginAs(EMAILS.admin, PASSWORD);

    const patch = await request(app).patch(`/api/admin/users/${requesterId}`).set('Cookie', adminCookie).send({ isActive: false });
    expect(patch.status).toBe(200);
    expect(patch.body.isActive).toBe(false);

    const existingSession = await request(app).get('/api/auth/me').set('Cookie', requesterCookie);
    expect(existingSession.status).toBe(401);

    const freshLogin = await request(app).post('/api/auth/login').send({ email: EMAILS.requester, password: PASSWORD });
    expect(freshLogin.status).toBe(401);

    const staffCookie = await loginAs(EMAILS.staff, PASSWORD);
    const detail = await request(app).get('/api/staff/tickets/TKT-UA19-000001').set('Cookie', staffCookie);
    expect(detail.status).toBe(200);
    expect(detail.body.requester.id).toBe(requesterId);
    expect(detail.body.publicComments.map((c: { content: string }) => c.content)).toContain(
      'History that must survive deactivation.'
    );
  });
});

// Kept LAST: this block temporarily deactivates every other active Administrator (including the
// seeded admin@example.com) so the test Administrator is the only one, then restores them.
describe('last active Administrator (API-36, AC-11, FR-22, BR-22)', () => {
  let otherActiveAdminIds: number[] = [];

  beforeAll(async () => {
    const others = await prisma.user.findMany({
      where: { role: 'ADMINISTRATOR', isActive: true, id: { not: adminId } },
      select: { id: true },
    });
    otherActiveAdminIds = others.map((u) => u.id);
    await prisma.user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: false } });
  });

  afterAll(async () => {
    await prisma.user.updateMany({ where: { id: { in: otherActiveAdminIds } }, data: { isActive: true } });
  });

  it('409 LAST_ADMIN_PROTECTED when the only active Administrator changes their own role', async () => {
    const cookie = await loginAs(EMAILS.admin, PASSWORD);
    const res = await request(app).patch(`/api/admin/users/${adminId}`).set('Cookie', cookie).send({ role: 'REQUESTER' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('LAST_ADMIN_PROTECTED');
    const row = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(row.role).toBe('ADMINISTRATOR');
    expect(row.isActive).toBe(true);
  });

  it('the guard is not blanket: demoting a SECOND Administrator is allowed while another remains active', async () => {
    const second = await createFixtureUser('UA19 Second Admin', 'ua19-second-admin@example.com', 'ADMINISTRATOR');
    const cookie = await loginAs(EMAILS.admin, PASSWORD);

    const res = await request(app).patch(`/api/admin/users/${second.id}`).set('Cookie', cookie).send({ role: 'IT_STAFF' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('IT_STAFF');
  });
});
