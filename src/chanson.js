// “Petit pollen” — an original miniature chanson for reeds, guitar, bass and voice.
(() => {
  "use strict";
  const beat = 60 / 110;
  const barTime = 3 * beat;
  const noteHz = n => 440 * Math.pow(2, (n - 69) / 12);
  // Guitar voicings are kept close together, as on the middle four strings.
  const chords = {
    Dm: [38, 53, 57, 62], Gm: [43, 55, 58, 62], A7: [45, 55, 61, 64],
    Bb: [34, 53, 58, 62], F: [41, 53, 57, 60], C7: [36, 52, 58, 60],
    Ed: [40, 55, 58, 62], D7: [38, 54, 57, 60], Gm6: [43, 52, 58, 62]
  };
  // Each bar contains one harmony followed by [pitch, beats, optional sung syllable].
  // A zero pitch is a rest. The opening voice is the accordion; the refrain is sung.
  const intro = [
    ["Dm", [0, 1], [69, .5], [68, .5], [69, 1]],
    ["Gm", [70, 1.5], [67, .5], [65, 1]],
    ["Ed", [64, 1], [67, 1], [70, 1]],
    ["A7", [69, 1.5], [0, .5], [64, .5], [61, .5]]
  ];
  const verse = [
    ["Dm", [62, 1.5], [65, .5], [69, 1]],
    ["Dm", [72, .75], [71, .25], [69, 1], [65, 1]],
    ["Gm", [67, 1], [70, 1.5], [69, .5]],
    ["A7", [64, 2], [61, .5], [64, .5]],
    ["Dm", [65, 1.5], [67, .5], [69, 1]],
    ["Bb", [70, 1], [74, .5], [72, .5], [70, 1]],
    ["Ed", [67, 1], [64, 1], [65, .5], [67, .5]],
    ["A7", [69, 2], [0, .5], [67, .5]]
  ];
  // Danse, danse, petit pollen, au soleil du matin.
  // Vole, vole, petite reine, sur le bord du chemin.
  const refrain = [
    ["F", [69, 1, "danse"], [67, 1, "danse"], [65, .5, "pe"], [67, .5, "tit"]],
    ["C7", [67, 1, "pol"], [64, 1.5, "len"], [0, .5]],
    ["F", [65, .5, "au"], [67, .5, "so"], [69, 1, "leil"], [72, 1, "du"]],
    ["D7", [69, 1, "ma"], [66, 1.5, "tin"], [0, .5]],
    ["Gm", [70, 1, "vole"], [69, 1, "vole"], [67, .5, "pe"], [69, .5, "tite"]],
    ["Dm", [65, 2.5, "reine"], [0, .5]],
    ["Ed", [67, .5, "sur"], [65, .5, "le"], [64, 1, "bord"], [62, 1, "du"]],
    ["A7", [64, 1, "che"], [61, 1.5, "min"], [0, .5]]
  ];
  const reply = [
    ["Dm", [62, 1], [65, .5], [69, .5], [72, 1]],
    ["F", [77, 1], [76, .5], [74, .5], [72, 1]],
    ["Gm", [70, 1.5], [69, .5], [67, 1]],
    ["A7", [64, 2], [61, .5], [64, .5]],
    ["Dm", [65, .5], [69, .5], [72, 1], [74, 1]],
    ["Bb", [74, 1.5], [72, .5], [70, 1]],
    ["Gm6", [67, 1], [64, .5], [65, .5], [67, 1]],
    ["A7", [69, 1.5], [0, .5], [64, .5], [67, .5]]
  ];
  const coda = [
    ["Dm", [62, 1.5], [65, .5], [69, 1]],
    ["Gm", [70, 1], [67, 1], [65, 1]],
    ["A7", [64, 1], [61, .5], [64, .5], [67, 1]],
    ["Dm", [65, 1], [62, 1.8], [0, .2]]
  ];
  const score = [...intro, ...refrain, ...verse, ...reply, ...refrain, ...coda];

  // Approximate French vowel colours and consonant envelopes for the sung refrain.
  const vowels = {
    a:[780,1450,2700], an:[645,1040,2480], oe:[520,1500,2550],
    i:[310,2380,3140], o:[475,860,2430], oh:[565,1050,2470],
    e:[515,1920,2820], u:[335,1710,2450], in:[560,1680,2670]
  };
  const syllables = {
    danse:["d","an","s"], pe:["p","oe"], tit:["t","i"], pol:["p","oh","l"],
    len:["l","e","n"], au:["","o"], so:["s","o"], leil:["l","e","y"], du:["d","u"],
    ma:["m","a"], tin:["t","in"], vole:["v","oh","l"], tite:["t","i","t"],
    reine:["r","e","n"], sur:["s","u","r"], le:["l","oe"], bord:["b","oh","r"],
    che:["sh","oe"], min:["m","in"]
  };
  const muteKey = "pollen-table.music-muted.v1";
  let muted = false;
  try { muted = localStorage.getItem(muteKey) === "1"; } catch {}
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;

  let ctx, mix, reedWave, glottis, breath, mutedByPage = false, userStarted = false;
  let timer = 0, nextBar = 0, nextAt = 0, requestId = 0;
  const strings = new Map();
  let seed = 17011;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function wave(harmonics) {
    return ctx.createPeriodicWave(new Float32Array(harmonics.length), Float32Array.from(harmonics));
  }
  function unplug(nodes) { nodes.forEach(node => node.disconnect()); }
  function init() {
    ctx = new Audio();
    mix = ctx.createGain();
    mix.gain.value = .57;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -17;
    limiter.knee.value = 12;
    limiter.ratio.value = 3;
    mix.connect(limiter).connect(ctx.destination);
    const room = ctx.createDelay();
    const reflected = ctx.createGain();
    room.delayTime.value = .077;
    reflected.gain.value = .11;
    mix.connect(room).connect(reflected).connect(limiter);
    reedWave = wave([0,1,.43,.26,.17,.19,.085,.065,.095,.04,.035,.045,.028,.021]);
    glottis = wave(Array.from({length:42}, (_, i) => i ? Math.pow(i,-.99) : 0));
    breath = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .18), ctx.sampleRate);
    const noise = breath.getChannelData(0);
    for (let i=0; i<noise.length; i++) noise[i] = 2*random()-1;
  }
  function envelope(gain, at, length, attack, level, hold = .8) {
    const p = gain.gain;
    p.setValueAtTime(.0001, at);
    p.exponentialRampToValueAtTime(level, at+attack);
    p.linearRampToValueAtTime(level*hold, at+Math.max(attack,length-.08));
    p.exponentialRampToValueAtTime(.0001, at+length);
  }
  function accordion(pitch, at, length, level) {
    const amp = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2520;
    tone.Q.value = .55;
    tone.connect(amp).connect(mix);
    envelope(amp,at,length,Math.min(.057,length/3),level);
    const reeds = [-4.5,4.5].map(cents => {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(reedWave);
      osc.frequency.value = noteHz(pitch);
      osc.detune.value = cents;
      osc.connect(tone);
      osc.start(at);
      osc.stop(at+length+.008);
      return osc;
    });
    reeds[1].onended = () => unplug([...reeds,tone,amp]);
  }
  function guitar(pitch, at, level) {
    if (!strings.has(pitch)) {
      const rate = 22050;
      const period = Math.max(2,Math.round(rate/noteHz(pitch)-.5));
      const line = Float32Array.from({length:period}, () => 2*random()-1);
      const buffer = ctx.createBuffer(1,rate,rate);
      const data = buffer.getChannelData(0);
      // Average adjacent samples on every trip around the virtual string.
      for (let i=0; i<data.length; i++) {
        const j = i%period;
        data[i] = line[j];
        line[j] = .496 * (line[j]+line[(j+1)%period]);
      }
      strings.set(pitch,{buffer,tune:noteHz(pitch)*(period+.5)/rate});
    }
    const sample = strings.get(pitch);
    const src = ctx.createBufferSource();
    const amp = ctx.createGain();
    src.buffer = sample.buffer;
    src.playbackRate.value = sample.tune;
    envelope(amp,at,.51,.006,level,.38);
    src.connect(amp).connect(mix);
    src.start(at);
    src.stop(at+.52);
    src.onended = () => unplug([src,amp]);
  }
  function bass(pitch, at, length, level) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(noteHz(pitch)*1.012,at);
    osc.frequency.exponentialRampToValueAtTime(noteHz(pitch),at+.04);
    tone.frequency.value = 430;
    tone.Q.value = .5;
    envelope(amp,at,length,.015,level,.36);
    osc.connect(tone).connect(amp).connect(mix);
    osc.start(at);
    osc.stop(at+length+.01);
    osc.onended = () => unplug([osc,tone,amp]);
  }
  function consonant(sound, at, duration, level) {
    if (!["s","sh","t","p","v","r","d","b"].includes(sound)) return;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    src.buffer = breath;
    filter.type = "bandpass";
    filter.frequency.value = ({s:5700,sh:2700,t:4300,p:1300,v:1530,r:1100,d:1900,b:950})[sound];
    filter.Q.value = .85;
    envelope(amp,at,duration,.004,level,.42);
    src.connect(filter).connect(amp).connect(mix);
    src.start(at);
    src.stop(at+duration+.001);
    src.onended = () => unplug([src,filter,amp]);
  }
  function sing(pitch, at, length, text) {
    const [initial, vowel, final] = syllables[text];
    const hiss = initial === "s" || initial === "sh";
    const attack = hiss ? .066 : initial ? .029 : .01;
    consonant(initial,at,hiss ? .077 : .031,hiss ? .091 : .049);
    if (final) consonant(final,at+length-.061,.058,.066);
    const voice = ctx.createOscillator();
    const amp = ctx.createGain();
    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    voice.setPeriodicWave(glottis);
    voice.frequency.setValueAtTime(noteHz(pitch)*.989,at);
    voice.frequency.exponentialRampToValueAtTime(noteHz(pitch),at+.073);
    vib.frequency.value = 5.1;
    depth.gain.setValueAtTime(.1,at);
    depth.gain.linearRampToValueAtTime(13,at+Math.min(.29,length*.8));
    vib.connect(depth).connect(voice.detune);
    amp.connect(mix);
    envelope(amp,at+attack,length-attack,.036,.26,.89);
    const nodes = [voice,amp,vib,depth];
    const formants = vowels[vowel];
    formants.forEach((hz,i) => {
      const f = ctx.createBiquadFilter();
      const partial = ctx.createGain();
      f.type = "bandpass";
      f.Q.value = [2.4,4.7,6.5][i];
      const closed = ["m","b","p"].includes(initial);
      f.frequency.setValueAtTime(closed && !i ? hz*.64 : hz,at);
      f.frequency.linearRampToValueAtTime(hz,at+.08);
      const endHz = final === "n" || final === "l" ? hz*(i===0?.70:.91) : final==="y" ? vowels.i[i] : hz;
      f.frequency.setValueAtTime(hz,at+length*.7);
      f.frequency.linearRampToValueAtTime(endHz,at+length);
      partial.gain.value = [1.35,.94,.56][i];
      voice.connect(f).connect(partial).connect(amp);
      nodes.push(f,partial);
    });
    vib.start(at);
    voice.start(at);
    vib.stop(at+length+.005);
    voice.stop(at+length+.01);
    voice.onended = () => unplug(nodes);
  }
  function playBar(index, at) {
    const [chord, ...melody] = score[index];
    const isRefrain = melody.some(note => note[2]);
    const [root, ...voicing] = chords[chord];
    bass(root,at,beat*1.38,.31);
    if (index%4===3 && index!==score.length-1) bass(root+7,at+2.48*beat,.40*beat,.17);
    // A light down–up offbeat strum provides the three-step musette pulse.
    for (let stroke=1; stroke<=2; stroke++) {
      const order = stroke===1 ? voicing : [...voicing].reverse();
      order.forEach((p,i) => guitar(p,at+stroke*beat+.014+i*.012,stroke===1?.27:.22));
    }
    let ticks = 0;
    for (const [pitch, count, lyric] of melody) {
      const start = at+ticks*beat;
      const length = beat*count*(count<1?.92:.955);
      if (lyric) sing(pitch,start,length,lyric);
      else if (pitch) accordion(pitch,start,length,count<1?.097:.111);
      // The reeds answer in the spaces between sung phrases.
      if (!pitch && isRefrain && count===.5) {
        accordion(voicing[1]+12,start,length,.062);
      }
      ticks += count;
    }
  }
  function schedule() {
    if (!ctx || ctx.state !== "running" || muted || mutedByPage) return;
    const now = ctx.currentTime;
    if (nextAt < now) nextAt = now+.04;
    while (nextAt <= now+.28) {
      playBar(nextBar, nextAt);
      nextAt += barTime;
      nextBar = (nextBar+1)%score.length;
    }
  }
  function setTransport() {
    const id = ++requestId;
    clearInterval(timer);
    if (muted || mutedByPage || !userStarted) {
      if (ctx && ctx.state !== "suspended") ctx.suspend().catch(() => {});
      return;
    }
    try { if (!ctx) init(); } catch { return; }
    ctx.resume().then(() => {
      if (id!==requestId || muted || mutedByPage || ctx.state!=="running") return;
      schedule();
      timer = setInterval(schedule,125);
    }).catch(() => {});
  }

  const app = document.getElementById("app");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "round-btn chanson-toggle";
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9h4l5-4v14l-5-4H3z"/><g class="sound-waves"><path d="M15.5 8.7a5 5 0 0 1 0 6.6M18.3 5.9a8.8 8.8 0 0 1 0 12.2"/></g><path class="quiet-mark" d="m16 9 5 6m0-6-5 6"/></svg>';
  function updateButton() {
    const playing = userStarted && !muted;
    button.setAttribute("aria-pressed",String(playing));
    button.setAttribute("aria-label","背景音乐");
    button.title = playing ? "关闭音乐《Petit pollen》" : "播放音乐《Petit pollen》";
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
  button.addEventListener("click", () => {
    muted = userStarted ? !muted : false;
    userStarted = true;
    try { localStorage.setItem(muteKey,muted ? "1" : "0"); } catch {}
    updateButton();
    setTransport();
  });
  function unlock(event) {
    if (button.contains(event.target) || event.isComposing ||
        (event.type==="keydown" && !["Enter"," "].includes(event.key))) return;
    if (!userStarted || (!muted && ctx && ctx.state !== "running")) {
      userStarted = true;
      updateButton();
      setTransport();
    }
  }
  document.addEventListener("click",unlock,true);
  document.addEventListener("keydown",unlock,true);
  function pageState(hidden) {
    if (hidden===mutedByPage) return;
    mutedByPage = hidden;
    setTransport();
  }
  document.addEventListener("visibilitychange", () => pageState(document.hidden));
  window.addEventListener("pagehide", () => pageState(true));
  window.addEventListener("pageshow", () => pageState(document.hidden));
})();
