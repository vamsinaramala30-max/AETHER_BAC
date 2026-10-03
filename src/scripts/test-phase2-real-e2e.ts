import jwt from 'jsonwebtoken';
import { securityConfig } from '../config/security.js';

async function runRealPhase2E2E() {
  console.log('================================================================');
  console.log('  AETHER PHASE 2 — REAL LOCAL AI PIPELINE VERIFICATION');
  console.log('================================================================');

  const token = jwt.sign(
    {
      id: '11111111-1111-4111-8111-111111111111',
      email: 'phase2-tester@aether.internal',
      role: 'USER',
    },
    securityConfig.jwt.secret,
    { expiresIn: '1h' },
  );

  console.log('[1/4] Checking AI Health via Backend...');
  const healthRes = await fetch('http://localhost:5001/api/v1/ai/health', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const healthJson = await healthRes.json();
  console.log('  Status:', healthRes.status, JSON.stringify(healthJson));
  if (healthRes.status !== 200) {
    throw new Error(`AI Health failed: ${JSON.stringify(healthJson)}`);
  }

  console.log('\n[2/4] Testing Authenticated Non-Streaming Generation (POST /api/v1/ai/chat)...');
  const chatPrompt = 'Hello, explain what AETHER is in one sentence.';
  console.log(`  Prompt: "${chatPrompt}"`);
  const chatStart = Date.now();
  const chatRes = await fetch('http://localhost:5001/api/v1/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: chatPrompt,
    }),
  });
  const chatElapsed = Date.now() - chatStart;
  const chatJson = (await chatRes.json()) as any;
  console.log(`  HTTP ${chatRes.status} in ${chatElapsed}ms`);
  console.log('  Response:', JSON.stringify(chatJson, null, 2));

  const assistantReply = chatJson.data?.assistantMessage?.content ?? chatJson.data?.message;
  if (!chatRes.ok || !assistantReply) {
    throw new Error(`Chat generation failed: ${JSON.stringify(chatJson)}`);
  }
  console.log(`  ✓ Received real model response (${assistantReply.length} chars): "${assistantReply.trim()}"`);

  console.log('\n[3/4] Testing Authenticated Streaming Generation (POST /api/v1/ai/stream)...');
  const streamPrompt = 'What is artificial intelligence in ten words?';
  console.log(`  Prompt: "${streamPrompt}"`);
  const streamStart = Date.now();
  const streamRes = await fetch('http://localhost:5001/api/v1/ai/stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: streamPrompt,
    }),
  });

  console.log(`  HTTP ${streamRes.status} (Content-Type: ${streamRes.headers.get('content-type')})`);
  if (!streamRes.ok || !streamRes.body) {
    const errText = await streamRes.text();
    throw new Error(`Streaming failed: HTTP ${streamRes.status} - ${errText}`);
  }

  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let chunksReceived = 0;
  let accumulatedText = '';
  let receivedDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') {
        receivedDone = true;
        continue;
      }
      try {
        const parsed = JSON.parse(dataStr);
        chunksReceived++;
        if (parsed.delta) {
          const deltaText = typeof parsed.delta === 'string' ? parsed.delta : parsed.delta.content ?? '';
          accumulatedText += deltaText;
          process.stdout.write(deltaText);
        }
      } catch (err) {
        // non-json data line
      }
    }
  }

  const streamElapsed = Date.now() - streamStart;
  console.log(`\n  ✓ Stream completed in ${streamElapsed}ms`);
  console.log(`  Chunks received: ${chunksReceived}`);
  console.log(`  Terminal [DONE] received: ${receivedDone}`);
  console.log(`  Accumulated text: "${accumulatedText.trim()}"`);

  if (chunksReceived === 0 || !accumulatedText.trim()) {
    throw new Error('Streaming received 0 tokens/chunks!');
  }

  console.log('\n================================================================');
  console.log('  AETHER PHASE 2 — REAL LOCAL PIPELINE VERIFIED SUCCESSFULLY');
  console.log('================================================================\n');
}

runRealPhase2E2E().catch((err) => {
  console.error('\n❌ Phase 2 Real Pipeline Verification FAILED:', err);
  process.exit(1);
});
