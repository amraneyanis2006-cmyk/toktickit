import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

router.get('/related-systems', async (req, res) => {
  try {
    const systems = await prisma.relatedSystem.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to load related systems.',
    });
  }
});

export default router;
