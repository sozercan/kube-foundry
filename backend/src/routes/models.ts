import { Router, Request, Response, NextFunction } from 'express';
import models from '../data/models.json';

const router = Router();

// GET /api/models - Get curated model catalog
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ models: models.models });
  } catch (error) {
    next(error);
  }
});

// GET /api/models/:id - Get single model by ID
router.get('/:id(*)', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const modelId = req.params.id;
    const model = models.models.find((m) => m.id === modelId);

    if (!model) {
      res.status(404).json({ error: { message: 'Model not found' } });
      return;
    }

    res.json(model);
  } catch (error) {
    next(error);
  }
});

export default router;
