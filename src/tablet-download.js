/* Used only by the tablet download page served over HTTPS. */
(function () {
  const status = document.getElementById('offline-status');
  const save = document.getElementById('cache-game');
  const install = document.getElementById('install-game');
  const installStatus = document.getElementById('install-status');
  let installPrompt;
  const standalone = matchMedia('(display-mode: standalone)');
  function updateInstallButton() {
    install.hidden = standalone.matches || navigator.standalone === true;
    if (install.hidden) installStatus.textContent = '';
  }
  updateInstallButton();
  standalone.addEventListener?.('change', updateInstallButton);
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    install.hidden = true;
    installStatus.textContent = '';
  });
  install.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt;
      installPrompt = null;
      try {
        await prompt.prompt();
        await prompt.userChoice;
        return;
      } catch { /* The browser menu remains available if the prompt expired. */ }
    }
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    installStatus.textContent = apple ? '用 Safari 打开，点“分享” → “添加到主屏幕” → “添加”。' :
      '打开浏览器菜单，选择“安装应用”或“添加到主屏幕”。';
  });
  const canCache = 'serviceWorker' in navigator && window.isSecureContext;
  if (!canCache) {
    save.hidden = true;
    return;
  }

  function ready() {
    save.hidden = true;
    status.textContent = '已存好，可以断网玩。';
  }
  const workerUrl = new URL('./offline-sw.js', location.href);
  async function isSaved() {
    const registration = await navigator.serviceWorker.getRegistration('./');
    return registration?.active?.scriptURL === workerUrl.href &&
      await caches.has(document.documentElement.dataset.pollenCache);
  }
  async function cacheGame() {
    save.disabled = true;
    status.textContent = '正在保存…';
    try {
      if (await isSaved()) {
        ready();
        return;
      }
      const reg = await navigator.serviceWorker.register(workerUrl, {scope: './', updateViaCache: 'none'});
      if (reg.active && !reg.installing && !reg.waiting) await reg.update();
      const worker = reg.installing || reg.waiting;
      if (worker && worker.state !== 'activated') {
        await new Promise((resolve, reject) => {
          function changed() {
            if (worker.state === 'activated') resolve();
            if (worker.state === 'redundant') reject(new Error('未完成保存'));
          }
          worker.addEventListener('statechange', changed);
          changed();
        });
      }
      if (!await isSaved()) throw new Error('未完成保存');
      ready();
    } catch {
      save.disabled = false;
      status.textContent = '未能保存。可以重试，或下载离线包。';
    }
  }
  save.addEventListener('click', cacheGame);
  cacheGame();
})();
