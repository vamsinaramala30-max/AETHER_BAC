import { Request, Response } from 'express';
import { HomeService } from './home.service';

export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  async getHomeFeed(req: Request, res: Response): Promise<void> {
    const workspaceId = req.query.workspaceId as string;
    const userId = (req as any).user?.id || req.headers['x-user-id'];

    if (!userId || !workspaceId) {
      res.status(400).json({ error: 'userId and workspaceId are required' });
      return;
    }

    const data = await this.homeService.getHomeFeed(userId as string, workspaceId);
    res.status(200).json({ success: true, data });
  }
}