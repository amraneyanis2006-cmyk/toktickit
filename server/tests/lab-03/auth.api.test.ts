import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../src/app';
import { hashPassword } from '../../src/utils/password';
import { requireAuth, requirePasswordChanged } from '../../src/middleware/auth';

const prisma = new PrismaClient();

const ACTIVE_PASSWORD = 'ActiveUserPass1!';
const INACTIVE_PASSWORD = 'InactiveUserPass1!';
const MUST_CHANGE_PASSWORD = 'TempInitPass1!';

let activeUserId: number;
let inactiveUserId: number;
let mustChangeUserId: number;

function requireCookie(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookie = Array.isArray(raw) ? raw[0] : raw;
  if (!cookie || typeof cookie !== 'string') {
    throw new Error('Expected a Set-Cookie header on the response');
  }
  return cookie;
}

// Test-only protected route mounted on the real app, exercising the real
// requireAuth + requirePasswordChanged middleware (API-05). No production
// route uses requirePasswordChanged yet - the Requester/staff routes still
// predate real auth and are migrated onto it in Issue #16.
app.get('/api/__test-protected', requireAuth, requirePasswordChanged, (_req: unknown, res: any) => {
  res.status(200).json({ ok: true });
});

beforeAll(async () => {
  const [active, inactive, mustChange] = await Promise.all([
    prisma.user.create({
      data: {
        name: 'Auth Test Active',
        email: 'auth-test-active@example.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: false,
        passwordHash: await hashPassword(ACTIVE_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Auth Test Inactive',
        email: 'auth-test-inactive@example.com',
        role: 'REQUESTER',
        isActive: false,
        mustChangePassword: false,
        passwordHash: await hashPassword(INACTIVE_PASSWORD),
      },
    }),
    prisma.user.create({
      data: {
        name: 'Auth Test MustChange',
        email: 'auth-test-mustchange@example.com',
        role: 'REQUESTER',
        isActive: true,
        mustChangePassword: true,
        passwordHash: await hashPassword(MUST_CHANGE_PASSWORD),
      },
    }),
  ]);
  activeUserId = active.id;
  inactiveUserId = inactive.id;
  mustChangeUserId = mustChange.id;
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [activeUserId, inactiveUserId, mustChangeUserId] } },
  });
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('AC-01, API-01: valid login returns safe user data and sets a session cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: activeUserId,
      name: 'Auth Test Active',
      email: 'auth-test-active@example.com',
      role: 'REQUESTER',
      mustChangePassword: false,
    });
    expect(res.body.passwordHash).toBeUndefined();
    expect(requireCookie(res)).toMatch(/^sid=/);
  });

  it('AC-05, API-02: invalid password returns a generic 401', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
  });

  it('AC-05, API-03: login for an inactive account returns the identical 401 as API-02', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-inactive@example.com', password: INACTIVE_PASSWORD });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
  });

  it('API-04: login for an unknown email returns the identical 401 as API-02/03', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'no-such-user@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' });
  });

  it('rejects a request missing email or password with 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'x@example.com' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});

describe('mustChangePassword gate (API-05)', () => {
  it('blocks a protected route with 403 PASSWORD_CHANGE_REQUIRED while mustChangePassword is true', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-mustchange@example.com', password: MUST_CHANGE_PASSWORD });
    const cookie = requireCookie(login);

    const res = await request(app).get('/api/__test-protected').set('Cookie', cookie);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'PASSWORD_CHANGE_REQUIRED',
      message: 'You must change your password before continuing.',
    });
  });

  it('does not block /api/auth/me even while mustChangePassword is true', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-mustchange@example.com', password: MUST_CHANGE_PASSWORD });
    const cookie = requireCookie(login);

    const res = await request(app).get('/api/auth/me').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.mustChangePassword).toBe(true);
  });

  it('allows the protected route again after mustChangePassword becomes false', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-mustchange@example.com', password: MUST_CHANGE_PASSWORD });
    const cookie = requireCookie(login);

    await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: MUST_CHANGE_PASSWORD, newPassword: 'BrandNewPass1!' });

    const res = await request(app).get('/api/__test-protected').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    await prisma.user.update({
      where: { id: mustChangeUserId },
      data: { passwordHash: await hashPassword(MUST_CHANGE_PASSWORD), mustChangePassword: true },
    });
  });
});

