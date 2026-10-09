/* 方寸序章：粒子文字（canvas 2D，无第三方依赖）
   交互：成型 → 点击散开 → 完整重组后自动进入封面；散开过程中忽略连点；
   支持键盘跳过与减弱动效后备 */
(function () {
  'use strict';
  function ParticleIntro(opts) {
    var canvas = opts.canvas, text = opts.text, onDone = opts.onDone;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.color || '#222';
    var W = canvas.width, H = canvas.height;
    var parts = [], mouse = { x: -9999, y: -9999 };
    var phase = 'forming', t0 = performance.now(), scatterAt = 0, formedOnce = false, done = false, running = false;

    // 采样文字像素点
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    var octx = off.getContext('2d');
    octx.fillStyle = '#fff';
    octx.textAlign = 'center'; octx.textBaseline = 'middle';
    var size = W / Math.max(4, text.length) * 1.5;
    octx.font = '900 ' + size + 'px "Noto Sans SC", "Microsoft YaHei", sans-serif';
    octx.fillText(text, W / 2, H / 2);
    var data = octx.getImageData(0, 0, W, H).data;
    var gap = Math.max(4, Math.round(size / 58));
    for (var y = 0; y < H; y += gap) for (var x = 0; x < W; x += gap) {
      if (data[(y * W + x) * 4 + 3] > 128) parts.push(null);
    }
    parts = [];
    for (var y2 = 0; y2 < H; y2 += gap) for (var x2 = 0; x2 < W; x2 += gap) {
      if (data[(y2 * W + x2) * 4 + 3] > 128) {
        parts.push({
          tx: x2, ty: y2,
          x: W / 2 + (Math.random() - 0.5) * W * 1.4,
          y: H / 2 + (Math.random() - 0.5) * H * 1.4,
          vx: 0, vy: 0, j: Math.random() * Math.PI * 2
        });
      }
    }

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width * W;
      mouse.y = (e.clientY - r.top) / r.height * H;
    });
    canvas.addEventListener('mouseleave', function () { mouse.x = mouse.y = -9999; });
    canvas.addEventListener('click', function () {
      if (done || phase === 'scattered') return; // 散开过程中忽略连点
      phase = 'scattered'; scatterAt = performance.now();
      if (opts.onScatter) opts.onScatter();
      parts.forEach(function (p) {
        var a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 14;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      });
    });
    function skip() { if (!done) { done = true; running = false; onDone(); } }
    window.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'PageDown') skip();
    });
    if (reduce) { skip(); return; }

    function scatterAll() {
      parts.forEach(function (p) {
        var a = Math.random() * Math.PI * 2, s = 6 + Math.random() * 14;
        p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      });
    }
    function drawStatic() {
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) { ctx.fillRect(p.tx, p.ty, 3, 3); });
    }
    function restart() {
      phase = 'forming'; t0 = performance.now(); done = false;
      parts.forEach(function (p) {
        p.x = W / 2 + (Math.random() - 0.5) * W * 1.4;
        p.y = H / 2 + (Math.random() - 0.5) * H * 1.4;
        p.vx = 0; p.vy = 0;
      });
      if (reduce) { drawStatic(); return; }
      if (running) return;
      running = true;
      requestAnimationFrame(frame);
    }
    function stop() { running = false; done = true; }
    canvas.__fangcunIntro = { restart: restart, stop: stop };

    function frame(now) {
      if (done || !running) { running = false; return; }
      ctx.clearRect(0, 0, W, H);
      var allIn = true;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (phase === 'scattered') {
          p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94;
          if (now - scatterAt > 900) phase = 'reforming';
          ctx.fillRect(p.x, p.y, 2.6, 2.6);
        } else {
          // 鼠标透视弯曲：附近点被推开
          var dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
          var push = d2 < 25000 ? (25000 - d2) / 25000 : 0;
          var ox = push ? dx / Math.sqrt(d2 + 1) * push * 46 : 0;
          var oy = push ? dy / Math.sqrt(d2 + 1) * push * 46 : 0;
          p.x += (p.tx + ox - p.x) * (phase === 'reforming' ? 0.085 : 0.06);
          p.y += (p.ty + oy - p.y) * (phase === 'reforming' ? 0.085 : 0.06);
          var jx = Math.sin(now / 900 + p.j) * 0.7, jy = Math.cos(now / 1100 + p.j) * 0.7;
          // 鼠标附近的点不参与"是否聚齐"判定，避免指针悬停卡住进入
          var err = Math.abs(p.tx - p.x) + Math.abs(p.ty - p.y);
          if (push < 0.4 && err > 3) allIn = false;
          ctx.fillRect(p.x + jx, p.y + jy, 3, 3);
        }
      }
      ctx.globalAlpha = 1;
      if (phase === 'reforming' && allIn) {
        // 重组完成：回到可交互状态（可再次点击散开），首次聚拢后通知宿主显示进入按钮
        phase = 'formed';
        if (!formedOnce) { formedOnce = true; if (opts.onFormed) opts.onFormed(); }
      }
      if (phase === 'forming' && now - t0 > 6000) phase = 'formed';
      if (running) requestAnimationFrame(frame); else running = false;
    }
    running = true;
    requestAnimationFrame(frame);
  }
  window.FangcunIntro = ParticleIntro;
})();
