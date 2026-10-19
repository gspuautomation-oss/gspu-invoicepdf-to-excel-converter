import React, { useEffect, useRef } from 'react';

interface WaterDropBubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  wobblePhase: number;
  wobbleSpeed: number;
  stretch: number;
}

interface RainbowFogCloud {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxRadius: number;
  hue: number;
  alpha: number;
  decay: number;
}

interface BurstSparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
  decay: number;
}

const RAINBOW_HUES = [0, 30, 55, 130, 195, 235, 275, 320];
const MAX_BUBBLES_AT_A_TIME = 7; // Strictly 6 to 7 bubbles at a time

export const BubbleRainbowCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };

    window.addEventListener('resize', handleResize);

    const createWaterDropBubble = (randomY = false): WaterDropBubble => {
      const radius = 20 + Math.random() * 16; // 20px–36px crisp water drop size
      // Spread bubbles nicely across the left, right, and top/bottom areas
      const x = 60 + Math.random() * Math.max(200, width - 120);
      const y = randomY
        ? 60 + Math.random() * Math.max(200, height - 120)
        : height + radius + 20 + Math.random() * 90;

      return {
        x,
        y,
        vx: (Math.random() - 0.5) * 0.45,
        vy: -(0.45 + Math.random() * 0.6),
        radius,
        wobblePhase: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.02 + Math.random() * 0.02,
        stretch: 1,
      };
    };

    // Only 6 or 7 water-drop bubbles active at a time
    const bubbles: WaterDropBubble[] = Array.from(
      { length: MAX_BUBBLES_AT_A_TIME },
      () => createWaterDropBubble(true)
    );
    const fogClouds: RainbowFogCloud[] = [];
    const sparkles: BurstSparkle[] = [];

    const spawnRainbowFogBurst = (bx: number, by: number, baseRadius: number) => {
      // Spawn 8 overlapping soft rainbow fog clouds that expand outward like colorful mist/fog
      RAINBOW_HUES.forEach((hueOffset, i) => {
        const angle = (Math.PI * 2 * i) / RAINBOW_HUES.length + (Math.random() - 0.5) * 0.4;
        const speed = 0.55 + Math.random() * 1.4;
        const hue = (hueOffset + Math.random() * 15) % 360;
        fogClouds.push({
          x: bx + Math.cos(angle) * (baseRadius * 0.2),
          y: by + Math.sin(angle) * (baseRadius * 0.2),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.18,
          radius: baseRadius * 0.75,
          maxRadius: baseRadius * 4.5 + Math.random() * 45,
          hue,
          alpha: 0.68,
          decay: 0.0028 + Math.random() * 0.0015,
        });
      });

      // Central rainbow mist bloom
      fogClouds.push({
        x: bx,
        y: by,
        vx: (Math.random() - 0.5) * 0.3,
        vy: -0.2,
        radius: baseRadius * 0.9,
        maxRadius: baseRadius * 4.8,
        hue: Math.floor(Math.random() * 360),
        alpha: 0.58,
        decay: 0.0026,
      });

      // Rainbow water-droplet splash particles on burst
      for (let s = 0; s < 18; s++) {
        const angle = (Math.PI * 2 * s) / 18 + (Math.random() - 0.5) * 0.2;
        const speed = 1.4 + Math.random() * 3.2;
        sparkles.push({
          x: bx + Math.cos(angle) * (baseRadius * 0.6),
          y: by + Math.sin(angle) * (baseRadius * 0.6),
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 2.5 + Math.random() * 3,
          hue: RAINBOW_HUES[s % RAINBOW_HUES.length],
          alpha: 0.95,
          decay: 0.009 + Math.random() * 0.007,
        });
      }
    };

    // Burst bubble into rainbow fog when clicked with the mouse
    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      const clickX = e.clientX;
      const clickY = e.clientY;

      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        const dist = Math.hypot(b.x - clickX, b.y - clickY);
        // Generous hit radius so clicking on or near any water-drop bubble pops it
        if (dist <= b.radius + 24) {
          spawnRainbowFogBurst(b.x, b.y, b.radius);
          bubbles[i] = createWaterDropBubble(false);
          break;
        }
      }
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    window.addEventListener('click', handlePointerDown, { passive: true });

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Render expanding Rainbow Fog Clouds (when a bubble has been clicked and burst)
      for (let i = fogClouds.length - 1; i >= 0; i--) {
        const f = fogClouds[i];
        f.x += f.vx;
        f.y += f.vy;
        f.vx *= 0.985;
        f.vy *= 0.985;
        if (f.radius < f.maxRadius) {
          f.radius += (f.maxRadius - f.radius) * 0.048;
        }
        f.hue = (f.hue + 0.9) % 360;
        f.alpha -= f.decay;

        if (f.alpha <= 0.008) {
          fogClouds.splice(i, 1);
          continue;
        }

        const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.radius);
        grad.addColorStop(0, `hsla(${f.hue}, 95%, 60%, ${f.alpha})`);
        grad.addColorStop(0.45, `hsla(${(f.hue + 42) % 360}, 92%, 64%, ${f.alpha * 0.68})`);
        grad.addColorStop(0.75, `hsla(${(f.hue + 85) % 360}, 90%, 70%, ${f.alpha * 0.28})`);
        grad.addColorStop(1, `hsla(${(f.hue + 125) % 360}, 90%, 75%, 0)`);

        ctx.save();
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 2. Render pure white glossy Water-Drop Bubbles (6–7 at a time)
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i];
        b.wobblePhase += b.wobbleSpeed;
        b.x += b.vx + Math.sin(b.wobblePhase) * 0.3;
        b.y += b.vy;
        b.stretch = 1 + Math.sin(b.wobblePhase * 1.5) * 0.035;

        // Respawn at bottom when floating off top
        if (b.y < -b.radius * 2) {
          bubbles[i] = createWaterDropBubble(false);
          continue;
        }
        if (b.x < b.radius) b.x = b.radius;
        if (b.x > width - b.radius) b.x = width - b.radius;

        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(1 / b.stretch, b.stretch);

        // Soft ambient water-drop shadow so white drop is clearly visible on light background
        ctx.shadowColor = 'rgba(148, 163, 184, 0.32)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;

        // Pure White / Crystal Water-Drop 3D Radial Gradient
        const dropGrad = ctx.createRadialGradient(
          -b.radius * 0.32,
          -b.radius * 0.32,
          b.radius * 0.06,
          0,
          0,
          b.radius
        );
        dropGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
        dropGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.72)');
        dropGrad.addColorStop(0.72, 'rgba(241, 245, 249, 0.48)');
        dropGrad.addColorStop(0.9, 'rgba(226, 232, 240, 0.65)');
        dropGrad.addColorStop(1, 'rgba(255, 255, 255, 0.92)');

        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = dropGrad;
        ctx.fill();

        // Reset shadow for crisp inner water-drop reflections
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        // Crisp pearlescent white outer rim
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(203, 213, 225, 0.75)';
        ctx.stroke();

        // Inner white rim glow
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(0, 0, b.radius - 1.2, 0, Math.PI * 2);
        ctx.stroke();

        // Primary glossy white water-drop highlight (top-left oval)
        ctx.save();
        ctx.translate(-b.radius * 0.34, -b.radius * 0.34);
        ctx.rotate(-Math.PI / 4);
        ctx.beginPath();
        ctx.ellipse(0, 0, b.radius * 0.24, b.radius * 0.13, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.fill();
        ctx.restore();

        // Secondary tiny water-drop pin highlight
        ctx.beginPath();
        ctx.arc(-b.radius * 0.14, -b.radius * 0.52, b.radius * 0.06, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.fill();

        // Subtle bottom-right water refraction crescent
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 0.78, Math.PI * 0.12, Math.PI * 0.42);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.stroke();

        ctx.restore();
      }

      // 3. Render rainbow burst droplets
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const sp = sparkles[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vx *= 0.96;
        sp.vy *= 0.96;
        sp.alpha -= sp.decay;

        if (sp.alpha <= 0.01) {
          sparkles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, sp.radius, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${sp.hue}, 95%, 60%, ${sp.alpha})`;
        ctx.shadowColor = `hsla(${sp.hue}, 95%, 60%, ${sp.alpha})`;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('click', handlePointerDown);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      data-testid="bubble-rainbow-canvas"
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-10"
    />
  );
};
