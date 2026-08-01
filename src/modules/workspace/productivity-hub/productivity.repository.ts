import { ProductivitySnapshotEntity } from './productivity.entity';
import { GetProductivityStatsDto } from './productivity.dto';

export class ProductivityRepository {
  private snapshots: Map<string, ProductivitySnapshotEntity> = new Map();

  async saveSnapshot(snapshot: ProductivitySnapshotEntity): Promise<ProductivitySnapshotEntity> {
    this.snapshots.set(snapshot.id, snapshot);
    return snapshot;
  }

  async getSnapshots(query: GetProductivityStatsDto): Promise<ProductivitySnapshotEntity[]> {
    return Array.from(this.snapshots.values()).filter(
      (s) => s.workspaceId === query.workspaceId && s.userId === query.userId,
    );
  }
}