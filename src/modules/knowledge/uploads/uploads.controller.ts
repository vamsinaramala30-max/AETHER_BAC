import { UploadsService } from './uploads.service';
import { PrepareUploadDto } from './uploads.dto';

export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  async prepareUpload(req: { body: PrepareUploadDto; user: { id: string } }) {
    return this.uploadsService.prepareUpload(req.body, req.user.id);
  }
}
