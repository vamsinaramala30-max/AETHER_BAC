import jwt from 'jsonwebtoken';
import { securityConfig } from '../src/config';

const BASE_URL = 'http://localhost:5001/api/v1';

// Verified user in database
const USER_ID = '72bd2cc9-363f-447d-9f06-dce7abe06546';
const USER_EMAIL = 'vamsinaramala30@gmail.com';
const WORKSPACE_ID = 'f284ed6d-822d-4bed-b7f3-e2e9be11579d';

const validToken = jwt.sign(
  {
    id: USER_ID,
    email: USER_EMAIL,
    role: 'USER',
    workspaceId: WORKSPACE_ID,
    tokenVersion: 0,
  },
  securityConfig.jwt.secret,
  { expiresIn: '1h', algorithm: 'HS256' }
);

const endpoints = [
  { method: 'GET', path: '/favorites' },
  { method: 'GET', path: '/uploads/recent?limit=30' },
  { method: 'GET', path: '/tasks' },
  { method: 'GET', path: '/projects' },
  { method: 'GET', path: '/workspaces/default/focus/analytics' },
  { method: 'GET', path: '/calendar' },
  { method: 'GET', path: '/calendar/events' },
];

async function run() {
  console.log('=== TEST 1: UNAUTHENTICATED CALLS ===');
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, { method: ep.method });
      console.log(`[ANON] ${ep.method} ${ep.path} -> HTTP ${res.status}`);
    } catch (err: any) {
      console.log(`[ANON] ${ep.method} ${ep.path} -> FETCH ERROR: ${err.message}`);
    }
  }

  console.log('\n=== TEST 2: AUTHENTICATED CALLS (Valid JWT) ===');
  for (const ep of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${ep.path}`, {
        method: ep.method,
        headers: {
          'Authorization': `Bearer ${validToken}`,
          'x-workspace-id': WORKSPACE_ID,
        },
      });
      const text = await res.text();
      let preview = text.substring(0, 150);
      try {
        const json = JSON.parse(text);
        preview = JSON.stringify(json).substring(0, 150);
      } catch {}
      console.log(`[AUTH] ${ep.method} ${ep.path} -> HTTP ${res.status} | Body: ${preview}`);
    } catch (err: any) {
      console.log(`[AUTH] ${ep.method} ${ep.path} -> FETCH ERROR: ${err.message}`);
    }
  }
}

run();
