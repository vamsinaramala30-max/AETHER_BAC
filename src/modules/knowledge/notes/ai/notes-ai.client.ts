/**
 * ASSUMPTION: I do not have access to Aether's existing AI service/client
 * (it lives outside the `notes/` module and wasn't included in the files I
 * was given). This file defines the interface notes.service.ts calls
 * against, and a NotConfiguredAiClient that fails loudly instead of
 * fabricating content.
 *
 * To wire in the real thing: implement AetherNotesAiClient below by
 * delegating each method to Aether's actual AI client/service, then swap
 * the export at the bottom of this file. No other file needs to change.
 */

export type NotesAiAction =
  | 'ASK'
  | 'SUMMARIZE'
  | 'IMPROVE_WRITING'
  | 'EXPLAIN'
  | 'GENERATE_OUTLINE'
  | 'EXTRACT_TASKS'
  | 'FIND_KEY_IDEAS'
  | 'CONTINUE_WRITING';

export interface NotesAiRequest {
  action: NotesAiAction;
  pageTitle: string;
  pageContent: string; // the actual, current page content — never invented
  question?: string; // for ASK
}

export interface NotesAiResult {
  /** Human-readable answer/summary/etc. Always shown to the user as a preview. */
  output: string;
  /**
   * Only set for actions that propose replacing/appending page content
   * (IMPROVE_WRITING, CONTINUE_WRITING). The caller must show this as a
   * Preview and only persist it if the user clicks Apply — see
   * notes.service.ts::applyAiSuggestion.
   */
  suggestedContent?: string;
}

export interface NotesAiClient {
  run(req: NotesAiRequest): Promise<NotesAiResult>;
}

/**
 * Fails loudly rather than returning templated/fake text like the previous
 * implementation did (`[AI Summary (...)]: Prepared summary of...`).
 * Swap this export for a real client once one is available.
 */
export class NotConfiguredAiClient implements NotesAiClient {
  async run(_req: NotesAiRequest): Promise<NotesAiResult> {
    throw new Error(
      'Aether AI is not connected for Notes yet. Wire NotesAiClient in ' +
        'backend/ai/notes-ai.client.ts to the existing Aether AI service.',
    );
  }
}

export const notesAiClient: NotesAiClient = new NotConfiguredAiClient();
