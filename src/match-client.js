(() => {
  'use strict';
  const sheet = document.getElementById('sheet');
  const body = document.getElementById('sheet-body');
  const endpoint = document.querySelector('meta[name="pollen-match-api"]')?.content;
  const teams = { ant:'蚂蚁', bee:'蜜蜂', beetle:'甲虫', spider:'蜘蛛', butterfly:'蝴蝶' };
  let active = null, timer = null;

  function button(text, action, style = 'plain') {
    const b = document.createElement('button');
    b.type = 'button'; b.className = style; b.textContent = text;
    b.addEventListener('click', action);
    return b;
  }
  function view(title, message) {
    const header = document.createElement('div'), h = document.createElement('h2');
    header.className = 'sheet-top'; h.id = 'sheet-title'; h.textContent = title;
    const close = button('×', () => sheet.close(), 'round-btn');
    close.setAttribute('aria-label', '关闭'); header.append(h, close);
    const text = document.createElement('p'); text.textContent = message;
    text.setAttribute('role', 'status'); body.replaceChildren(header, text);
  }
  async function request(ticket, method, data) {
    const res = await fetch(new URL('ticket', new URL(endpoint, location.href)), {
      method, cache: 'no-store', headers: { Authorization: 'Bearer ' + ticket,
        ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined
    });
    if (!res.ok) throw Error('匹配暂时不可用');
    return res.json();
  }
  function stop() {
    clearTimeout(timer);
    const ticket = active; active = null;
    if (ticket) request(ticket, 'DELETE').catch(() => {});
  }
  async function start(faction) {
    stop();
    const ticket = crypto.randomUUID(); active = ticket;
    view('寻找对手', '正在等另一台设备加入…');
    body.append(button('取消匹配', () => sheet.close()));
    async function poll(method) {
      try {
        const reply = await request(ticket, method, method === 'POST' ? { faction } : undefined);
        if (active !== ticket) {
          if (method === 'POST') await request(ticket, 'DELETE').catch(() => {});
          return;
        }
        if (reply.status === 'waiting') { timer = setTimeout(() => poll('GET'), 1700); return; }
        if (reply.status === 'paired') {
          view('匹配成功', teams[faction] + ' × ' + teams[reply.opponent] + '　房间 ' + reply.room.slice(0, 8));
          const note = document.createElement('p'); note.textContent = '本次联测到配对为止。'; body.append(note);
          // The other seat must be able to collect its pairing receipt even if this sheet is closed.
          active = null;
        } else { stop(); view('配对已结束', '重新打开匹配可以再试一次。'); }
      } catch {
        if (active !== ticket) return;
        stop(); view('暂时连不上测试服', '请检查网络，然后重新加入。');
        body.append(button('重试', () => start(faction)));
      }
    }
    poll('POST');
  }
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-do="online-match"]')) return;
    view('匹配对战', endpoint ? '选一族加入配对测试。' : '匹配测试尚未开放。');
    if (endpoint) {
      const choices = document.createElement('div'); choices.className = 'sheet-actions';
      for (const [id, name] of Object.entries(teams)) choices.append(button(name, () => start(id)));
      body.append(choices);
    }
    if (!sheet.open) sheet.showModal();
  });
  sheet.addEventListener('close', stop);
  window.addEventListener('pagehide', stop);
})();
