export interface CalibrationSourceItem {
  id: string;
  name: string;
  subtitle: string;
  type: 'plate-image' | 'procedural-motion' | 'uploaded-video' | 'uploaded-image';
  imagePath?: string;
  codec: string;
  resolution: string;
  fps: number;
  durationSec: number;
}

export const BUILTIN_CALIBRATION_SOURCES: CalibrationSourceItem[] = [
  {
    id: 'tokyo-rain-reel',
    name: 'Reel 01 · Tokyo Night Rain',
    subtitle: 'Tungsten Street Practicals · 24fps Dailies',
    type: 'plate-image',
    imagePath: '/assets/images/plate_neon_anamorphic_1794558573087.jpg',
    codec: 'LogC4 Cinema Proxy',
    resolution: '3840×2160',
    fps: 24,
    durationSec: 6.0,
  },
  {
    id: 'mojave-golden-hour',
    name: 'Reel 02 · Mojave Golden Hour',
    subtitle: 'Desert Backlight & Dust · 24fps Dailies',
    type: 'plate-image',
    imagePath: '/assets/images/cinema_golden_hour_still_1794575811025.jpg',
    codec: '35mm Film Scan Proxy',
    resolution: '3840×2160',
    fps: 24,
    durationSec: 6.0,
  },
];

/**
 * Renders a clean atmospheric cinema fallback frame onto an offscreen canvas if an image
 * has not yet finished decoding or fails to load.
 */
export function renderProceduralCinemaFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number,
  variant: string = 'tokyo-rain-reel'
): void {
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  if (variant === 'mojave-golden-hour') {
    bg.addColorStop(0, '#17222b');
    bg.addColorStop(0.55, '#6e3f1c');
    bg.addColorStop(1, '#120d0a');
  } else {
    bg.addColorStop(0, '#070a14');
    bg.addColorStop(0.55, '#121828');
    bg.addColorStop(1, '#080a10');
  }
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  // Subtle practical cinema highlights
  const lights = [
    { x: 0.25, y: 0.36, r: 22, col: '#f59e0b', speed: 0.35 },
    { x: 0.72, y: 0.30, r: 28, col: '#38bdf8', speed: -0.25 },
    { x: 0.52, y: 0.45, r: 34, col: '#fde68a', speed: 0.2 },
  ];

  lights.forEach((light, idx) => {
    const lx = (light.x + Math.sin(timeSec * light.speed + idx) * 0.025) * width;
    const ly = (light.y + Math.cos(timeSec * light.speed + idx) * 0.02) * height;
    const rad = light.r * (width / 1280);

    const grad = ctx.createRadialGradient(lx, ly, 1, lx, ly, rad * 3.0);
    grad.addColorStop(0, 'rgba(255,250,240,0.9)');
    grad.addColorStop(0.35, light.col);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(lx, ly, rad * 3.0, 0, Math.PI * 2);
    ctx.fill();
  });
}
