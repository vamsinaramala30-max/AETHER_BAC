export interface IAIPromptOptions {
  systemInstruction?: string;
  temperature?: number;
}

export interface IAIProvider {
  generateText(prompt: string, options?: IAIPromptOptions): Promise<string>;
  generateEmbeddings(text: string): Promise<number[]>;
}

export interface IAIChatResponse {
  conversationId: string;
  reply: string;
}