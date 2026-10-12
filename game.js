(function () {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const restartBtn = document.getElementById("restartBtn");
  const messageEl = document.getElementById("message");

  // Resize canvas to fill the screen
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // Game state
  let candy, ropes, anchors, stars, monster, particles;
  let isCutting = false;
  let cutPath = [];
  let starsCollected = 0;
  let gameOver = false;
  let win = false;
  let lastTime = 0;

  // Physics constants
  const GRAVITY = 0.35;
  const FRICTION = 0.99;
  const BOUNCE = 0.6;
  const CANDY_RADIUS = 22;
  const ROPE_SEGMENTS = 12;

  // Simple 2D vector helpers
  function Vec(x, y) {
    return { x: x || 0, y: y || 0 };
  }
  function add(a, b) { return Vec(a.x + b.x, a.y + b.y); }
  function sub(a, b) { return Vec(a.x - b.x, a.y - b.y); }
  function mul(v, s) { return Vec(v.x * s, v.y * s); }
  function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
  function norm(v) {
    const l = len(v);
    return l > 0 ? mul(v, 1 / l) : Vec();
  }
  function dist(a, b) { return len(sub(a, b)); }

  // Line segment intersection test
  function segmentsIntersect(p1, p2, p3, p4) {
    const d1 = direction(p3, p4, p1);
    const d2 = direction(p3, p4, p2);
    const d3 = direction(p1, p2, p3);
    const d4 = direction(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
      return true;
    }
    return false;
  }
  function direction(a, b, c) {
    return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
  }

  // Initialize a new level
  function initLevel() {
    const w = canvas.width;
    const h = canvas.height;

    // Candy starts near the top center
    candy = {
      pos: Vec(w * 0.5, h * 0.22),
      vel: Vec(0, 0),
      radius: CANDY_RADIUS,
      attached: true
    };

    // Two anchors for two ropes
    anchors = [
      { pos: Vec(w * 0.28, h * 0.08) },
      { pos: Vec(w * 0.72, h * 0.08) }
    ];

    // Create ropes as chains of points
    ropes = anchors.map(function (anchor) {
      return createRope(anchor.pos, candy.pos);
    });

    // Stars to collect
    stars = [
      { pos: Vec(w * 0.5, h * 0.42), collected: false, radius: 14 },
      { pos: Vec(w * 0.35, h * 0.58), collected: false, radius: 14 },
      { pos: Vec(w * 0.65, h * 0.58), collected: false, radius: 14 }
    ];

    // Monster (Om Nom style) at the bottom
    monster = {
      pos: Vec(w * 0.5, h * 0.88),
      radius: 38,
      mouthOpen: 0
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
    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const t = i / ROPE_SEGMENTS;
      points.push({
        pos: Vec(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t
        ),
        prev: Vec(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t
        ),
        pinned: i === 0
      });
    }
    return {
      points: points,
      cut: false,
      restLength: dist(from, to) / ROPE_SEGMENTS
    };
  }

  // Verlet integration for rope physics
  function updateRopes() {
    ropes.forEach(function (rope) {
      if (rope.cut) return;

      // Update points
      for (let i = 1; i < rope.points.length; i++) {
        const p = rope.points[i];
        if (p.pinned) continue;

        const vx = (p.pos.x - p.prev.x) * FRICTION;
        const vy = (p.pos.y - p.prev.y) * FRICTION;

        p.prev.x = p.pos.x;
        p.prev.y = p.pos.y;

        p.pos.x += vx;
        p.pos.y += vy + GRAVITY * 0.5;
      }

      // Constraints (keep segment lengths)
      for (let iter = 0; iter < 8; iter++) {
        for (let i = 0; i < rope.points.length - 1; i++) {
          const a = rope.points[i];
          const b = rope.points[i + 1];
          const dx = b.pos.x - a.pos.x;
          const dy = b.pos.y - a.pos.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const diff = (d - rope.restLength) / d;
          const offsetX = dx * 0.5 * diff;
          const offsetY = dy * 0.5 * diff;

          if (!a.pinned) {
            a.pos.x += offsetX;
            a.pos.y += offsetY;
          }
          if (!b.pinned) {
            b.pos.x -= offsetX;
            b.pos.y -= offsetY;
          }
        }

        // Attach last point to candy if still attached
        if (!rope.cut && candy.attached) {
          const last = rope.points[rope.points.length - 1];
          last.pos.x = candy.pos.x;
          last.pos.y = candy.pos.y;
        }
      }
    });
  }

  function updateCandy() {
    if (!candy.attached) {
      // Free falling
      candy.vel.y += GRAVITY;
      candy.vel.x *= 0.995;
      candy.pos.x += candy.vel.x;
      candy.pos.y += candy.vel.y;

      // Floor bounce
      if (candy.pos.y + candy.radius > canvas.height - 10) {
        candy.pos.y = canvas.height - 10 - candy.radius;
        candy.vel.y *= -BOUNCE;
        candy.vel.x *= 0.8;
        if (Math.abs(candy.vel.y) < 1) candy.vel.y = 0;
      }

      // Walls
      if (candy.pos.x - candy.radius < 0) {
        candy.pos.x = candy.radius;
        candy.vel.x *= -BOUNCE;
      }
      if (candy.pos.x + candy.radius > canvas.width) {
        candy.pos.x = canvas.width - candy.radius;
        candy.vel.x *= -BOUNCE;
      }
    } else {
      // Pull candy toward average of rope ends
      let activeRopes = 0;
      let sumX = 0, sumY = 0;
      ropes.forEach(function (rope) {
        if (!rope.cut) {
          const last = rope.points[rope.points.length - 1];
          sumX += last.pos.x;
          sumY += last.pos.y;
          activeRopes++;
        }
      });

      if (activeRopes === 0) {
        candy.attached = false;
        // Give a tiny random push so it doesn't just hang
        candy.vel.x = (Math.random() - 0.5) * 2;
        candy.vel.y = 0;
      } else {
        candy.pos.x = sumX / activeRopes;
        candy.pos.y = sumY / activeRopes;
      }
    }
  }

  function checkStars() {
    stars.forEach(function (star) {
      if (!star.collected && dist(candy.pos, star.pos) < candy.radius + star.radius) {
        star.collected = true;
        starsCollected++;
        updateScore();
        // Sparkle particles
        for (let i = 0; i < 12; i++) {
          particles.push({
            pos: Vec(star.pos.x, star.pos.y),
            vel: Vec((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
            life: 40 + Math.random() * 20,
            color: "#FFD700"
          });
        }
      }
    });
  }

  function checkMonster() {
    if (gameOver) return;
    const d = dist(candy.pos, monster.pos);
    if (d < candy.radius + monster.radius - 8) {
      // Candy reaches the mouth
      win = true;
      gameOver = true;
      messageEl.textContent = "Yum! You did it!\nStars: " + starsCollected + "/3";
      messageEl.className = "win";
      // Celebrate particles
      for (let i = 0; i < 30; i++) {
        particles.push({
          pos: Vec(monster.pos.x, monster.pos.y - 20),
          vel: Vec((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8 - 3),
          life: 50 + Math.random() * 30,
          color: ["#4CAF50", "#FFD700", "#FF6B6B", "#42A5F5"][Math.floor(Math.random() * 4)]
        });
      }
    } else if (candy.pos.y > canvas.height + 50) {
      // Fell off screen
      gameOver = true;
      win = false;
      messageEl.textContent = "Oh no! Try again";
      messageEl.className = "lose";
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.pos.x += p.vel.x;
      p.pos.y += p.vel.y;
      p.vel.y += 0.15;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updateScore() {
    scoreEl.textContent = "Stars: " + starsCollected + "/3";
  }

  // Drawing
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Soft ground
    ctx.fillStyle = "#A5D6A7";
    ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
    ctx.fillStyle = "#81C784";
    ctx.fillRect(0, canvas.height - 15, canvas.width, 15);

    // Draw ropes
    ropes.forEach(function (rope) {
      if (rope.cut) return;
      ctx.beginPath();
      ctx.strokeStyle = "#5D4037";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      rope.points.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p.pos.x, p.pos.y);
        else ctx.lineTo(p.pos.x, p.pos.y);
      });
      ctx.stroke();

      // Small knots
      ctx.fillStyle = "#3E2723";
      rope.points.forEach(function (p) {
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    // Anchors
    anchors.forEach(function (a) {
      ctx.beginPath();
      ctx.fillStyle = "#37474F";
      ctx.arc(a.pos.x, a.pos.y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#263238";
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // Stars
    stars.forEach(function (star) {
      if (star.collected) return;
      drawStar(star.pos.x, star.pos.y, star.radius, "#FFD700", "#FFA000");
    });

    // Candy (red with white stripe)
    drawCandy(candy.pos.x, candy.pos.y, candy.radius);

    // Monster (simple Om Nom-like)
    drawMonster(monster.pos.x, monster.pos.y, monster.radius);

    // Cut path (while swiping)
    if (cutPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(255, 80, 80, 0.7)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      cutPath.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
    }

    // Particles
    particles.forEach(function (p) {
      ctx.globalAlpha = Math.min(1, p.life / 30);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
  }

  function drawStar(x, y, r, fill, stroke) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(
        Math.cos((18 + i * 72) * Math.PI / 180) * r,
        -Math.sin((18 + i * 72) * Math.PI / 180) * r
      );
      ctx.lineTo(
        Math.cos((54 + i * 72) * Math.PI / 180) * (r * 0.45),
        -Math.sin((54 + i * 72) * Math.PI / 180) * (r * 0.45)
      );
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  function drawCandy(x, y, r) {
    // Main body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#E53935";
    ctx.fill();
    ctx.strokeStyle = "#B71C1C";
    ctx.lineWidth = 2;
    ctx.stroke();

    // White stripe
    ctx.beginPath();
    ctx.arc(x, y, r * 0.7, -0.6, 0.6);
    ctx.strokeStyle = "#FFECB3";
    ctx.lineWidth = 6;
    ctx.stroke();

    // Shine
    ctx.beginPath();
    ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fill();
  }

  function drawMonster(x, y, r) {
    // Body
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#43A047";
    ctx.fill();
    ctx.strokeStyle = "#2E7D32";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Eyes
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(x - 12, y - 10, 10, 0, Math.PI * 2);
    ctx.arc(x + 12, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1B5E20";
    ctx.beginPath();
    ctx.arc(x - 12, y - 8, 5, 0, Math.PI * 2);
    ctx.arc(x + 12, y - 8, 5, 0, Math.PI * 2);
    ctx.fill();

    // Mouth
    ctx.beginPath();
    ctx.arc(x, y + 8, 16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.strokeStyle = "#1B5E20";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Teeth
    ctx.fillStyle = "white";
    ctx.fillRect(x - 8, y + 4, 5, 8);
    ctx.fillRect(x + 3, y + 4, 5, 8);
  }

  // Cutting logic
  function tryCutRopes() {
    if (cutPath.length < 2) return;

    ropes.forEach(function (rope) {
      if (rope.cut) return;
      for (let i = 0; i < rope.points.length - 1; i++) {
        const a = rope.points[i].pos;
        const b = rope.points[i + 1].pos;
        for (let j = 0; j < cutPath.length - 1; j++) {
          if (segmentsIntersect(a, b, cutPath[j], cutPath[j + 1])) {
            rope.cut = true;
            // Visual feedback
            for (let k = 0; k < 8; k++) {
              particles.push({
                pos: Vec((a.x + b.x) / 2, (a.y + b.y) / 2),
                vel: Vec((Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5),
                life: 25,
                color: "#8D6E63"
              });
            }
            return;
          }
        }
      }
    });
  }

  // Input handling (mouse + touch)
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches && e.touches.length > 0) {
      return Vec(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
    }
    return Vec(e.clientX - rect.left, e.clientY - rect.top);
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
    cutPath.push(getPos(e));
    // Keep path reasonable length
    if (cutPath.length > 40) cutPath.shift();
    tryCutRopes();
  }

  function endCut(e) {
    if (!isCutting) return;
    e.preventDefault();
    isCutting = false;
    tryCutRopes();
    cutPath = [];
  }

  canvas.addEventListener("mousedown", startCut);
  canvas.addEventListener("mousemove", moveCut);
  canvas.addEventListener("mouseup", endCut);
  canvas.addEventListener("mouseleave", endCut);

  canvas.addEventListener("touchstart", startCut, { passive: false });
  canvas.addEventListener("touchmove", moveCut, { passive: false });
  canvas.addEventListener("touchend", endCut, { passive: false });
  canvas.addEventListener("touchcancel", endCut, { passive: false });

  restartBtn.addEventListener("click", function () {
    initLevel();
  });

  // Main loop
  function loop(timestamp) {
    const dt = Math.min(32, timestamp - lastTime);
    lastTime = timestamp;

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
