import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceError } from '../server/service-error.ts';
import { GameError } from '../server/model.ts';
void test('service distinguishes exhausted capacity from recoverable interruptions', () => {
  const quota = serviceError(
    new Error(
      'Your account or project has exceeded the quota. Upgrade your plan to increase limits.',
    ),
  );
  assert.equal(quota.retryable, false);
  assert.equal(quota.status, 503);
  assert.match(quota.message, /capacity/);
  assert.equal(serviceError(new Error('connection reset')).retryable, true);
  assert.equal(
    serviceError(new GameError('Room expired', 404)).retryable,
    false,
  );
});
