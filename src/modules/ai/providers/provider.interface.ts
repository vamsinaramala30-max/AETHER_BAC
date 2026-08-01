export interface CompletionOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: Array<{ name: string; description: string; parameters: Record<string, any> }>;
  stopSequences?: string[];
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ProviderResponse {
  content: string;
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter';
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

export interface IAiProvider {
  id: string;
  name: string;
  generateCompletion(messages: ChatMessage[], options: CompletionOptions): Promise<ProviderResponse>;
  generateStream(messages: ChatMessage[], options: CompletionOptions, onChunk: (chunk: string) => void): Promise<ProviderResponse>;
  generateEmbeddings(text: string | string[], model?: string): Promise<number[][]>;
  countTokens(text: string): Promise<number>;
}