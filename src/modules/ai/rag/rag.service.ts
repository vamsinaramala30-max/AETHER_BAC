import { RAGRetrieval } from './retrieval';
import { RAGIngestion } from './ingestion';

export class RAGService {
  public retrieval: RAGRetrieval;
  public ingestion: RAGIngestion;

  constructor() {
    this.retrieval = new RAGRetrieval();
    this.ingestion = new RAGIngestion();
  }
}