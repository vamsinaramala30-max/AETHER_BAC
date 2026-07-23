import request from 'supertest';
import { app } from '../../app';

describe('POST /api/v1/auth/register', () => {
  it('should return 400 Bad Request when mandatory payload fields are missing', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'invalid-email' });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});