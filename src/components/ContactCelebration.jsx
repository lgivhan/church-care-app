import { useEffect, useMemo, useState } from "react";

const COLORS = [
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#ec4899",
  "#8b5cf6",
  "#f97316",
  "#06b6d4",
];
const COUNT = 36;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

export default function ContactCelebration({ onDone }) {
  const [fading, setFading] = useState(false);

  const pieces = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        id: i,
        x: rand(2, 98),
        delay: rand(0, 0.5),
        duration: rand(1.1, 1.8),
        size: rand(7, 13),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rotate: rand(0, 360),
        rotateEnd: rand(300, 720),
        // alternate between square, circle, and a thin rect
        shape: ["square", "circle", "rect"][i % 3],
      })),
    [],
  );

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 1800);
    const doneTimer = setTimeout(() => onDone?.(), 2300);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <>
      <style>{`
        @keyframes cc-fall {
          0%   { transform: translateY(-40px) rotate(var(--r0)); opacity: 1; }
          80%  { opacity: 1; }
          100% { transform: translateY(105vh) rotate(var(--r1)); opacity: 0; }
        }
        @keyframes cc-badge-pop {
          0%   { transform: scale(0) rotate(-10deg); opacity: 0; }
          60%  { transform: scale(1.15) rotate(3deg); opacity: 1; }
          80%  { transform: scale(0.95) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes cc-ring {
          0%   { transform: scale(0.6); opacity: 0.8; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>

      {/* Fullscreen overlay — pointer-events:none so it never blocks taps */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          transition: "opacity 0.5s ease",
          opacity: fading ? 0 : 1,
        }}
      >
        {/* Confetti pieces */}
        {pieces.map((p) => (
          <div
            key={p.id}
            style={{
              position: "absolute",
              top: 0,
              left: `${p.x}%`,
              width: p.shape === "rect" ? p.size * 0.45 : p.size,
              height: p.shape === "rect" ? p.size * 1.8 : p.size,
              borderRadius: p.shape === "circle" ? "50%" : "2px",
              background: p.color,
              "--r0": `${p.rotate}deg`,
              "--r1": `${p.rotateEnd}deg`,
              animation: `cc-fall ${p.duration}s ${p.delay}s ease-in both`,
            }}
          />
        ))}

        {/* Centre badge */}
        <div
          style={{
            position: "absolute",
            top: "38%",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            pointerEvents: "none",
          }}
        >
          {/* Ripple ring */}
          <div
            style={{
              position: "absolute",
              width: 88,
              height: 88,
              borderRadius: "50%",
              border: "3px solid #10b981",
              animation: "cc-ring 0.6s 0.1s ease-out both",
            }}
          />

          {/* Checkmark circle */}
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #10b981, #059669)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 32px rgba(16,185,129,0.45)",
              animation:
                "cc-badge-pop 0.5s 0.05s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>

          {/* Message */}
          <div
            style={{
              marginTop: 12,
              background: "white",
              borderRadius: 16,
              padding: "8px 20px",
              boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
              animation:
                "cc-badge-pop 0.5s 0.15s cubic-bezier(0.34,1.56,0.64,1) both",
              textAlign: "center",
            }}
          >
            <p
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "#1c1917",
                margin: 0,
              }}
            >
              Contact logged!
            </p>
            <p style={{ fontSize: 13, color: "#78716c", margin: "2px 0 0" }}>
              Great work 🙌
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
