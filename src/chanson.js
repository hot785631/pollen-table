// “Petit pollen” – an original instrumental musette with recorded acoustic instruments.
(() => {
  "use strict";
  const track = "petit-pollen.mp3";
  const muteKey = "pollen-table.music-muted.v1";
  const audio = document.createElement("audio");
  audio.loop = true;
  audio.preload = "none";
  audio.volume = .72;
  audio.hidden = true;
  document.body.append(audio);
  let muted = false;
  let started = false;
  let hidden = document.hidden;
  let pending = false;
  let revision = 0;
  try { muted = localStorage.getItem(muteKey) === "1"; } catch {}

  const app = document.getElementById("app");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "round-btn chanson-toggle";
  button.setAttribute("aria-label", "背景音乐");
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/><g class="sound-waves"><path d="M15.5 8.7a5 5 0 0 1 0 6.6M18.3 5.9a8.8 8.8 0 0 1 0 12.2"/></g><path class="quiet-mark" d="m16 9 5 6m0-6-5 6"/></svg>';
  function updateButton() {
    const active = !muted && !hidden && (pending || !audio.paused);
    button.setAttribute("aria-pressed",String(active));
    button.title = active ? "关闭音乐《Petit pollen》" : "播放音乐《Petit pollen》";
  }
  function transport() {
    const ticket = ++revision;
    if (!started || muted || hidden) {
      pending = false;
      audio.pause();
      updateButton();
      return;
    }
    if (!audio.hasAttribute("src")) audio.src = track;
    if (audio.error) audio.load();
    pending = true;
    updateButton();
    // play() is called synchronously inside the initiating tap for iOS.
    const play = audio.play();
    const settled = () => {
      if (ticket === revision) {
        pending = false;
        updateButton();
      }
    };
    if (play) play.then(settled, settled);
    else settled();
  }
  function mountButton() {
    if (app.contains(button)) return;
    const actions = app.querySelector(".mast-actions, .setup-start>.row");
    if (actions) { actions.prepend(button); return; }
    const help = app.querySelector(".mast>[data-do='help']");
    if (help) {
      const both = document.createElement("span");
      both.className = "chanson-tools";
      help.replaceWith(both);
      both.append(button,help);
    }
  }
  updateButton();
  mountButton();
  new MutationObserver(mountButton).observe(app,{childList:true});
  audio.addEventListener("playing",updateButton);
  audio.addEventListener("pause",updateButton);
  audio.addEventListener("error",updateButton);
  button.addEventListener("click", () => {
    muted = !muted && (pending || !audio.paused);
    started = true;
    try { localStorage.setItem(muteKey,muted ? "1" : "0"); } catch {}
    transport();
  });
  function unlock(event) {
    if (button.contains(event.target) || event.isComposing ||
        (event.type === "keydown" && !["Enter"," "].includes(event.key))) return;
    if (!started || (!muted && !pending && audio.paused)) {
      started = true;
      transport();
    }
  }
  document.addEventListener("click",unlock,true);
  document.addEventListener("keydown",unlock,true);
  function pageState(isHidden) {
    if (hidden === isHidden) return;
    hidden = isHidden;
    transport();
  }
  document.addEventListener("visibilitychange", () => pageState(document.hidden));
  window.addEventListener("pagehide", () => pageState(true));
  window.addEventListener("pageshow", () => pageState(document.hidden));
})();
