import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { db } from '../database/client';

const router = Router();

router.use(authenticate);

// GET /favorites — list all favorites for the authenticated user
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const favs = await db.userFavorite.findMany({
      where: { userId },
      orderBy: { order: 'asc' },
    });
    res.status(200).json({ success: true, data: favs });
  } catch (err) {
    next(err);
  }
});

// POST /favorites — add a new favorite
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { title, resourceType, resourceId, workspaceId, metadata } = req.body;

    if (!title) {
      res.status(400).json({ success: false, message: 'title is required' });
      return;
    }
    if (!resourceType) {
      res.status(400).json({ success: false, message: 'resourceType is required' });
      return;
    }
    if (!resourceId) {
      res.status(400).json({ success: false, message: 'resourceId is required' });
      return;
    }

    // Count existing to assign order
    const count = await db.userFavorite.count({ where: { userId } });

    const favorite = await db.userFavorite.upsert({
      where: {
        userId_resourceType_resourceId: { userId, resourceType, resourceId },
      },
      create: {
        userId,
        workspaceId: workspaceId || null,
        resourceType,
        resourceId,
        title,
        metadata: metadata || null,
        order: count,
      },
      update: {
        title,
        metadata: metadata || undefined,
      },
    });

    res.status(201).json({ success: true, data: favorite });
  } catch (err) {
    next(err);
  }
});

// PATCH /favorites/reorder — update display order
router.patch('/reorder', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { orderedIds } = req.body as { orderedIds: string[] };

    if (!Array.isArray(orderedIds)) {
      res.status(400).json({ success: false, message: 'orderedIds must be an array' });
      return;
    }

    await Promise.all(
      orderedIds.map((id, index) =>
        db.userFavorite.updateMany({
          where: { id, userId },
          data: { order: index },
        }),
      ),
    );

    res.status(200).json({ success: true, message: 'Order updated' });
  } catch (err) {
    next(err);
  }
});

// DELETE /favorites/:id — remove a favorite by its DB id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const deleted = await db.userFavorite.deleteMany({
      where: { id, userId },
    });

    if (deleted.count === 0) {
      res.status(404).json({ success: false, message: 'Favorite not found' });
      return;
    }

    res.status(200).json({ success: true, message: 'Favorite removed' });
  } catch (err) {
    next(err);
  }
});

// DELETE /favorites/resource/:type/:resourceId — remove by resource identity
router.delete('/resource/:resourceType/:resourceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const { resourceType, resourceId } = req.params;

    await db.userFavorite.deleteMany({
      where: { userId, resourceType, resourceId },
    });

    res.status(200).json({ success: true, message: 'Favorite removed' });
  } catch (err) {
    next(err);
  }
});

export const favoritesRoutes: Router = router;
