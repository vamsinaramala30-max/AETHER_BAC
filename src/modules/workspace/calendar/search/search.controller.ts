import { Request, Response, NextFunction } from 'express';
import { SearchService } from './search.service';

export class SearchController {
  constructor(private searchService: SearchService) {}

  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const q = req.query.q as string;
      if (!q) {
        res.status(400).json({ error: 'Query string parameter "q" is required' });
        return;
      }
      const results = await this.searchService.searchEvents(userId, q);
      res.status(200).json({ data: results });
    } catch (err) {
      next(err);
    }
  }
}