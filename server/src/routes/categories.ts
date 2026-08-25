import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
const router = Router();
const prisma = new PrismaClient();

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, name: true },
    });
    res.status(200).json(categories);
  } catch (error) {
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Unable to load categories.',
    });
  }
});

export default router;
