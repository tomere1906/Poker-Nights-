import { useEffect, useRef } from 'react';

const COLORS = ['#fcd34d', '#34d399', '#f472b6', '#60a5fa', '#f87171', '#a78bfa', '#ffffff'];
const DURATION = 3000;

// One-shot canvas confetti burst; calls onDone so the parent removes it (a
// leftover full-screen fixed layer can tint iOS Safari's toolbar).
export default function Confetti({ onDone }) {
  const canvas = useRef(null);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = (el.width = window.innerWidth * dpr);
    const h = (el.height = window.innerHeight * dpr);
    const pieces = Array.from({ length: 140 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 16 * dpr,
      vy: (-Math.random() * 16 - 6) * dpr,
      size: (Math.random() * 6 + 5) * dpr,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      spin: Math.random() * Math.PI,
      round: Math.random() < 0.3,
    }));

    const start = performance.now();
    let frame;
    function draw(now) {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      ctx.globalAlpha = Math.max(0, 1 - t / DURATION);
      for (const p of pieces) {
        p.vy += 0.45 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.spin += 0.15;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.spin);
        ctx.fillStyle = p.color;
        if (p.round) {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (t < DURATION) frame = requestAnimationFrame(draw);
      else onDone?.();
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [onDone]);

  return <canvas ref={canvas} className="pointer-events-none fixed inset-0 z-50 h-full w-full" />;
}
