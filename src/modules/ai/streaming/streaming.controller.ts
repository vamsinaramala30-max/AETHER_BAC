import { StreamingService } from './streaming.service';

export class StreamingController {
  constructor(private service: StreamingService) {}

  public async cancel(req: any, res: any): Promise<void> {
    const { streamId } = req.params;
    const success = this.service.cancelStream(streamId);
    res.json({ success });
  }
}
