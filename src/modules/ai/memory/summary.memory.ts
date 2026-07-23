export class SummaryMemory {
  public summarize(messages: Array<{ role: string; content: string }>): string {
    return `Conversation summary: ${messages.length} messages exchanged.`;
  }
}