describe('POST /api/auth/change-password', () => {
  it('API-06: succeeds, persists mustChangePassword=false, and the new password works on next login', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: ACTIVE_PASSWORD, newPassword: 'FreshPassword1!' });

    expect(changeRes.status).toBe(200);
    expect(changeRes.body).toEqual({ id: activeUserId, mustChangePassword: false });

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).toBe(200);
    expect(meRes.body.mustChangePassword).toBe(false);

    const reloginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: 'FreshPassword1!' });
    expect(reloginRes.status).toBe(200);

    await prisma.user.update({
      where: { id: activeUserId },
      data: { passwordHash: await hashPassword(ACTIVE_PASSWORD) },
    });
  });

  it('API-07: rejects a new password shorter than 8 characters', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: ACTIVE_PASSWORD, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.fields.newPassword).toBeDefined();
  });

  it('API-07: rejects a new password identical to the current password', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: ACTIVE_PASSWORD, newPassword: ACTIVE_PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.fields.newPassword).toBeDefined();
  });

  it('rejects an incorrect current password with a field-level error', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', cookie)
      .send({ currentPassword: 'totally-wrong', newPassword: 'AnotherStrongPass1!' });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'VALIDATION_ERROR',
      fields: { currentPassword: 'Current password is incorrect.' },
    });
  });
});

describe('POST /api/auth/logout (API-08)', () => {
  it('AC-06: destroys the session so the old cookie is rejected afterward', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const logoutRes = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body).toEqual({ loggedOut: true });

    const meRes = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(meRes.status).toBe(401);
    expect(meRes.body.error).toBe('NOT_AUTHENTICATED');
  });

  it('is a no-op success (still 200) when already unauthenticated', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedOut: true });
  });
});

describe('GET /api/auth/me without a session', () => {
  it('returns 401 NOT_AUTHENTICATED', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'NOT_AUTHENTICATED', message: 'Please log in.' });
  });
});

describe('Session expiry (API-09, BR-06)', () => {
  it('treats a session past its 8h inactivity window as unauthenticated', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'auth-test-active@example.com', password: ACTIVE_PASSWORD });
    const cookie = requireCookie(login);

    const before = await request(app).get('/api/auth/me').set('Cookie', cookie);
    expect(before.status).toBe(200);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 9 * 60 * 60 * 1000); // +9h, past the 8h rolling window

    try {
      const after = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(after.status).toBe(401);
      expect(after.body.error).toBe('NOT_AUTHENTICATED');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('AC-15: a real migrated Lab 2 Requester keeps exactly their pre-migration Tickets', () => {
  it('My Tickets, authenticated as a migrated account, matches the database ground truth exactly', async () => {
    // Uses a REAL migrated Lab 2 account (David Lee), not an e2e fixture -
    // the closest thing to a genuine before/after migration comparison
    // available without a database snapshot: the migration (#15) only ever
    // touched the User table (adding passwordHash/role/mustChangePassword),
    // never the Ticket table, so "the same Tickets as before migration" is
    // exactly "every Ticket where requesterId = their id, today".
    const david = await prisma.user.findUniqueOrThrow({ where: { email: 'david.lee@toktickit.test' } });
    const groundTruthTickets = await prisma.ticket.findMany({
      where: { requesterId: david.id },
      select: { ticketNumber: true },
    });
    const groundTruthNumbers = groundTruthTickets.map((t: { ticketNumber: string }) => t.ticketNumber).sort();
    expect(groundTruthNumbers.length).toBeGreaterThan(0); // sanity: this account must actually have history

    // Reset via a real Administrator session, capturing the plaintext initial
    // password from the HTTP response (never assume/hardcode a stale one).
    const adminLogin = await request(app).post('/api/auth/login').send({ email: 'admin@example.com', password: 'DevPass123!' });
    expect(adminLogin.status).toBe(200);
    const adminCookie = requireCookie(adminLogin);

    const reset = await request(app).patch(`/api/admin/users/${david.id}/reset-password`).set('Cookie', adminCookie);
    expect(reset.status).toBe(200);
    const newPassword = reset.body.initialPassword as string;

    const davidLogin = await request(app).post('/api/auth/login').send({ email: 'david.lee@toktickit.test', password: newPassword });
    expect(davidLogin.status).toBe(200);
    expect(davidLogin.body.mustChangePassword).toBe(true);
    const davidCookie = requireCookie(davidLogin);

    // The reset forces mustChangePassword - complete that gate first, same as
    // a real returning user would, before the ticket-continuity check.
    const changeRes = await request(app)
      .post('/api/auth/change-password')
      .set('Cookie', davidCookie)
      .send({ currentPassword: newPassword, newPassword: 'DavidNewChosenPass1!' });
    expect(changeRes.status).toBe(200);

    const listRes = await request(app).get('/api/tickets').query({ pageSize: 100 }).set('Cookie', davidCookie);
    expect(listRes.status).toBe(200);
    expect(listRes.body.pagination.totalItems).toBe(groundTruthNumbers.length);

    const returnedNumbers = listRes.body.data.map((t: { ticketNumber: string }) => t.ticketNumber).sort();
    expect(returnedNumbers).toEqual(groundTruthNumbers);
  });
});
