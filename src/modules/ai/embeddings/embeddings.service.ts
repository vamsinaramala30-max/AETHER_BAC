import { ProviderFactory } from '../providers/provider.factory';
import { VectorRepository } from './vector.repository';
import { GenerateEmbeddingDto, VectorSearchDto } from './embedding.dto';

export class EmbeddingsService {
  constructor(
    private providerFactory: ProviderFactory,
    private vectorRepo: VectorRepository
  ) {}

  public async createEmbeddings(dto: GenerateEmbeddingDto) {
    const provider = this.providerFactory.getProvider('openai');
    const vectors = await provider.generateEmbeddings(dto.input, dto.model);
    return vectors;
  }

  public async searchSimilar(dto: VectorSearchDto) {
    return this.vectorRepo.similaritySearch(dto.vector, dto.topK || 5);
  }
}