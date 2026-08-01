export interface SearchableEventDoc {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
}

export class EventSearchIndex {
  private docs: Map<string, SearchableEventDoc> = new Map();

  index(doc: SearchableEventDoc): void {
    this.docs.set(doc.id, doc);
  }

  remove(id: string): void {
    this.docs.delete(id);
  }

  search(query: string, calendarIds: string[]): SearchableEventDoc[] {
    const q = query.toLowerCase();
    const results: SearchableEventDoc[] = [];

    for (const doc of this.docs.values()) {
      if (calendarIds.includes(doc.calendarId)) {
        if (doc.title.toLowerCase().includes(q) || doc.description?.toLowerCase().includes(q) || doc.location?.toLowerCase().includes(q)) {
          results.push(doc);
        }
      }
    }
    return results;
  }
}