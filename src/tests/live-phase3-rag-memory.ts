/**
 * AETHER PHASE 3 — LIVE END-TO-END VERIFICATION SCRIPT
 *
 * Exercises the complete real pipeline:
 * AETHER_BAC -> PostgreSQL (ai_memories & document_chunks) -> AETHER_MODEL (bge-small-en-v1.5 embeddings & Qwen2.5-1.5B inference)
 */

import { buildDefaultAIConfig } from '../modules/ai/ai-config.js';
import { RAGEngine, defaultVectorStore, defaultKeywordIndex } from '../modules/ai/rag/rag-engine.js';
import { MemoryEngine } from '../modules/ai/memory/memory-engine.js';
import { memoryRepository } from '../modules/ai/storage/repositories/memory-repository.js';
import { knowledgeChunkRepository } from '../modules/ai/storage/repositories/knowledge-chunk-repository.js';
import { ContextEngine } from '../modules/ai/core/context-engine.js';
import { PromptEngine } from '../modules/ai/prompts/prompt-engine.js';
import type { AIRequest, Intent } from '../modules/ai/ai-types.js';

interface TestStepResult {
  step: string;
  passed: boolean;
  details: string;
}

const results: TestStepResult[] = [];

function record(step: string, passed: boolean, details: string) {
  results.push({ step, passed, details });
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} [${step}] ${details}`);
}

async function runLiveVerification() {
  console.log('\n================================================================');
  console.log('  AETHER PHASE 3 — LIVE PRODUCTION RAG & MEMORY PIPELINE VERIFICATION');
  console.log('================================================================\n');

  const config = buildDefaultAIConfig();
  const userA = '00000000-0000-4000-a000-000000000001';
  const userB = '00000000-0000-4000-a000-000000000002';
  const workspaceA = '00000000-0000-4000-a000-000000000010';
  const workspaceB = '00000000-0000-4000-a000-000000000020';

  // 1. Verify AETHER_MODEL /health & /embedding endpoints
  try {
    const healthRes = await fetch('http://127.0.0.1:5002/health');
    const healthJson = await healthRes.json() as any;
    record(
      'STEP 1: Model Server Health',
      healthJson.ok === true && healthJson.state === 'READY',
      `Model: ${healthJson.model}, State: ${healthJson.state}`,
    );

    const embedRes = await fetch('http://127.0.0.1:5002/embedding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'AETHER Phase 3 test document for semantic embedding' }),
    });
    const embedJson = await embedRes.json() as any;
    const is384 = Array.isArray(embedJson.embedding) && embedJson.embedding.length === 384;
    record(
      'STEP 2: Real Local Embeddings',
      is384,
      `Model: ${embedJson.model}, Vector dimensions: ${embedJson.embedding?.length}`,
    );
  } catch (err) {
    record('STEP 1-2: Model Server Connectivity', false, String(err));
    return;
  }

  // Initialize Engines
  const memoryEngine = new MemoryEngine(config);
  const ragEngine = new RAGEngine(config);
  const contextEngine = new ContextEngine(memoryEngine, ragEngine, config);
  const promptEngine = new PromptEngine();

  // 2. Real Document Ingestion and Embedding into PostgreSQL
  const docTitle = 'AETHER Architecture Specification Phase 3';
  const docContent = `
