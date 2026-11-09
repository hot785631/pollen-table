'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const teams = ['ant', 'bee', 'beetle', 'spider', 'butterfly'];
const prefix = '/api/match/v1';
const docs = path.resolve(__dirname, '../docs');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.zip': 'application/zip',
  '.webmanifest': 'application/manifest+json' };
const waitingTTL = 60_000, roomTTL = 5 * 60_000;

function createMatchServer({ now = Date.now, capacity = 256 } = {}) {
  const tickets = new Map();
  function expire() {
    for (const [token, ticket] of tickets) {
      if (ticket.expires <= now()) tickets.delete(token);
    }
  }
  function leave(token) {
    const ticket = tickets.get(token);
    if (ticket?.peer && tickets.has(ticket.peer)) {
      const peer = tickets.get(ticket.peer);
      peer.status = 'closed';
      delete peer.peer;
    }
    tickets.delete(token);
  }
  function receipt(ticket) {
    const { status, faction, room, seat, opponent } = ticket;
    return { status, faction, room, seat, opponent };
  }
  function json(res, code, data) {
    res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  async function api(req, res, route) {
    if (route === prefix + '/health' && req.method === 'GET') return json(res, 200, { version: 1 });
    if (route !== prefix + '/ticket') return json(res, 404, { error: 'unknown endpoint' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!/^Bearer /.test(req.headers.authorization || '') || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(token))
      return json(res, 401, { error: 'invalid ticket' });
    expire();
    if (req.method === 'DELETE') { leave(token); return json(res, 200, { status: 'closed' }); }
    if (req.method === 'GET') {
      const ticket = tickets.get(token);
      if (!ticket) return json(res, 404, { error: 'expired' });
      if (ticket.status === 'waiting') ticket.expires = now() + waitingTTL;
      return json(res, 200, receipt(ticket));
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'unsupported method' });
    let payload = '', bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 512) return json(res, 413, { error: 'too large' });
      payload += chunk.toString('utf8');
    }
    let faction;
    try { faction = JSON.parse(payload).faction; } catch { return json(res, 400, { error: 'invalid request' }); }
    if (!teams.includes(faction)) return json(res, 400, { error: 'unknown faction' });
    // A repeated POST after a dropped response must return the original ticket.
    expire();
    if (tickets.has(token)) return json(res, 200, receipt(tickets.get(token)));
    if (tickets.size >= capacity) return json(res, 429, { error: 'queue full' });
    const ticket = { faction, status: 'waiting', expires: now() + waitingTTL };
    const first = Array.from(tickets).find(([, entry]) => entry.status === 'waiting');
    if (first) {
      const [otherToken, other] = first, room = randomUUID(), expires = now() + roomTTL;
      Object.assign(other, { status: 'paired', room, expires, seat: 0, opponent: faction, peer: token });
      Object.assign(ticket, { status: 'paired', room, expires, seat: 1, opponent: other.faction, peer: otherToken });
    }
    tickets.set(token, ticket);
    return json(res, 201, receipt(ticket));
  }
  return http.createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname;
      if (route.startsWith('/api/')) return await api(req, res, route);
      const name = route === '/' ? 'index.html' : route.slice(1);
      if (!['GET','HEAD'].includes(req.method) || !/^[\w.-]+$/.test(name) || !types[path.extname(name)])
        return json(res, 404, { error: 'not found' });
      let file = await fs.readFile(path.join(docs, name));
      if (name === 'index.html') file = Buffer.from(file.toString('utf8').replace('<head>', '<head><meta name="pollen-match-api" content="/api/match/v1/">'));
      const headers = { 'content-type': types[path.extname(name)], 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' };
      let status = 200;
      if (name.endsWith('.mp3') && req.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        const size = file.length;
        const first = range?.[1] ? Number(range[1]) : Math.max(0, size - Number(range?.[2]));
        const last = range?.[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
        if (!range || !(first <= last) || first >= size) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size }); return res.end();
        }
        headers['Content-Range'] = 'bytes ' + first + '-' + last + '/' + size;
        headers['Accept-Ranges'] = 'bytes';
        file = file.subarray(first, last+1); status = 206;
      }
      res.writeHead(status, { ...headers, 'content-length': file.length });
      res.end(req.method === 'HEAD' ? undefined : file);
    } catch { if (!res.headersSent) json(res, 404, { error: 'not found' }); else res.end(); }
  });
}
module.exports = { createMatchServer };
if (require.main === module) {
  const port = Number(process.env.PORT || 4173);
  createMatchServer().listen(port, '0.0.0.0', () => console.log('Pollen Table: http://localhost:' + port));
}
