import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'TokTickIT API' });
});

// Lab 4 FR-24 (api-spec sec 11): database status; /api/health stays exactly as in Lab 1.
router.get('/health/db', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ database: 'ok' });
  } catch {
    res.status(503).json({ database: 'unreachable' });
  }
});

export default router;
