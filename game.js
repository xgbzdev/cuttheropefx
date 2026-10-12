(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restartBtn");
  const messageEl = document.getElementById("message");

  // High-DPI + proper mobile sizing
  let dpr = 1;
  let cssW = 0, cssH = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2 for performance
    cssW = window.innerWidth;
    cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", function () {
    resize();
    // re-init only if game already started so positions stay relative
  });
  resize();

  // Game state
  let candy, ropes, anchors, stars, monster, particles;
  let isCutting = false;
  let cutPath = [];
  let starsCollected = 0;
  let gameOver = false;
  let win = false;
  let lastTime = 0;

  // Tuned for mobile performance & feel
  const GRAVITY = 0.42;
  const FRICTION = 0.985;
  const BOUNCE = 0.55;
  const CANDY_RADIUS = 26;
  const ROPE_SEGMENTS = 8;          // fewer segments = faster
  const CONSTRAINT_ITERS = 4;       // fewer iterations = faster

  // Simple 2D helpers
  function Vec(x, y) {
    return { x: x || 0, y: y || 0 };
  }
  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Faster line-segment intersection (no allocations)
  function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    const abx = bx - ax, aby = by - ay;
    const cdx = dx - cx, cdy = dy - cy;
    const acx = cx - ax, acy = cy - ay;
    const den = abx * cdy - aby * cdx;
    if (Math.abs(den) < 1e-8) return false;
    const t = (acx * cdy - acy * cdx) / den;
    const u = (acx * aby - acy * abx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }

  function initLevel() {
    const w = cssW;
    const h = cssH;

    candy = {
      pos: Vec(w * 0.5, h * 0.20),
      vel: Vec(0, 0),
      radius: CANDY_RADIUS,
      attached: true
    };

    anchors = [
      { pos: Vec(w * 0.25, h * 0.07) },
      { pos: Vec(w * 0.75, h * 0.07) }
    ];

    ropes = anchors.map(function (anchor) {
      return createRope(anchor.pos, candy.pos);
    });

    stars = [
      { pos: Vec(w * 0.50, h * 0.40), collected: false, radius: 16 },
      { pos: Vec(w * 0.30, h * 0.55), collected: false, radius: 16 },
      { pos: Vec(w * 0.70, h * 0.55), collected: false, radius: 16 }
    ];

    monster = {
      pos: Vec(w * 0.5, h * 0.86),
      radius: 42
    };

    particles = [];
    starsCollected = 0;
    gameOver = false;
    win = false;
    cutPath = [];
    isCutting = false;
    messageEl.className = "hidden";
    updateScore();
  }

  function createRope(from, to) {
    const points = [];
    const rest = dist(from, to) / ROPE_SEGMENTS;
    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const t = i / ROPE_SEGMENTS;
      const x = from.x + (to.x - from.x) * t;
      const y = from.y + (to.y - from.y) * t;
      points.push({
        pos: Vec(x, y),
        prev: Vec(x, y),
        pinned: i === 0
      });
    }
    return { points: points, cut: false, restLength: rest };
  }

  function updateRopes() {
    for (let r = 0; r < ropes.length; r++) {
      const rope = ropes[r];
      if (rope.cut) continue;

      const pts = rope.points;

      // Verlet step
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        if (p.pinned) continue;
        const vx = (p.pos.x - p.prev.x) * FRICTION;
        const vy = (p.pos.y - p.prev.y) * FRICTION;
        p.prev.x = p.pos.x;
        p.prev.y = p.pos.y;
        p.pos.x += vx;
        p.pos.y += vy + GRAVITY * 0.45;
      }

      // Constraints
      for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (d - rope.restLength) / d * 0.5;
          const ox = dx * diff;
          const oy = dy * diff;
          if (!a.pinned) { a.pos.x += ox; a.pos.y += oy; }
          if (!b.pinned) { b.pos.x -= ox; b.pos.y -= oy; }
        }
        // stick last point to candy while attached
        if (candy.attached) {
          const last = pts[pts.length - 1];
          last.pos.x = candy.pos.x;
          last.pos.y = candy.pos.y;
        }
      }
    }
  }

  function updateCandy() {
    if (!candy.attached) {
      candy.vel.y += GRAVITY;
      candy.vel.x *= 0.992;
      candy.pos.x += candy.vel.x;
      candy.pos.y += candy.vel.y;

      // floor
      if (candy.pos.y + candy.radius > cssH - 12) {
        candy.pos.y = cssH - 12 - candy.radius;
        candy.vel.y *= -BOUNCE;
        candy.vel.x *= 0.75;
        if (Math.abs(candy.vel.y) < 1.2) candy.vel.y = 0;
      }
      // walls
      if (candy.pos.x - candy.radius < 0) {
        candy.pos.x = candy.radius;
        candy.vel.x *= -BOUNCE;
      }
      if (candy.pos.x + candy.radius > cssW) {
        candy.pos.x = cssW - candy.radius;
        candy.vel.x *= -BOUNCE;
      }
    } else {
      let active = 0, sx = 0, sy = 0;
      for (let r = 0; r < ropes.length; r++) {
        if (!ropes[r].cut) {
          const last = ropes[r].points[ropes[r].points.length - 1];
          sx += last.pos.x;
          sy += last.pos.y;
          active++;
        }
      }
      if (active === 0) {
        candy.attached = false;
        candy.vel.x = (Math.random() - 0.5) * 1.5;
        candy.vel.y = 0.5;
      } else {
        candy.pos.x = sx / active;
        candy.pos.y = sy / active;
      }
    }
  }

  function checkStars() {
    for (let i = 0; i < stars.length; i++) {
      const star = stars[i];
      if (star.collected) continue;
      if (dist(candy.pos, star.pos) < candy.radius + star.radius) {
        star.collected = true;
        starsCollected++;
        updateScore();
        // few particles only
        for (let k = 0; k < 8; k++) {
          particles.push({
            x: star.pos.x, y: star.pos.y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            life: 30,
            color: "#FFD700"
          });
        }
      }
    }
  }

  function checkMonster() {
    if (gameOver) return;
    const d = dist(candy.pos, monster.pos);
    if (d < candy.radius + monster.radius - 10) {
      win = true;
      gameOver = true;
      messageEl.textContent = "Yum! You did it!\nStars: " + starsCollected + "/3";
      messageEl.className = "win";
      for (let k = 0; k < 18; k++) {
        particles.push({
          x: monster.pos.x, y: monster.pos.y - 15,
          vx: (Math.random() - 0.5) * 7,
          vy: (Math.random() - 0.5) * 7 - 2,
          life: 40,
          color: ["#4CAF50", "#FFD700", "#FF6B6B"][k % 3]
        });
      }
    } else if (candy.pos.y > cssH + 60) {
      gameOver = true;
      win = false;
      messageEl.textContent = "Oh no! Try again";
      messageEl.className = "lose";
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateScore() {
    scoreEl.textContent = "Stars: " + starsCollected + "/3";
  }

  // ---------- Drawing (all in CSS pixels) ----------
  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);

    // ground
    ctx.fillStyle = "#A5D6A7";
    ctx.fillRect(0, cssH - 36, cssW, 36);
    ctx.fillStyle = "#81C784";
    ctx.fillRect(0, cssH - 12, cssW, 12);

    // ropes
    for (let r = 0; r < ropes.length; r++) {
      const rope = ropes[r];
      if (rope.cut) continue;
      const pts = rope.points;
      ctx.beginPath();
      ctx.strokeStyle = "#5D4037";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.moveTo(pts[0].pos.x, pts[0].pos.y);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].pos.x, pts[i].pos.y);
      }
      ctx.stroke();
    }

    // anchors
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      ctx.beginPath();
      ctx.fillStyle = "#37474F";
      ctx.arc(a.pos.x, a.pos.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }

    // stars
    for (let i = 0; i < stars.length; i++) {
      if (!stars[i].collected) drawStar(stars[i].pos.x, stars[i].pos.y, stars[i].radius);
    }

    // candy
    drawCandy(candy.pos.x, candy.pos.y, candy.radius);

    // monster
    drawMonster(monster.pos.x, monster.pos.y, monster.radius);

    // cut trail
    if (cutPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255,70,70,0.75)";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.moveTo(cutPath[0].x, cutPath[0].y);
      for (let i = 1; i < cutPath.length; i++) {
        ctx.lineTo(cutPath[i].x, cutPath[i].y);
      }
      ctx.stroke();
    }

    // particles
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = Math.min(1, p.life / 25);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawStar(x, y, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (18 + i * 72) * Math.PI / 180;
      const a2 = (54 + i * 72) * Math.PI / 180;
      ctx.lineTo(Math.cos(a1) * r, -Math.sin(a1) * r);
      ctx.lineTo(Math.cos(a2) * r * 0.42, -Math.sin(a2) * r * 0.42);
    }
    ctx.closePath();
    ctx.fillStyle = "#FFD700";
    ctx.fill();
    ctx.strokeStyle = "#FFA000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawCandy(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#E53935";
    ctx.fill();
    ctx.strokeStyle = "#B71C1C";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // stripe
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, -0.55, 0.55);
    ctx.strokeStyle = "#FFECB3";
    ctx.lineWidth = 7;
    ctx.stroke();

    // shine
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.28, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.fill();
  }

  function drawMonster(x, y, r) {
    // body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#43A047";
    ctx.fill();
    ctx.strokeStyle = "#2E7D32";
    ctx.lineWidth = 3;
    ctx.stroke();

    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x - 13, y - 11, 11, 0, Math.PI * 2);
    ctx.arc(x + 13, y - 11, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1B5E20";
    ctx.beginPath();
    ctx.arc(x - 13, y - 9, 5.5, 0, Math.PI * 2);
    ctx.arc(x + 13, y - 9, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // mouth
    ctx.beginPath();
    ctx.arc(x, y + 9, 17, 0.2 * Math.PI, 0.8 * Math.PI);
    ctx.strokeStyle = "#1B5E20";
    ctx.lineWidth = 3;
    ctx.stroke();

    // teeth
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 9, y + 5, 6, 9);
    ctx.fillRect(x + 3, y + 5, 6, 9);
  }

  // ---------- Cutting (more forgiving on touch) ----------
  function tryCutRopes() {
    if (cutPath.length < 2) return;

    for (let r = 0; r < ropes.length; r++) {
      const rope = ropes[r];
      if (rope.cut) continue;
      const pts = rope.points;

      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].pos.x, ay = pts[i].pos.y;
        const bx = pts[i + 1].pos.x, by = pts[i + 1].pos.y;

        for (let j = 0; j < cutPath.length - 1; j++) {
          if (segmentsIntersect(
            ax, ay, bx, by,
            cutPath[j].x, cutPath[j].y,
            cutPath[j + 1].x, cutPath[j + 1].y
          )) {
            rope.cut = true;
            // small feedback
            for (let k = 0; k < 5; k++) {
              particles.push({
                x: (ax + bx) * 0.5, y: (ay + by) * 0.5,
                vx: (Math.random() - 0.5) * 4,
                vy: (Math.random() - 0.5) * 4,
                life: 20,
                color: "#8D6E63"
              });
            }
            return;
          }
        }
      }
    }
  }

  // ---------- Input (robust touch + mouse) ----------
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return Vec(clientX - rect.left, clientY - rect.top);
  }

  function startCut(e) {
    if (gameOver) return;
    e.preventDefault();
    isCutting = true;
    cutPath = [getPos(e)];
  }

  function moveCut(e) {
    if (!isCutting || gameOver) return;
    e.preventDefault();
    const p = getPos(e);
    // only add if moved enough (reduces points + lag)
    const last = cutPath[cutPath.length - 1];
    if (Math.abs(p.x - last.x) > 3 || Math.abs(p.y - last.y) > 3) {
      cutPath.push(p);
      if (cutPath.length > 30) cutPath.shift();
      tryCutRopes();
    }
  }

  function endCut(e) {
    if (!isCutting) return;
    e.preventDefault();
    isCutting = false;
    tryCutRopes();
    cutPath = [];
  }

  // Mouse
  canvas.addEventListener("mousedown", startCut);
  canvas.addEventListener("mousemove", moveCut);
  canvas.addEventListener("mouseup", endCut);
  canvas.addEventListener("mouseleave", endCut);

  // Touch (non-passive so we can preventDefault)
  canvas.addEventListener("touchstart", startCut, { passive: false });
  canvas.addEventListener("touchmove", moveCut, { passive: false });
  canvas.addEventListener("touchend", endCut, { passive: false });
  canvas.addEventListener("touchcancel", endCut, { passive: false });

  // Prevent page scroll / zoom while playing
  document.body.addEventListener("touchmove", function (e) {
    if (e.target === canvas) e.preventDefault();
  }, { passive: false });

  restartBtn.addEventListener("click", function (e) {
    e.preventDefault();
    initLevel();
  });
  restartBtn.addEventListener("touchend", function (e) {
    e.preventDefault();
    initLevel();
  });

  // Main loop – use requestAnimationFrame only
  function loop(ts) {
    if (!lastTime) lastTime = ts;
    lastTime = ts;

    if (!gameOver) {
      updateRopes();
      updateCandy();
      checkStars();
      checkMonster();
    }
    updateParticles();
    draw();
    requestAnimationFrame(loop);
  }

  // Start
  initLevel();
  requestAnimationFrame(loop);
})();
