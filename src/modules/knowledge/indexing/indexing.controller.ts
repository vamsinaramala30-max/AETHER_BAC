import { IndexingService } from './indexing.service';
import { TriggerIndexDto } from './indexing.dto';

export class IndexingController {
  constructor(private readonly indexingService: IndexingService) {}

  async triggerIndex(req: { body: TriggerIndexDto }) {
    return this.indexingService.triggerIndexing(req.body);
  }
}
