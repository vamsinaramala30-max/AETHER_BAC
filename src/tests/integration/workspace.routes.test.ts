import request from 'supertest';
import { app } from '../../app';
import { generateTestToken } from '../helpers/auth.helper';

describe('GET /api/v1/workspaces', () => {
  it('should return 401 Unauthorized if authorization header is omitted', async () => {
    const response = await request(app).get('/api/v1/workspaces');
    expect(response.status).toBe(401);
  });

  it('should allow access with a valid Bearer token', async () => {
    const token = generateTestToken();
    const response = await request(app)
      .get('/api/v1/workspaces')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).not.toBe(401);
  });
});