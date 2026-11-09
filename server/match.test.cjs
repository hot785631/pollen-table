'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createMatchServer } = require('./match.cjs');

test('two devices pair once; retries, cancellation, and abandoned tickets are safe', async t => {
  let now = 0;
  const server = createMatchServer({ now: () => now });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const url = 'http://127.0.0.1:' + server.address().port + '/api/match/v1/ticket';
  async function request(token, method, faction) {
    const response = await fetch(url, { method, headers: { Authorization: 'Bearer ' + token },
      body: faction ? JSON.stringify({ faction }) : undefined });
    return { code: response.status, ...await response.json() };
  }
  const a = randomUUID(), b = randomUUID(), c = randomUUID();
  assert.equal((await request(a, 'POST', 'ant')).status, 'waiting');
  assert.equal((await request(a, 'POST', 'ant')).status, 'waiting');
  const second = await request(b, 'POST', 'bee'), first = await request(a, 'GET');
  assert.equal(first.room, second.room); assert.notEqual(first.seat, second.seat);
  assert.equal(first.opponent, 'bee'); assert.equal(second.opponent, 'ant');
  assert.equal((await request(a, 'DELETE')).status, 'closed');
  assert.equal((await request(b, 'GET')).status, 'closed');
  assert.equal((await request(c, 'POST', 'unknown')).code, 400);
  assert.equal((await request(c, 'POST', 'spider')).status, 'waiting');
  now += 61_000;
  assert.equal((await request(c, 'GET')).code, 404);
  assert.equal((await request('', 'GET')).code, 401);
});
