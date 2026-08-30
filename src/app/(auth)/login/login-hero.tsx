import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Image from 'next/image';

function hasCustomHero(): boolean {
  try {
    readFileSync(join(process.cwd(), 'public', 'login-hero.jpg'));
    return true;
  } catch {
    return false;
  }
}

/**
 * Right-panel visual for the login card.
 *
 * Drop a photo at `public/login-hero.jpg` to use it instead of the SVG botanical
 * fallback — no code change needed.
 */
export function LoginHero() {
  if (hasCustomHero()) {
    return (
      <div className="relative hidden md:block md:w-1/2">
        <Image
          src="/login-hero.jpg"
          alt=""
          fill
          priority
          sizes="(min-width: 768px) 50vw, 0"
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div className="relative hidden overflow-hidden bg-[#f4f7f2] md:block md:w-1/2">
      <svg
        aria-hidden
        viewBox="0 0 600 700"
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="loginBg" cx="0.7" cy="0.3" r="1.1">
            <stop offset="0%" stopColor="#eaf2e4" />
            <stop offset="60%" stopColor="#dde9d3" />
            <stop offset="100%" stopColor="#cadbb8" />
          </radialGradient>
          <linearGradient id="leafA" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a6b3a" />
            <stop offset="100%" stopColor="#1f4a24" />
          </linearGradient>
          <linearGradient id="leafB" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#4d7f4a" />
            <stop offset="100%" stopColor="#2c5c30" />
          </linearGradient>
        </defs>

        <rect width="600" height="700" fill="url(#loginBg)" />

        {/* Large monstera-inspired leaf */}
        <g transform="translate(300 340) rotate(-18)">
          <path
            fill="url(#leafA)"
            d="M0 -240 C 90 -230 170 -160 190 -60 C 205 40 155 130 60 190 C 20 215 -20 220 -50 210 C -30 150 -10 90 -5 30 C 0 -30 -10 -110 -40 -180 C -30 -220 -15 -235 0 -240 Z"
          />
          {/* leaf splits */}
          <path
            fill="#f4f7f2"
            opacity="0.9"
            d="M40 -160 L 130 -140 L 90 -100 Z M 80 -60 L 175 -35 L 130 10 Z M 60 60 L 165 90 L 105 130 Z M 5 140 L 90 180 L 30 200 Z"
          />
          <path
            stroke="#0f3116"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
            d="M -10 -220 C 0 -100 5 20 30 180"
          />
        </g>

        {/* Secondary leaf, top-left */}
        <g transform="translate(90 130) rotate(28)">
          <path
            fill="url(#leafB)"
            d="M0 -140 C 55 -130 100 -80 105 -20 C 110 45 70 100 15 130 C -10 145 -35 145 -55 135 C -45 100 -35 65 -32 30 C -30 -10 -35 -55 -50 -100 C -40 -130 -20 -142 0 -140 Z"
          />
          <path
            fill="#f4f7f2"
            opacity="0.85"
            d="M25 -90 L 80 -75 L 55 -50 Z M 40 -25 L 100 -5 L 65 30 Z M 30 45 L 90 65 L 55 90 Z"
          />
        </g>

        {/* Small leaf, bottom-right */}
        <g transform="translate(490 580) rotate(-40)">
          <path
            fill="url(#leafA)"
            d="M0 -90 C 40 -85 75 -50 80 -5 C 85 40 55 80 15 100 C -5 108 -25 108 -40 100 C -30 70 -25 45 -22 20 C -20 -5 -25 -40 -35 -70 C -25 -88 -12 -94 0 -90 Z"
          />
          <path
            fill="#f4f7f2"
            opacity="0.85"
            d="M20 -55 L 60 -45 L 40 -25 Z M 30 -5 L 75 10 L 45 35 Z"
          />
        </g>
      </svg>
    </div>
  );
}
