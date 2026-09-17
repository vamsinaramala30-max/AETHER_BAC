/**
 * AETHER AI — 20 Unseen Requests Quality Gate Verification Suite
 * Tests the full AI pipeline on 20 natural-language queries covering diverse user intents.
 */

import { globalAiEngine } from '../modules/ai/core/ai-engine.js';
import type { AIRequest } from '../modules/ai/ai-types.js';

const UNSEEN_REQUESTS = [
  { id: 1, query: 'Hello, what can you help me with?', category: 'Conversational / Capabilities' },
  { id: 2, query: 'Explain what automation means', category: 'Conceptual / Explanatory' },
  { id: 3, query: 'Create a project plan for my website', category: 'Planning / Strategy' },
  { id: 4, query: 'How can I be more productive?', category: 'Productivity Guidance' },
  { id: 5, query: 'What is Aether and how does it work?', category: 'Aether Product Knowledge' },
  { id: 6, query: 'Help me organize my tasks for this week', category: 'Task Organization' },
  { id: 7, query: 'Plan my day tomorrow', category: 'Daily Planning' },
  { id: 8, query: 'Create a weekly study plan', category: 'Learning Roadmap' },
  { id: 9, query: 'What tasks should I prioritize?', category: 'Prioritization Framework' },
  { id: 10, query: 'Help me finish this project before Friday', category: 'Deadline Management' },
  { id: 11, query: 'Remember that I prefer dark mode', category: 'Memory Storage' },
  { id: 12, query: 'What did we discuss earlier?', category: 'Conversation Context' },
  { id: 13, query: 'Find information from my knowledge base', category: 'Knowledge Retrieval' },
  { id: 14, query: 'Create an automation for daily reports', category: 'Automation Workflow' },
  { id: 15, query: 'Help me debug this JavaScript error', category: 'Technical / Debugging' },
  { id: 16, query: 'Compare REST vs GraphQL', category: 'Technical Comparison' },
  { id: 17, query: 'Summarize the key points of project management', category: 'Summarization' },
  { id: 18, query: 'Make a roadmap for learning Python', category: 'Roadmap Planning' },
  { id: 19, "query": "I don't know where to start with my project", category: 'Guidance / Getting Started' },
  { id: 20, query: 'I have a deadline next week, help me plan', category: 'Deadline Planning' },
];

async function runQualityGate() {
  console.log('================================================================');
  console.log('=== AETHER AI — 20 UNSEEN REQUESTS QUALITY GATE VERIFICATION ===');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const results: Array<{
    id: number;
    query: string;
    category: string;
    status: 'PASS' | 'FAIL';
    intent: string;
    confidence: string;
    responseLength: number;
    sample: string;
  }> = [];

  for (const item of UNSEEN_REQUESTS) {
    const request: AIRequest = {
      requestId: `test_req_${item.id}_${Date.now()}`,
      userId: 'test_quality_user',
      sessionId: 'test_session_1',
      conversationId: 'test_conv_quality_gate',
      message: item.query,
      timestamp: Date.now(),
      options: {
        providerMode: 'auto',
      },
    };

    try {
      const result = await globalAiEngine.process(request);

      if (!result.ok) {
        console.error(`[FAIL] Request #${item.id}: "${item.query}" -> Error:`, result.error);
        failed++;
        results.push({
          id: item.id,
          query: item.query,
          category: item.category,
          status: 'FAIL',
          intent: 'ERROR',
          confidence: 'NONE',
          responseLength: 0,
          sample: result.error.message,
        });
        continue;
      }

      const res = result.value;
      const content = res.message?.trim() || '';

      // Quality validation criteria:
      // 1. Content is not empty
      // 2. Content is longer than 20 characters
      // 3. Content has readable words (not repetitive word salad)
      const words = content.split(/\s+/);
      const isTooShort = content.length < 20;
      const isRepetitive = words.length > 5 && new Set(words.map((w) => w.toLowerCase())).size / words.length < 0.25;

      if (isTooShort || isRepetitive) {
        console.error(`[FAIL] Request #${item.id}: "${item.query}" -> Incoherent/Too Short output:`, content);
        failed++;
        results.push({
          id: item.id,
          query: item.query,
          category: item.category,
          status: 'FAIL',
          intent: res.intent?.type || 'UNKNOWN',
          confidence: res.confidence || 'UNKNOWN',
          responseLength: content.length,
          sample: content.slice(0, 100),
        });
      } else {
        passed++;
        console.log(`[PASS] #${item.id} [${item.category}]`);
        console.log(`       Query: "${item.query}"`);
        console.log(`       Intent: ${res.intent?.type} | Confidence: ${res.confidence}`);
        console.log(`       Preview: ${content.slice(0, 120).replace(/\n/g, ' ')}...`);
        console.log('----------------------------------------------------------------');

        results.push({
          id: item.id,
          query: item.query,
          category: item.category,
          status: 'PASS',
          intent: res.intent?.type || 'UNKNOWN',
          confidence: res.confidence || 'UNKNOWN',
          responseLength: content.length,
          sample: content.slice(0, 150),
        });
      }
    } catch (err) {
      console.error(`[EXCEPTION] Request #${item.id}:`, err);
      failed++;
    }
  }

  console.log('\n================================================================');
  console.log(`=== QUALITY GATE RESULTS: ${passed}/20 PASSED (${failed} FAILED) ===`);
  console.log('================================================================\n');

  if (failed === 0) {
    console.log('SUCCESS: All 20 unseen requests passed quality validation cleanly!');
    process.exit(0);
  } else {
    console.error(`WARNING: ${failed} requests failed.`);
    process.exit(1);
  }
}

runQualityGate();