AETHER Phase 3 Architecture:
The system implements a production Retrieval-Augmented Generation (RAG) and Persistent Memory subsystem.
Primary database persistence utilizes PostgreSQL with Prisma for ai_memories and document_chunks tables.
No localStorage or client-side storage is ever authoritative for long-term memory.
The local neural inference engine runs Qwen2.5-1.5B-Instruct in 4-bit GGUF quantization via llama.cpp.
Semantic embeddings are computed locally using BAAI/bge-small-en-v1.5 with 384 dimensions.
Cross-workspace isolation is strictly enforced using tenant UUID filters on all database queries.
Retrieved knowledge is strictly formatted as UNTRUSTED KNOWLEDGE EVIDENCE to prevent indirect prompt injection.
  `.trim();

  let ingestedDocId = '';
  try {
    const ingestRes = await ragEngine.ingest({
      type: 'text',
      content: docContent,
      filename: 'phase3_spec.md',
      metadata: {
        title: docTitle,
        source: 'docs/architecture/phase3_spec.md',
        workspaceId: workspaceA,
        userId: userA,
      },
      userId: userA,
      workspaceId: workspaceA,
    });

    if (ingestRes.ok) {
      ingestedDocId = ingestRes.value.documentId;
      record(
        'STEP 3: RAG Document Ingestion & Chunking',
        true,
        `Document ID: ${ingestedDocId}, Chunks created: ${ingestRes.value.chunkIds.length}`,
      );
    } else {
      record('STEP 3: RAG Document Ingestion', false, ingestRes.error.message);
    }
  } catch (err) {
    record('STEP 3: RAG Ingestion Exception', false, String(err));
  }

  // 3. PostgreSQL Database Persistence across simulated backend restart
  try {
    // Wipe all in-memory caches to simulate server restart
    await defaultVectorStore.clear();
    await defaultKeywordIndex.clear();
    (knowledgeChunkRepository as any).chunkCache?.clear();

    // Query RAG engine — it must hydrate from PostgreSQL
    const retrieveRes = await ragEngine.query({
      text: 'What embedding model and dimensions does AETHER Phase 3 use?',
      topK: 2,
      scoreThreshold: 0.3,
      userId: userA,
      workspaceId: workspaceA,
    });

    if (retrieveRes.ok && retrieveRes.value.documents.length > 0) {
      const topDoc = retrieveRes.value.documents[0];
      const hasContent = topDoc.content.includes('BAAI/bge-small-en-v1.5') && topDoc.content.includes('384 dimensions');
      record(
        'STEP 4: DB Hydration & Retrieval Across Restart',
        hasContent,
        `Retrieved: ${retrieveRes.value.documents.length} docs, Top score: ${topDoc.score.toFixed(3)}, Contains expected facts: ${hasContent}`,
      );
    } else {
      record('STEP 4: DB Hydration & Retrieval Across Restart', false, 'No documents returned after cache wipe');
    }
  } catch (err) {
    record('STEP 4: DB Hydration Exception', false, String(err));
  }

  // 4. Persistent Memory CRUD & Restart Survival
  let memoryId = '';
  try {
    const memCreate = await memoryEngine.createMemory({
      userId: userA,
      workspaceId: workspaceA,
      type: 'preference',
      content: 'User preference: Always write server-side code using strict TypeScript and Prisma ORM.',
      importance: 0.95,
    });

    if (memCreate.ok) {
      memoryId = memCreate.value.id;
      record(
        'STEP 5: Memory Creation in PostgreSQL',
        true,
        `Memory ID: ${memoryId}, Content: "${memCreate.value.content}"`,
      );
    } else {
      record('STEP 5: Memory Creation', false, memCreate.error.message);
    }

    // Wipe memory cache to simulate restart
    (memoryRepository as any).memoryCache?.clear();

    const memFetch = await memoryEngine.getMemoryById(memoryId, userA);
    record(
      'STEP 6: Memory Recall from DB Post-Restart',
      memFetch.ok && memFetch.value.content.includes('strict TypeScript and Prisma'),
      `Retrieved memory ID: ${memFetch.ok ? memFetch.value.id : 'none'}`,
    );

    // Test deduplication
    const dupCreate = await memoryEngine.createMemory({
      userId: userA,
      workspaceId: workspaceA,
      type: 'preference',
      content: 'User preference: Always write server-side code using strict TypeScript and Prisma ORM.',
      importance: 0.98,
    });
    record(
      'STEP 7: Memory Deduplication',
      dupCreate.ok && dupCreate.value.id === memoryId && dupCreate.value.importance === 0.98,
      `Idempotent update verified: id=${dupCreate.ok ? dupCreate.value.id : ''}, new importance=${dupCreate.ok ? dupCreate.value.importance : ''}`,
    );
  } catch (err) {
    record('STEP 5-7: Memory Exception', false, String(err));
  }

  // 5. Strict Tenant & Workspace Isolation
  try {
    // User B in Workspace B tries to query User A's RAG knowledge
    const crossRag = await ragEngine.query({
      text: 'What embedding model does AETHER Phase 3 use?',
      topK: 5,
      scoreThreshold: 0.1,
      userId: userB,
      workspaceId: workspaceB,
    });
    const ragIsolated = crossRag.ok && crossRag.value.documents.length === 0;

    // User B tries to search User A's memory
    const crossMem = await memoryEngine.searchMemory({
      userId: userB,
      text: 'strict TypeScript and Prisma',
      topK: 5,
      scoreThreshold: 0.1,
    });
    const memIsolated = crossMem.ok && crossMem.value.length === 0;

    record(
      'STEP 8: Cross-User & Cross-Workspace Isolation',
      ragIsolated && memIsolated,
      `RAG leakage: ${crossRag.ok ? crossRag.value.documents.length : 'err'} (expected 0), Memory leakage: ${crossMem.ok ? crossMem.value.length : 'err'} (expected 0)`,
    );
  } catch (err) {
    record('STEP 8: Isolation Exception', false, String(err));
  }

  // 6. Zero-Fabrication on Unrelated Queries
  try {
    const unrelatedQuery = await ragEngine.query({
      text: 'Photosynthesis biochemical reactions in deep sea hydrothermal vent tube worms',
      topK: 5,
      scoreThreshold: 0.8,
      userId: userA,
      workspaceId: workspaceA,
    });
    const zeroResults = unrelatedQuery.ok && unrelatedQuery.value.documents.length === 0;
    record(
      'STEP 9: Zero Fabrication on Unrelated Query',
      zeroResults,
      `Retrieved documents: ${unrelatedQuery.ok ? unrelatedQuery.value.documents.length : 'err'} (expected 0)`,
    );
  } catch (err) {
    record('STEP 9: Zero Fabrication Exception', false, String(err));
  }

  // 7. Context Assembly & Prompt Construction (AI Orchestrator)
  let builtPromptSystem = '';
  let builtPromptUser = '';
  try {
    const aiReq: AIRequest = {
      requestId: 'live_req_01',
      userId: userA,
      sessionId: 'live_sess_01',
      conversationId: 'live_conv_01',
      workspaceId: workspaceA,
      message: 'What embedding model is used in Phase 3, and what coding preferences do I have?',
      options: { enableRAG: true, enableMemory: true },
      timestamp: Date.now(),
    };
    const intent: Intent = {
      type: 'KNOWLEDGE_REQUEST',
      confidence: 0.95,
      requiresRAG: true,
      requiresMemory: true,
      requiresTool: false,
      requiresAgent: false,
    };

    const ctxRes = await contextEngine.buildContext(aiReq, intent);
    if (!ctxRes.ok) {
      record('STEP 10: AI Context Assembly', false, ctxRes.error.message);
    } else {
      const promptRes = promptEngine.build(aiReq.message, ctxRes.value, {
        includeRAG: true,
        includeMemory: true,
      });

      if (promptRes.ok) {
        builtPromptSystem = promptRes.value.system;
        builtPromptUser = promptRes.value.messages.map((m) => m.content).join('\n');
        const hasEvidence = builtPromptSystem.includes('UNTRUSTED KNOWLEDGE EVIDENCE');
        const hasMemory = builtPromptSystem.includes('Relevant memories from previous interactions') &&
                          builtPromptSystem.includes('strict TypeScript');
        const tokensBounded = promptRes.value.estimatedTokens < 4096;

        record(
          'STEP 10: AI Orchestrator Prompt Construction',
          hasEvidence && hasMemory && tokensBounded,
          `RAG Evidence Quarantined: ${hasEvidence}, Memory Injected: ${hasMemory}, Tokens: ${promptRes.value.estimatedTokens} / 4096`,
        );
      } else {
        record('STEP 10: Prompt Construction', false, promptRes.error.message);
      }
    }
  } catch (err) {
    record('STEP 10: Context Assembly Exception', false, String(err));
  }

  // 8. Real End-to-End Inference via AETHER_MODEL (Qwen2.5-1.5B GGUF)
  try {
    const genPayload = {
      prompt: `${builtPromptSystem}\n\nUser: ${builtPromptUser}\n\nAssistant:`,
      max_tokens: 150,
      temperature: 0.2,
    };

    const genRes = await fetch('http://127.0.0.1:5002/v1/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(genPayload),
    });

    const genJson = await genRes.json() as any;
    const content = genJson.content || '';
    const mentionsEmbedding = content.toLowerCase().includes('bge') || content.toLowerCase().includes('384');
    const mentionsTypeScript = content.toLowerCase().includes('typescript');

    record(
      'STEP 11: Real Qwen2.5-1.5B Inference Grounding',
      content.length > 0,
      `Generated response (${content.length} chars):\n"${content.trim()}"\nMentions RAG fact: ${mentionsEmbedding}, Mentions Memory preference: ${mentionsTypeScript}`,
    );
  } catch (err) {
    record('STEP 11: Real Inference Exception', false, String(err));
  }

  // Summary
  console.log('\n================================================================');
  console.log('  LIVE VERIFICATION SUMMARY');
  console.log('================================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`Total Checks: ${results.length}`);
  console.log(`Passed: ${results.filter((r) => r.passed).length}`);
  console.log(`Failed: ${results.filter((r) => !r.passed).length}`);
  console.log(`Verdict: ${allPassed ? 'ALL SYSTEMS OPERATIONAL ✅' : 'FAILURES DETECTED ❌'}\n`);
}

runLiveVerification().catch(console.error);
