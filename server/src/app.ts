import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Endpoint Health Check (Issue #2 — Lab 1)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'TokTickIT API',
  });
});

// Endpoint Categories (Issue #4 — Lab 1)
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { id: 'asc' },
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Endpoint Development Requesters (Issue #3 — Lab 2)
// Returns only ACTIVE requesters (BR-06); this is the list shown on the
// Development Requester Selection screen. It is intentionally NOT protected
// by requireActiveRequester, since selecting a requester is how identity is
// first established.
app.get('/api/requesters', async (req, res) => {
  try {
    const requesters = await prisma.requesterUser.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
    res.status(200).json(requesters);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to load requesters.',
    });
  }
});

export default app;
