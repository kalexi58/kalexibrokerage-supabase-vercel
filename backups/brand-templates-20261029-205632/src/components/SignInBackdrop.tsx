import { useEffect, useRef } from "react";
import office from "@/assets/signin-office.jpg";

export function SignInBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const points = Array.from({ length: 65 }, (_, i) => ({ x: (i * 0.6180339) % 1, y: (i * 0.4142135) % 1 }));
    let frame = 0;
    const draw = (t: number) => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = width; canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      const color = getComputedStyle(canvas).color;
      const positions = points.map((p, i) => ({ x: p.x * width + Math.sin(t / 2200 + i) * 65, y: p.y * height + Math.cos(t / 2700 + i) * 55 }));
      ctx.strokeStyle = color; ctx.fillStyle = color;
      for (let i = 0; i < positions.length; i++) {
        const a = positions[i];
        if (!a) continue;
        ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(a.x, a.y, 2.4, 0, Math.PI * 2); ctx.fill();
        for (let j = i + 1; j < positions.length; j++) {
          const b = positions[j];
          if (!b) continue;
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > 190) continue;
          ctx.globalAlpha = (1 - distance / 190) * 0.6;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      if (!motion.matches) frame = requestAnimationFrame(draw);
    };
    draw(0);
    return () => cancelAnimationFrame(frame);
  }, []);
  return <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
    <img src={office} width={1920} height={1088} alt="" className="signin-photo h-full w-full object-cover" />
    <div className="signin-shade absolute inset-0" />
    <canvas ref={ref} className="absolute inset-0 h-full w-full text-navy-foreground" />
  </div>;
}