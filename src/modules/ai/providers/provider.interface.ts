export interface AIProvider {
  generateText(prompt: string, options?: { systemInstruction?: string; temperature?: number }): Promise<string>;
  generateEmbeddings(text: string): Promise<number[]>;
}