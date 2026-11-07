/* The same plates are used on the choosing screen, the cards and the table. */
(function (root) {
  'use strict';
  const stroke = 'stroke-linecap="round" stroke-linejoin="round"';
  const shapes = {
    ant: `<g fill="none" stroke="#573c32" stroke-width="4.4">
      <path d="M59 53 44 41 29 43M65 56 55 36 51 30M71 58 78 40 91 35"/>
      <path d="M59 58 41 68 35 82 28 83M65 59 58 74 60 87 54 89M72 57 81 72 95 74"/>
    </g>
    <path d="M49 52Q59 49 66 54L65 60Q56 56 47 61Z" fill="#693c30"/>
    <path d="M19 48Q23 35 38 35Q51 35 53 46Q55 59 43 65Q27 72 16 65Q11 59 19 48Z" fill="#ad4f36" stroke="#57382f" stroke-width="2.7"/>
    <path d="M17 59Q19 47 28 43Q37 38 45 42Q33 43 25 51Z" fill="#e79460"/>
    <path d="M37 62Q48 58 49 50" fill="none" stroke="#83442f" stroke-width="2"/>
    <path d="M54 48Q59 41 68 45Q81 49 76 58Q70 65 60 60Q52 57 54 48Z" fill="#be613d" stroke="#57382f" stroke-width="2.7"/>
    <path d="m68 48 9-3 4 7-8 4" fill="#83432f"/>
    <path d="M81 39 77 27 81 17M88 38 95 23 108 21" fill="none" stroke="#54392f" stroke-width="3.3"/>
    <path d="M74 45Q74 34 85 33Q98 31 103 40Q106 50 98 58Q88 65 81 58Q74 54 74 45Z" fill="#ca6d46" stroke="#57382f" stroke-width="2.7"/>
    <path d="M95 55Q101 57 107 51Q106 58 100 60" fill="#653b2d"/>
    <path d="M79 42Q82 35 88 36" fill="none" stroke="#efac78" stroke-width="3"/>
    <circle cx="96" cy="45" r="4.4" fill="#2e3530"/><circle cx="97.4" cy="43.5" r="1.4" fill="#fff3d9"/>`,
    beetle: `<g fill="none" stroke="#3e4035" stroke-width="4">
      <path d="m51 51-16-15-8 1M62 48l-8-16 4-7M73 47l6-14 9-2"/>
      <path d="m49 64-14 9-12 2-2 5m40-16-4 12-13 9m31-24 8 12 12 2"/>
    </g>
    <path d="M18 45Q27 32 45 33Q64 33 67 49Q71 66 52 73Q32 81 17 67Q10 56 18 45Z" fill="#995238" stroke="#3f3c30" stroke-width="3"/>
    <path d="M17 60Q13 46 28 39Q44 31 56 41Q41 36 31 45Q24 51 22 61Z" fill="#d38a55"/>
    <path d="M17 64Q37 47 60 44" fill="none" stroke="#684733" stroke-width="2.5"/>
    <g fill="none" stroke="#ca8150" stroke-width="1.8"><path d="M22 65q9-8 20-11m-13 13q8-6 16-9m-8 10 9-5"/></g>
    <path d="M56 40Q67 31 78 38Q87 44 80 57Q73 67 60 65Q54 61 58 54Q61 47 56 40Z" fill="#554c39" stroke="#3d3d31" stroke-width="2.8"/>
    <path d="M62 40Q70 37 76 41" fill="none" stroke="#c29967" stroke-width="3"/>
    <path d="M76 48Q79 41 88 43Q98 44 98 52Q98 59 89 62Q78 64 74 58Z" fill="#564334" stroke="#343a31" stroke-width="2.6"/>
    <path d="M88 47Q93 39 101 33Q109 26 108 15L113 21 118 15Q121 29 108 39L96 53Z" fill="#524738" stroke="#343a31" stroke-width="2.2"/>
    <path d="M74 40q13-7 16-16l3 6q-1 9-12 16Z" fill="#5a513e" stroke="#343a31" stroke-width="1.8"/>
    <circle cx="91" cy="52" r="3.2" fill="#262f28"/><circle cx="92" cy="51" r="1" fill="#fff4ca"/>`,
    bee: `<g fill="none" stroke="#524536" stroke-width="3.6">
      <path d="m56 57-12 11-9 1m29-11-6 11-8 6m20-15 7 10 10 2"/>
      <path d="m51 63-6 13-10 5m25-18 3 14-7 6m17-20 10 13 8 1"/>
    </g>
    <path d="M58 46Q42 33 39 20Q39 10 48 12Q63 16 70 42Z" fill="#bfdad1" stroke="#5f827b" stroke-width="2.5"/>
    <path d="M19 49Q28 40 43 41Q63 42 69 54Q71 66 52 73Q33 78 20 67L12 60 18 57Z" fill="#e8ae46" stroke="#4d4635" stroke-width="2.7"/>
    <g fill="#5f513a"><path d="M29 44q-6 14 0 28l-7-4q-5-10 0-20Z"/><path d="M43 42q-5 15 2 31l-8 1q-7-14-2-31Z"/><path d="M56 46q-2 13 5 23l-6 3q-9-14-6-28Z"/></g>
    <path d="M57 48Q37 43 24 32Q17 24 24 19Q35 12 50 27Q56 33 64 45Z" fill="#e0ede0" stroke="#658a7c" stroke-width="2.7"/>
    <path d="m26 23 32 21m-18-14-1-7" fill="none" stroke="#a0c1af" stroke-width="2"/>
    <path d="M60 46q6-8 12-4l4-3 2 5 5 2-2 4q5 11-5 17l-2-1-4 4-2-4q-12 0-13-9l-3-1 4-4Z" fill="#d5a14b" stroke="#6c573b" stroke-width="2.2"/>
    <path d="m82 45-2-10 5-6m5 15 7-12 7-1" fill="none" stroke="#4e4736" stroke-width="3.2"/>
    <path d="M77 48Q80 39 90 41Q102 41 105 53Q105 64 95 66Q83 69 78 61Q73 55 77 48Z" fill="#e8b64e" stroke="#554b36" stroke-width="2.8"/>
    <ellipse cx="97" cy="53" rx="4.1" ry="5.1" fill="#303a32"/><circle cx="98" cy="51.3" r="1.3" fill="#fff5de"/>`,
    spider: `<g class="spider-legs" fill="none" stroke="#355254" stroke-width="4.7">
      <path d="M58 53 45 38 38 19 27 13"/>
      <path d="M56 56 35 44 19 48 8 44"/>
      <path d="M55 59 31 57 19 69 8 69"/>
      <path d="M57 63 36 68 27 83 18 87"/>
      <path d="M70 53 83 38 90 19 101 13"/>
      <path d="M72 56 93 44 109 48 120 44"/>
      <path d="M73 59 97 57 109 69 120 69"/>
      <path d="M71 63 92 68 101 83 110 87"/>
    </g>
    <g fill="none" stroke="#c99862" stroke-width="3.1">
      <path d="m40 26 2 5m-19 16 5-1m-7 21 5-5m3 17 4-6m55-47-2 5m19 16-5-1m7 21-5-5m-3 17-4-6"/>
    </g>
    <path d="M65 56Q53 55 47 47Q38 35 45 23Q50 15 63 15Q78 14 84 26Q90 38 80 49Q73 56 65 56Z" fill="#567c79" stroke="#354f52" stroke-width="3"/>
    <path d="M47 28q6-10 18-9l-9 7-4 10Z" fill="#97b0a0"/>
    <path d="m64 22 5 6 8 1-5 5-8-2-8 2-5-5 8-1Z" fill="#edbf78"/>
    <path d="m56 39 8-3 8 3-8 3Z" fill="#d7b77c"/>
    <path d="M50 54Q53 48 64 47Q76 47 80 56Q83 66 74 73Q64 78 54 72Q46 66 50 54Z" fill="#658986" stroke="#345153" stroke-width="2.8"/>
    <g fill="#354953"><circle cx="58" cy="64" r="4.1"/><circle cx="70" cy="64" r="4.1"/><circle cx="52.7" cy="60.5" r="1.8"/><circle cx="75.3" cy="60.5" r="1.8"/></g>
    <g fill="#f1edce"><circle cx="57" cy="62.7" r="1.3"/><circle cx="69" cy="62.7" r="1.3"/></g>
    <path d="M61 72q0 4 3 5 3-1 3-5" fill="#526c69" stroke="#3f5956" stroke-width="1.6"/>`,
    butterfly: `<g stroke="#444568" stroke-width="2.8">
      <path d="M60 49Q42 29 18 15Q8 8 10 22L15 42Q19 53 44 60Q28 54 21 63Q16 71 25 78L30 80Q32 87 39 84Q48 92 59 76L65 58Z" fill="#7774b6"/>
      <path d="M68 49Q85 29 110 15Q121 8 118 22L113 42Q109 53 84 60Q101 54 107 63Q112 71 103 78L98 80Q96 87 89 84Q80 92 69 76L63 58Z" fill="#7774b6"/>
    </g>
    <g fill="#94c9d3"><path d="M17 23Q30 27 49 42L56 51Q34 45 23 36Z"/><path d="M21 41q18 6 35 14-9 1-18-2Z"/><path d="M111 23Q98 27 79 42L72 51q22-6 33-15Z"/><path d="M107 41q-18 6-35 14 9 1 18-2Z"/></g>
    <g fill="#b5a8ce"><path d="M29 62q11-5 28 0-6 13-16 18l1-7q-10 2-15-3Z"/><path d="M99 62q-11-5-28 0 6 13 16 18l-1-7q10 2 15-3Z"/></g>
    <g fill="#e5bb7a" stroke="#554d73" stroke-width="1.7"><ellipse cx="38" cy="66" rx="5.3" ry="4"/><ellipse cx="90" cy="66" rx="5.3" ry="4"/></g>
    <g fill="#ede6c9"><circle cx="16" cy="20" r="2.1"/><circle cx="18" cy="31" r="1.7"/><circle cx="112" cy="20" r="2.1"/><circle cx="110" cy="31" r="1.7"/></g>
    <g fill="none" stroke="#504765" stroke-width="2.1"><path d="M62 44 56 35m6 13-8-1m8 6-6 6m10-15 6-9m-6 13 8-1m-8 6 6 6"/><path d="M62 35Q58 24 53 22m13 13q4-11 9-13"/></g>
    <g fill="#4e475e"><circle cx="52" cy="21" r="2.3"/><circle cx="76" cy="21" r="2.3"/></g>
    <path d="M61 48Q59 65 64 79Q69 65 67 48Z" fill="#61567a" stroke="#46465e" stroke-width="2"/>
    <ellipse cx="64" cy="46" rx="5.9" ry="10" fill="#5a536d" stroke="#43465d" stroke-width="2.1"/>
    <circle cx="64" cy="36" r="5.2" fill="#635c73" stroke="#43465d" stroke-width="1.8"/>
    <path d="m63 42-1 7" fill="none" stroke="#b4a9bf" stroke-width="2.2"/>`
  };
  function bug(t) {
    return '<svg class="bug-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 98" '+stroke+'>'+(shapes[t]||shapes.ant)+'</svg>';
  }
  const pupaShape=`<path d="M6 12Q27 9 56 9" fill="none" stroke="#735f46" stroke-width="3.5"/>
    <path d="M42 9q7-8 15-6-4 7-15 6Z" fill="#8cab79" stroke="#58775b" stroke-width="1.6"/>
    <path d="m29 10 2 7 3-7" fill="#ede6cc" stroke="#6f7965" stroke-width="1.8"/>
    <path d="M31 15q-1 7-7 13-6 6-7 15-2 11 6 18l7 5 8-6q7-6 9-15l-2-13-7-8-4-9Z" fill="#75aaa5" stroke="#375d5e" stroke-width="2.8"/>
    <path d="M34 25q-9 12-13 20 0 8 6 13l6-18 9-8Z" fill="#abd3bb"/>
    <path d="m21 45 13-8 8-5m-9 6-3 17 9-8" fill="none" stroke="#558582" stroke-width="1.8"/>
    <path d="M25 29q8 4 17 2" fill="none" stroke="#476e6c" stroke-width="2.1"/>
    <g fill="#f4d68c"><circle cx="26" cy="28.5" r="1.6"/><circle cx="31" cy="30.3" r="1.5"/><circle cx="36" cy="30.8" r="1.5"/><circle cx="41" cy="30.2" r="1.25"/></g>`;
  function cocoon(){
    return '<svg class="cocoon-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 62 70" '+stroke+'>'+pupaShape+'</svg>';
  }
  const webMesh='<g fill="none" stroke="#456d71" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="M16 16 3 4m13 12L16 1m0 15L29 3M16 16l15-1m-15 1 14 12m-14-12 1 15m-1-15L4 29m12-13L1 17" stroke-width="1.7"/>'+
    '<path d="M4 5Q10 8 16 3q5 5 12 1 0 7 2 11-4 7-1 12-7-1-12 3-6-4-12-2 2-6-3-11Q7 12 4 5Z" stroke-width="1.65"/>'+
    '<path d="M9 10q3 1 7-2 3 3 7 1-1 4 1 7-2 3 0 6-4 0-8 3-3-2-6-1 0-4-3-7 3-3 2-7Z" stroke-width="1.5"/></g>'+
    '<g fill="#e5bf7e" stroke="#6b8179" stroke-width=".6"><circle cx="9" cy="10" r="1.7"/><circle cx="23.8" cy="22" r="1.6"/></g>';
  const pollenCluster='<g stroke="#8e6628" stroke-width="1.6"><circle cx="16" cy="11" r="7" fill="#ffdb7b"/><circle cx="10.8" cy="19.2" r="6.8" fill="#eeb850"/><circle cx="21.1" cy="19.2" r="6.8" fill="#f9cc66"/></g><path d="m14.4 8 2-1m3 10.3 2-1" fill="none" stroke="#fff4c5" stroke-width="2"/>';
  const noHarvestMark='<circle cx="16" cy="16" r="14.5" fill="#fff7dd" stroke="#9a6244" stroke-width="1.7"/>'+
    '<g transform="translate(3 3) scale(.82)">'+pollenCluster+'</g>'+
    '<path d="M5.8 26.2 26.2 5.8" stroke="#fff7dd" stroke-width="5.8"/><path d="M5.8 26.2 26.2 5.8" stroke="#97482d" stroke-width="3.2"/>';
  const glyphs = {
    web:webMesh,
    noHarvest:noHarvestMark,
    supply:'<g stroke="#365f6b" stroke-width="1.7"><path d="m3 8 11-4 6 16-11 4Z" fill="#c6e8df"/><rect x="13" y="4" width="12" height="17" rx="2" fill="#edf8e8"/></g><path d="M21 13v14m-6-6 6 6 7-7" fill="none" stroke="#296879" stroke-width="3.3"/>',
    drawStack:'<g stroke="#365a47" stroke-width="1.7"><path d="m5 23 15 3 7-3v3l-7 3-15-3Z" fill="#a5bb8b"/><path d="m5 19 15 3 7-3v3l-7 3-15-3Z" fill="#c1d1a5"/><path d="M5 17 11 4l15 3-6 13Z" fill="#719d7f"/></g><path d="m11 13 8-3" stroke="#f0eed2" stroke-width="2.1"/>',
    discardTray:'<path d="m10 5 13 2-3 14-13-2Z" fill="#f4d1a2" stroke="#8a6343" stroke-width="1.9"/><path d="M4 17h5l3 5h8l3-5h5l-2 11H6Z" fill="#d2a976" stroke="#795539" stroke-width="1.9"/>',
    handBack:'<g fill="#a9bea0" stroke="#456951" stroke-width="1.7"><path d="m3 10 9-5 9 17-9 5Z"/><path d="m11 6 10-1 3 20-10 1Z"/><path d="m17 6 10 2-3 19-10-2Z"/></g>',
    sun:'<g fill="none" stroke="#825820" stroke-width="2.4"><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/></g><circle cx="16" cy="16" r="8.5" fill="#ffd365" stroke="#865d23" stroke-width="1.9"/>',
    force:'<g fill="currentColor" transform="rotate(13 16 16)"><ellipse cx="16" cy="15.7" rx="6.6" ry="8"/><path d="M11.7 23q4.5 1.7 8.8-.2l-.7 3.2q-1.4 4.2-5.7 2.5-2.6-1.2-2.4-5.5Z"/><ellipse cx="11" cy="6.2" rx="2.1" ry="3"/><ellipse cx="16.6" cy="4.5" rx="2.1" ry="3.3"/><ellipse cx="21.6" cy="6.3" rx="1.7" ry="2.7"/></g>',
    bump:'<path d="m19 3-5 10 10-3-5 8 8 2-18 10 5-10-10 1 7-9-5-1Z" fill="#ef9661" stroke="#874632" stroke-width="1.8"/>',
    pollen:pollenCluster,
    flower:'<g fill="#bc9bd1" stroke="#735689" stroke-width="1.2"><path d="M16 9c-7-12-15-3-9 4-13 1-9 13 1 11 0 11 12 11 13 1 11 3 16-8 6-12 3-10-7-13-11-4Z"/></g><circle cx="16" cy="17" r="4.4" fill="#ffe4a0"/>',
    leaf:'<path d="M4 25Q1 5 27 5Q28 29 8 27Z" fill="#8dc5a7" stroke="#3e715b" stroke-width="2"/><path d="m5 28 17-17m-9 9 1-7m3 4 5-1" fill="none" stroke="#3e715b" stroke-width="1.7"/>',
    pass:'<path d="m4 8 12 8-12 8Zm12 0 12 8-12 8Z" fill="currentColor"/>',
    check:'<path d="m5 16 7 7L27 8" fill="none" stroke="currentColor" stroke-width="4.4"/>',
    back:'<path d="m13 6-9 9 9 9m-8-9h13q8 0 9 9" fill="none" stroke="currentColor" stroke-width="3"/>',
    arrow:'<path d="M4 16h23m-9-9 9 9-9 9" fill="none" stroke="currentColor" stroke-width="3"/>',
    speaker:'<path d="M4 12h6l7-6v20l-7-6H4Z" fill="currentColor"/><path d="M21 11q6 5 0 10m4-14q10 9 0 18" stroke="currentColor" stroke-width="2.2" fill="none"/>',
    play:'<path d="M9 5v22l17-11Z" fill="currentColor"/>'
  };
  function icon(k) {return k==='cocoon'?cocoon():shapes[k]?bug(k):'<svg class="glyph" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" '+stroke+'>'+(glyphs[k]||'')+'</svg>';}
  function miniature(t,x,y,w,h,flip=false) {
    return '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" viewBox="0 0 128 98"><g '+(flip?'transform="translate(128 0) scale(-1 1)"':'')+'>'+shapes[t]+'</g></svg>';
  }
  function skill(t) {
    const arrow='<path d="M29 18Q47 3 64 14m-4-8 6 9-10 1" fill="none" stroke="#675379" stroke-width="3.2"/>';
    let inner;
    if(t==='ant') inner=miniature(t,0,16,52,44)+miniature(t,52,26,33,30,true)+arrow;
    else if(t==='beetle') inner=miniature(t,-5,17,48,39)+miniature('ant',32,22,35,29)+miniature('ant',65,25,25,24,true)+
      '<g fill="none" stroke="#675379" stroke-width="2.5"><path d="M46 23q15-17 31-5m-2-6 4 8-9 1"/><path d="M76 46q-12 10-26 1m1 6-4-8 8-1"/></g>';
    else if(t==='spider') inner='<path d="M39 28Q41 7 59 4q13-3 26-1-4 23-21 27-13 3-25-2Z" fill="#e1ebce" stroke="#a3b390" stroke-width="1.3"/>'+
      miniature('bee',39,-2,44,33,true)+
      '<svg x="48" y="0" width="37" height="31" viewBox="0 0 32 32" opacity=".62">'+webMesh+'</svg>'+
      '<svg x="70" y="27" width="17" height="17" viewBox="0 0 32 32">'+noHarvestMark+'</svg>'+
      '<path d="M5 25 30 20 37 49 12 56Z" fill="#e6d8ec" stroke="#957e9f" stroke-width="1.9"/>'+
      miniature(t,3,22,35,30)+
      '<path d="M27 35Q39 19 51 20m-5-4 6 4-6 5" fill="none" stroke="#58777a" stroke-width="2.4"/>';
    else if(t==='butterfly') inner='<path d="M4 39q5-8 29-7-8 9-29 7Z" fill="#dbe5c8" stroke="#9aa986" stroke-width="1.1"/>'+
      miniature(t,-1,4,43,34)+
      '<svg x="17" y="29" width="22" height="27" viewBox="0 0 62 70">'+pupaShape+'</svg>'+
      '<svg x="-1" y="36" width="17" height="17" viewBox="0 0 32 32">'+glyphs.pollen+'</svg>'+
      '<path d="M10 54q5 2 11-4m-5 0 6-1-1 5" fill="none" stroke="#a57037" stroke-width="2"/>'+
      '<path d="M38 33q3 10 10 11 7 1 10-6m-5 1 6-3 2 7" fill="none" stroke="#685d8a" stroke-width="2.6"/>'+
      miniature(t,49,5,44,37);
    else inner='<g fill="#f2e1c0" stroke="#938553" stroke-width="1.6"><path d="M13 36q-11-11-13 0-3 6 5 8-2 8 7 10 9 2 10-6 10-1 8-9-2-8-12-6Z"/><path d="M66 34q-11-11-13 0-3 6 5 8-2 8 7 10 9 2 10-6 10-1 8-9-2-8-12-6Z"/></g><path d="M13 30Q29 6 52 17" fill="none" stroke="#967e53" stroke-width="2" stroke-dasharray="3 4"/>'+miniature('bee',27,0,39,31)+'<circle cx="58" cy="26" r="5" fill="#eab350" stroke="#8d692e" stroke-width="1.5"/><path d="m64 26 4 5 1-7" fill="none" stroke="#675379" stroke-width="2.5"/><circle cx="69" cy="39" r="4" fill="#efbf54" stroke="#997337"/>';
    return '<svg class="skill-svg" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 90 60" '+stroke+'>'+inner+'</svg>';
  }
  const art = {bug,icon,skill,cocoon};
  root.PollenArt = art;
  if (typeof module === 'object' && module.exports) module.exports=art;
})(typeof window === 'object' ? window : globalThis);
