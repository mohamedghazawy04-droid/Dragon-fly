import React, { useEffect, useRef, useState } from 'react';
import {
  Anchor,
  ArrowDown,
  ArrowUp,
  Camera,
  Check,
  Clock,
  Cloud,
  CloudLightning,
  CloudRain,
  Compass,
  Eye,
  EyeOff,
  Feather,
  Film,
  Flame,
  Home,
  MapPin,
  Maximize2,
  Minimize2,
  MousePointer2,
  Mountain,
  Move,
  RotateCcw,
  RotateCw,
  Settings,
  Shield,
  Ship,
  Snowflake,
  Sparkles,
  Sun,
  Swords,
  Trophy,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_HUD_LAYOUT,
  DRAGON_SPECS,
  ElementType,
  GameMode,
  HudControlId,
  HudLayoutConfig,
  HudState,
  MinimapBlip,
  ThreatLevel,
  WeatherMode,
  WORLD_LANDMARKS,
} from '../game/types';
import { HudSettingsModal } from './HudSettingsModal';

interface FlightHudProps {
  hud: HudState;
  muted: boolean;
  isFullscreen: boolean;
  layout: HudLayoutConfig;
  onChangeLayout: (next: HudLayoutConfig) => void;
  onToggleFullscreen: () => void;
  onToggleMute: () => void;
  onSelectElement: (el: ElementType) => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectWeatherMode: (mode: WeatherMode) => void;
  onToggleCameraView: () => void;
  onToggleAutoCinematic: () => void;
  onTriggerHalfLoop: () => void;
  onToggleKnifeEdge: () => void;
  onSkydive: () => void;
  onRecallDragon: () => void;
  onLandDragon: () => void;
  onKnightJump: () => void;
  onRemountDragon: () => void;
  onReturnSanctuary: () => void;
  onTryBoard: () => void;
  onSwordSlash: () => void;
  onFiringChange: (active: boolean) => void;
  onBoostingChange: (active: boolean) => void;
  onManualSteer: (x: number, y: number) => void;
  onRoar: () => void;
  onFlyLandmark: (id: string) => void;
  onRequestPointerLock: () => void;
  onOpenUpgrades: () => void;
  onStartNewWar: () => void;
  onActivateFusion: () => void;
  onDismissFlightTip: () => void;
}

export const FlightHud: React.FC<FlightHudProps> = ({
  hud,
  muted,
  isFullscreen,
  layout,
  onChangeLayout,
  onToggleFullscreen,
  onToggleMute,
  onSelectElement,
  onSelectMode,
  onSelectWeatherMode,
  onToggleCameraView,
  onToggleAutoCinematic,
  onTriggerHalfLoop,
  onToggleKnifeEdge,
  onSkydive,
  onRecallDragon,
  onLandDragon,
  onKnightJump,
  onRemountDragon,
  onReturnSanctuary,
  onTryBoard,
  onSwordSlash,
  onFiringChange,
  onBoostingChange,
  onManualSteer,
  onRoar,
  onFlyLandmark,
  onRequestPointerLock,
  onOpenUpgrades,
  onStartNewWar,
  onActivateFusion,
  onDismissFlightTip,
}) => {
  const [cinemaMode, setCinemaMode] = useState(false);
  const [showLandmarks, setShowLandmarks] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [repositionMode, setRepositionMode] = useState(false);
  const draggingControlRef = useRef<HudControlId | null>(null);

  // Virtual Flight Stick state
  const stickRef = useRef<HTMLDivElement | null>(null);
  const activePointerId = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const maxRadius = 42;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyH') {
        setCinemaMode((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const updateStickFromClient = (clientX: number, clientY: number) => {
    const el = stickRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }
    setKnobOffset({ x: dx, y: dy });
    onManualSteer(dx / maxRadius, -dy / maxRadius);
  };

  const resetStick = () => {
    activePointerId.current = null;
    setKnobOffset({ x: 0, y: 0 });
    onManualSteer(0, 0);
  };

  const handleControlDragMove = (e: React.PointerEvent) => {
    const id = draggingControlRef.current;
    if (!id) return;
    if (!Number.isFinite(e.clientX) || !Number.isFinite(e.clientY)) return;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    const xPct = Math.max(5, Math.min(95, (e.clientX / w) * 100));
    const yPct = Math.max(6, Math.min(94, (e.clientY / h) * 100));
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return;
    onChangeLayout({
      ...layout,
      positions: {
        ...layout.positions,
        [id]: { xPct, yPct },
      },
    });
  };

  const stopControlDrag = () => {
    draggingControlRef.current = null;
  };

  const spec = DRAGON_SPECS[hud.dragonId];
  const hpPct = Math.max(0, Math.min(100, Math.round((hud.hp / hud.maxHp) * 100)));
  const energyPct = Math.max(
    0,
    Math.min(100, Math.round((hud.energy / hud.maxEnergy) * 100)),
  );

  const elementAccent =
    hud.activeElement === 'fire'
      ? 'bg-orange-500/90 hover:bg-orange-400 text-slate-950 border-orange-300'
      : hud.activeElement === 'ice'
        ? 'bg-sky-400/90 hover:bg-sky-300 text-slate-950 border-sky-200'
        : 'bg-amber-400/90 hover:bg-amber-300 text-slate-950 border-amber-200';

  const ElementIcon =
    hud.activeElement === 'fire'
      ? Flame
      : hud.activeElement === 'ice'
        ? Snowflake
        : Mountain;

  const getControlStyle = (id: HudControlId): React.CSSProperties => {
    const def = DEFAULT_HUD_LAYOUT.positions[id];
    const p = layout.positions?.[id];
    const xPct = p && Number.isFinite(p.xPct) ? p.xPct : def.xPct;
    const yPct = p && Number.isFinite(p.yPct) ? p.yPct : def.yPct;
    const scale = Number.isFinite(layout.buttonScale)
      ? layout.buttonScale
      : DEFAULT_HUD_LAYOUT.buttonScale;
    const opacity = Number.isFinite(layout.buttonOpacity)
      ? layout.buttonOpacity
      : DEFAULT_HUD_LAYOUT.buttonOpacity;
    return {
      left: `${xPct}%`,
      top: `${yPct}%`,
      transform: `translate(-50%, -50%) scale(${scale})`,
      opacity: repositionMode ? 1 : opacity,
    };
  };

  const warMin = Math.floor(Math.max(0, hud.warTimeLeft) / 60);
  const warSec = Math.max(0, hud.warTimeLeft) % 60;
  const warTimeFormatted = `${String(warMin).padStart(2, '0')}:${String(warSec).padStart(2, '0')}`;
  const totalUpgradePts = hud.progression.knightPoints + hud.progression.dragonPoints;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-10 select-none"
      onPointerMove={repositionMode ? handleControlDragMove : undefined}
      onPointerUp={repositionMode ? stopControlDrag : undefined}
      onPointerCancel={repositionMode ? stopControlDrag : undefined}
    >
      {/* Brief atmospheric lightning glare */}
      <div
        className={`pointer-events-none fixed inset-0 bg-sky-100/20 transition-opacity duration-150 ${
          hud.lightningActive ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Auto-Cinematic Landmark Flyby Letterbox & Dramatic Landmark Title Reveal */}
      {hud.phase === 'flying' && hud.cinematicActive && !repositionMode && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-15 h-8 sm:h-11 bg-gradient-to-b from-black/90 to-black/75 border-b border-amber-400/20"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-15 h-8 sm:h-11 bg-gradient-to-t from-black/90 to-black/75 border-t border-amber-400/20"
          />
          {hud.cinematicLandmarkNameAr && (
            <div
              dir="rtl"
              className="pointer-events-none fixed bottom-11 sm:bottom-14 left-1/2 -translate-x-1/2 z-15 flex flex-col items-center text-center px-4"
            >
              <span className="text-[10px] tracking-widest text-amber-300/90 font-semibold">
                لقطة سينمائية · معلم رئيسي
              </span>
              <h2 className="mt-0.5 text-lg sm:text-2xl font-extrabold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]">
                {hud.cinematicLandmarkNameAr}
              </h2>
              {hud.cinematicLandmarkSubtitleAr && (
                <p className="text-[11px] sm:text-xs text-slate-200/90 drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]">
                  {hud.cinematicLandmarkSubtitleAr}
                </p>
              )}
            </div>
          )}
        </>
      )}

      {/* High-Speed / Boost Peripheral Motion-Blur Tunnel Vignette */}
      {(hud.phase === 'flying' || hud.phase === 'skydiving') &&
        hud.motionBlurIntensity > 0.08 && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-100"
            style={{
              opacity: Math.min(0.85, hud.motionBlurIntensity * 0.9),
              background: hud.isBoosting
                ? 'radial-gradient(ellipse 68% 64% at 50% 50%, transparent 56%, rgba(251, 146, 60, 0.12) 84%, rgba(7, 10, 16, 0.42) 100%)'
                : 'radial-gradient(ellipse 70% 66% at 50% 50%, transparent 58%, rgba(125, 211, 252, 0.08) 85%, rgba(7, 10, 16, 0.34) 100%)',
            }}
          />
        )}

      {/* Sky Wind-Current Slipstream Peripheral Airflow Shimmer */}
      {hud.phase === 'flying' && hud.windCurrentIntensity > 0.12 && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-200"
          style={{
            opacity: Math.min(0.85, hud.windCurrentIntensity * 0.9),
            background:
              'radial-gradient(ellipse 74% 70% at 50% 50%, transparent 62%, rgba(56, 189, 248, 0.14) 87%, rgba(186, 230, 253, 0.22) 100%)',
          }}
        />
      )}

      {/* Spiritual Fusion Viewport Edge Resonance Aura */}
      {hud.phase === 'flying' && hud.fusionActive && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-200"
          style={{
            background:
              hud.activeElement === 'ice'
                ? 'radial-gradient(ellipse 74% 70% at 50% 50%, transparent 62%, rgba(56, 189, 248, 0.18) 88%, rgba(251, 191, 36, 0.22) 100%)'
                : 'radial-gradient(ellipse 74% 70% at 50% 50%, transparent 62%, rgba(251, 191, 36, 0.18) 88%, rgba(249, 115, 22, 0.24) 100%)',
          }}
        />
      )}

      {/* Critical Low-HP Peripheral Danger Vignette */}
      {hpPct <= 28 &&
        (hud.phase === 'flying' ||
          hud.phase === 'boarding' ||
          hud.phase === 'skydiving' ||
          hud.phase === 'on_foot') && (
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-0 z-10 transition-opacity duration-300"
            style={{
              opacity: Math.min(0.95, 0.45 + ((28 - hpPct) / 28) * 0.5),
              background:
                'radial-gradient(ellipse 72% 68% at 50% 50%, transparent 60%, rgba(190, 18, 60, 0.24) 86%, rgba(127, 29, 29, 0.48) 100%)',
            }}
          />
        )}

      {/* Lateral Flashing Maneuver Orientation Indicators (Sharp Turns, Knife Edge 90°, Half-Loop, Steep Dive) */}
      {hud.phase === 'flying' &&
        !cinemaMode &&
        !repositionMode &&
        hud.maneuverKind !== 'none' && (() => {
          const isKnife = hud.maneuverKind === 'knife_edge';
          const isLoop = hud.maneuverKind === 'half_loop';
          const isDive = hud.maneuverKind === 'steep_dive';
          const showLeft = hud.maneuverSide === -1 || hud.maneuverSide === 0;
          const showRight = hud.maneuverSide === 1 || hud.maneuverSide === 0;
          const absBank = Math.min(90, Math.abs(hud.bankAngleDeg));
          const titleAr = isKnife
            ? 'طيران جانبي ٩٠°'
            : isLoop
              ? 'التفاف سماوي'
              : isDive
                ? 'انقضاض سريع'
                : 'انعطاف حاد';

          const accentText = isLoop
            ? 'text-sky-300'
            : isKnife
              ? 'text-[#ff8c24]'
              : 'text-amber-300';
          const accentStroke = isLoop
            ? '#7dd3fc'
            : isKnife
              ? '#ff8c24'
              : '#fbbf24';
          const borderTone = isLoop
            ? 'border-sky-400/55'
            : isKnife
              ? 'border-[#ff8c24]/70'
              : 'border-amber-400/55';
          const leftGlow = isLoop
            ? 'from-sky-400/30 via-sky-400/10 to-transparent'
            : isKnife
              ? 'from-[#ff8c24]/35 via-[#ff8c24]/12 to-transparent'
              : 'from-amber-400/30 via-amber-400/10 to-transparent';
          const rightGlow = isLoop
            ? 'from-sky-400/30 via-sky-400/10 to-transparent'
            : isKnife
              ? 'from-[#ff8c24]/35 via-[#ff8c24]/12 to-transparent'
              : 'from-amber-400/30 via-amber-400/10 to-transparent';

          const renderChevrons = (dir: 'left' | 'right' | 'up' | 'down') => {
            const rot =
              dir === 'left'
                ? 'rotate(180deg)'
                : dir === 'up'
                  ? 'rotate(-90deg)'
                  : dir === 'down'
                    ? 'rotate(90deg)'
                    : 'rotate(0deg)';
            const order = dir === 'left' ? [2, 1, 0] : [0, 1, 2];
            return (
              <div className="flex items-center gap-0.5" style={{ transform: rot }}>
                {order.map((idx) => (
                  <svg
                    key={idx}
                    viewBox="0 0 16 24"
                    className="w-3.5 h-5 animate-maneuver-chevron"
                    style={{ animationDelay: `${idx * 90}ms` }}
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M4 3L13 12L4 21"
                      stroke={accentStroke}
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ))}
              </div>
            );
          };

          const renderHorizonGauge = () => (
            <div className="relative w-8 h-8 flex items-center justify-center" aria-hidden="true">
              {/* Fixed true-horizon ticks */}
              <div className="absolute inset-x-0.5 h-px bg-white/30" />
              <div className="absolute top-0.5 w-1 h-1 border-t border-white/50" />
              {/* Rotating dragon wing-bank bar */}
              <div
                className="w-6 h-0.5 rounded-full transition-transform duration-75"
                style={{
                  backgroundColor: accentStroke,
                  transform: `rotate(${-hud.bankAngleDeg}deg)`,
                }}
              >
                <div
                  className="mx-auto -mt-[3px] w-2 h-2 rounded-full border"
                  style={{ borderColor: accentStroke, backgroundColor: '#070a10' }}
                />
              </div>
            </div>
          );

          return (
            <>
              {/* Left Viewport Edge Flashing Indicator */}
              {showLeft && (
                <div className="pointer-events-none fixed left-0 top-1/2 -translate-y-1/2 z-15 flex items-center">
                  <div
                    className={`w-12 sm:w-16 h-48 sm:h-60 bg-gradient-to-r ${leftGlow} animate-maneuver-flash`}
                    style={{ opacity: Math.max(0.45, hud.maneuverIntensity) }}
                  />
                  <div
                    dir="rtl"
                    className={`-ml-8 sm:-ml-11 flex items-center gap-2 rounded-xl px-2.5 py-2 bg-slate-950/75 border ${borderTone} shadow-xl animate-maneuver-flash`}
                  >
                    {renderChevrons(isLoop ? 'up' : isDive ? 'down' : 'left')}
                    {renderHorizonGauge()}
                    <div className="flex flex-col text-right leading-tight">
                      <span className={`text-[11px] font-bold whitespace-nowrap ${accentText}`}>
                        {titleAr}
                      </span>
                      <span className="font-mono-nums text-[10px] text-slate-200 whitespace-nowrap">
                        {hud.maneuverSide === -1 ? 'يسار · ' : ''}
                        {absBank}°
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Right Viewport Edge Flashing Indicator */}
              {showRight && (
                <div className="pointer-events-none fixed right-0 top-1/2 -translate-y-1/2 z-15 flex flex-row-reverse items-center">
                  <div
                    className={`w-12 sm:w-16 h-48 sm:h-60 bg-gradient-to-l ${rightGlow} animate-maneuver-flash`}
                    style={{ opacity: Math.max(0.45, hud.maneuverIntensity) }}
                  />
                  <div
                    dir="rtl"
                    className={`-mr-8 sm:-mr-11 flex flex-row-reverse items-center gap-2 rounded-xl px-2.5 py-2 bg-slate-950/75 border ${borderTone} shadow-xl animate-maneuver-flash`}
                  >
                    {renderChevrons(isLoop ? 'up' : isDive ? 'down' : 'right')}
                    {renderHorizonGauge()}
                    <div className="flex flex-col text-right leading-tight">
                      <span className={`text-[11px] font-bold whitespace-nowrap ${accentText}`}>
                        {titleAr}
                      </span>
                      <span className="font-mono-nums text-[10px] text-slate-200 whitespace-nowrap">
                        {hud.maneuverSide === 1 ? 'يمين · ' : ''}
                        {absBank}°
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Opposite-Side Horizon Upright Marker during 90° Knife Edge */}
              {isKnife && hud.maneuverSide !== 0 && (
                <div
                  className={`pointer-events-none fixed top-1/2 -translate-y-1/2 z-15 flex items-center gap-1.5 rounded-lg px-2 py-1 bg-slate-950/55 border border-white/15 ${
                    hud.maneuverSide === -1 ? 'right-3' : 'left-3'
                  }`}
                >
                  <ArrowUp className="w-3.5 h-3.5 text-sky-300" />
                  <span className="text-[10px] font-medium text-slate-200 whitespace-nowrap">
                    الأفق
                  </span>
                </div>
              )}
            </>
          );
        })()}

      {/* 3D Projected Target Indicators (Combat Mode only, optional) */}
      {layout.showIndicators &&
        hud.mode === 'combat' &&
        hud.phase === 'flying' &&
        !cinemaMode &&
        hud.indicators.map(
          (ind) =>
            ind.visible &&
            Number.isFinite(ind.screenX) &&
            Number.isFinite(ind.screenY) && (
              <div
                key={ind.id}
                className="pointer-events-none fixed -translate-x-1/2 -translate-y-1/2 flex flex-col items-center"
                style={{ left: Math.round(ind.screenX), top: Math.round(ind.screenY) }}
              >
                <div
                  className={`w-6 h-6 border rounded-sm ${
                    ind.isAlly
                      ? 'border-sky-400/60'
                      : ind.canBoard
                        ? 'border-amber-400'
                        : 'border-rose-500/80'
                  }`}
                />
                {!ind.isAlly && (
                  <div className="mt-0.5 w-9 h-1 bg-black/50 rounded overflow-hidden">
                    <div
                      className="h-full bg-rose-500"
                      style={{ width: `${Math.round((ind.hp / ind.maxHp) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ),
        )}

      {/* Reposition Mode Banner */}
      {repositionMode && (
        <div className="pointer-events-auto fixed top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl px-4 py-2 hud-surface-strong border border-amber-400/70 shadow-xl">
          <Move className="w-4 h-4 text-amber-300" />
          <span className="text-xs font-bold text-white whitespace-nowrap">
            اسحب أي زر لتغيير مكانه
          </span>
          <button
            type="button"
            onClick={() => onChangeLayout(DEFAULT_HUD_LAYOUT)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] bg-white/10 hover:bg-white/20 text-slate-200 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>افتراضي</span>
          </button>
          <button
            type="button"
            onClick={() => setRepositionMode(false)}
            className="flex items-center gap-1 rounded-lg px-3 py-1 text-[11px] font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>حفظ</span>
          </button>
        </div>
      )}

      {/* Top Compact Utility Toolbar (Grouped cohesive clusters, avoids vitals corner) */}
      {!repositionMode && (() => {
        const vitalsOnRight = (layout.positions?.vitals?.xPct ?? 12) > 55;
        return (
        <div
          className={`pointer-events-auto fixed top-3 z-20 flex flex-wrap items-center gap-1.5 max-w-[calc(100vw-270px)] ${
            vitalsOnRight ? 'left-3 justify-start' : 'right-3 justify-end'
          }`}
          style={{ opacity: Math.max(0.72, layout.buttonOpacity) }}
        >
          {/* Cluster 1: War Progress Telemetry (Combat mode) */}
          {hud.mode === 'combat' && !layout.compactTopBar && (
            <div
              className={`flex items-center gap-2 rounded-xl h-9 px-3 hud-surface text-[11px] font-mono-nums ${
                hud.dangerAlertActive
                  ? 'border-rose-400/80 text-rose-200'
                  : ''
              }`}
            >
              <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                <Clock className="w-3.5 h-3.5" />
                {warTimeFormatted}
              </span>
              {hud.warType !== 'ships' && (
                <>
                  <span className="hud-divider" />
                  <span className="inline-flex items-center gap-1 text-sky-300 font-bold">
                    <Wind className="w-3.5 h-3.5" />
                    {hud.warDragonsKilled}/{hud.warDragonsGoal}
                  </span>
                </>
              )}
              {hud.warType !== 'dragons' && (
                <>
                  <span className="hud-divider" />
                  <span className="inline-flex items-center gap-1 text-orange-300 font-bold">
                    <Ship className="w-3.5 h-3.5" />
                    {hud.warShipsSunk}/{hud.warShipsGoal}
                  </span>
                </>
              )}
            </div>
          )}

          {/* Cluster 2: Weather, Mode & Exploration */}
          <div className="flex items-center gap-1 rounded-xl h-9 px-1 hud-surface">
            <div className="flex items-center gap-0.5 rounded-lg bg-black/35 p-0.5">
              {(
                [
                  { id: 'auto', label: 'تلقائي', Icon: Cloud },
                  { id: 'clear', label: 'صحو', Icon: Sun },
                  { id: 'rain', label: 'مطر', Icon: CloudRain },
                  { id: 'storm', label: 'عاصفة', Icon: CloudLightning },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = hud.weatherMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectWeatherMode(id)}
                    title={label}
                    className={`flex items-center gap-1 rounded-md h-6 px-1.5 text-[10px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      active
                        ? id === 'storm'
                          ? 'bg-sky-500 text-slate-950 font-bold'
                          : id === 'rain'
                            ? 'bg-sky-300 text-slate-950 font-bold'
                            : 'bg-amber-400 text-slate-950 font-bold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {!layout.compactTopBar && <span className="hidden xl:inline">{label}</span>}
                  </button>
                );
              })}
            </div>

            <span className="hud-divider" />

            <button
              type="button"
              onClick={() => onSelectMode(hud.mode === 'combat' ? 'free' : 'combat')}
              title={hud.mode === 'combat' ? 'وضع التحليق الحر' : 'وضع حرب السماء'}
              className="flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              {hud.mode === 'combat' ? (
                <Compass className="w-3.5 h-3.5 text-sky-300 shrink-0" />
              ) : (
                <Shield className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              )}
              {!layout.compactTopBar && (
                <span className="hidden sm:inline">
                  {hud.mode === 'combat' ? 'سلم/حر' : 'حرب'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowLandmarks((v) => !v)}
              title="الخريطة والمواقع"
              className={`flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                showLandmarks
                  ? 'bg-amber-500/20 text-amber-200'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-300" />
              {!layout.compactTopBar && <span className="hidden sm:inline">المناطق</span>}
            </button>

            {hud.mode === 'combat' && (
              <button
                type="button"
                onClick={onOpenUpgrades}
                title="ترسانة الفارس وتطويرات التنين"
                className="flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium text-sky-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                {!layout.compactTopBar && <span className="hidden sm:inline">تطوير</span>}
                {totalUpgradePts > 0 && (
                  <span className="font-mono-nums font-bold text-amber-300">
                    +{totalUpgradePts}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Cluster 3: Camera & System Controls */}
          <div className="flex items-center gap-0.5 rounded-xl h-9 px-1 hud-surface">
            <button
              type="button"
              onClick={onToggleCameraView}
              title="تبديل المنظور (V)"
              className="flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium text-slate-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 shrink-0" />
              {!layout.compactTopBar && (
                <span className="hidden lg:inline">
                  {hud.cameraView === 'full' ? 'كامل' : 'فارس'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onToggleAutoCinematic}
              title="اللقطات السينمائية التلقائية (O)"
              className={`flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                hud.autoCinematicEnabled
                  ? 'bg-amber-500/18 text-amber-200'
                  : 'text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Film className="w-3.5 h-3.5 shrink-0" />
              {!layout.compactTopBar && (
                <span className="hidden lg:inline">سينمائي</span>
              )}
            </button>

            <span className="hud-divider mx-0.5" />

            <button
              type="button"
              onClick={onRequestPointerLock}
              title="توجيه بالماوس"
              className={`hidden md:flex items-center justify-center rounded-lg w-7 h-7 transition-colors cursor-pointer ${
                hud.pointerLocked
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'text-slate-200 hover:text-white hover:bg-white/10'
              }`}
            >
              <MousePointer2 className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onReturnSanctuary}
              title="العودة للملاذ الصخري"
              className="flex items-center gap-1 rounded-lg h-7 px-2 text-[11px] font-medium text-amber-200 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Home className="w-3.5 h-3.5 shrink-0" />
              {!layout.compactTopBar && <span className="hidden sm:inline">الملاذ</span>}
            </button>

            <button
              type="button"
              onClick={onToggleFullscreen}
              title="ملء الشاشة الأفقي"
              className="flex items-center justify-center rounded-lg w-7 h-7 text-amber-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                title="إعدادات وتوزيع الأزرار"
                className={`flex items-center justify-center rounded-lg w-7 h-7 transition-colors cursor-pointer ${
                  hud.activeFlightTip && !cinemaMode && !showSettings
                    ? hud.activeFlightTip.category === 'landmark'
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-sky-500/20 text-sky-200'
                    : 'text-sky-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
              </button>

              {/* Contextual Flight Mechanics Tip near Settings Icon */}
              {hud.activeFlightTip && !cinemaMode && !showSettings && !showLandmarks && (
                <div
                  dir="rtl"
                  role="status"
                  className={`pointer-events-auto absolute top-full mt-2.5 z-30 w-64 sm:w-72 rounded-xl p-3 hud-surface-strong text-right ${
                    hud.activeFlightTip.category === 'landmark'
                      ? 'border-amber-400/55'
                      : 'border-sky-400/55'
                  } ${
                    vitalsOnRight
                      ? 'left-0 sm:left-0'
                      : 'left-0 sm:left-1/2 sm:-translate-x-1/2'
                  }`}
                >
                  <div
                    aria-hidden="true"
                    className={`absolute -top-1.5 w-2.5 h-2.5 rotate-45 bg-[#080c13] border-t border-l ${
                      hud.activeFlightTip.category === 'landmark'
                        ? 'border-amber-400/55'
                        : 'border-sky-400/55'
                    } ${
                      vitalsOnRight
                        ? 'left-2.5'
                        : 'left-2.5 sm:left-1/2 sm:-translate-x-1/2'
                    }`}
                  />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {hud.activeFlightTip.category === 'landmark' ? (
                        <MapPin className="w-3.5 h-3.5 shrink-0 text-amber-300" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5 shrink-0 text-sky-300" />
                      )}
                      <span
                        className={`text-[11px] font-extrabold leading-tight truncate ${
                          hud.activeFlightTip.category === 'landmark'
                            ? 'text-amber-200'
                            : 'text-sky-200'
                        }`}
                      >
                        {hud.activeFlightTip.titleAr}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDismissFlightTip();
                      }}
                      aria-label="إغلاق التلميح"
                      className="shrink-0 rounded-md p-0.5 text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>

                  <p className="mt-1 text-[11px] leading-relaxed text-slate-200">
                    {hud.activeFlightTip.bodyAr}
                  </p>

                  <div className="mt-2 pt-1.5 border-t border-white/10 flex items-center justify-between text-[10px]">
                    <span
                      className={`font-semibold ${
                        hud.activeFlightTip.category === 'landmark'
                          ? 'text-amber-300'
                          : 'text-sky-300'
                      }`}
                    >
                      {hud.activeFlightTip.mechanicTagAr}
                    </span>
                    <span className="text-slate-400">طيران متقدم</span>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setCinemaMode((v) => !v)}
              title="إخفاء الأزرار (H)"
              className="flex items-center justify-center rounded-lg w-7 h-7 text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {cinemaMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
              className="flex items-center justify-center rounded-lg w-7 h-7 text-slate-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        );
      })()}

      {/* Landmarks Quick Teleport Dropdown */}
      {showLandmarks && !repositionMode && (
        <div
          dir="rtl"
          className="pointer-events-auto fixed top-14 right-3 left-3 mx-auto max-w-4xl z-30 rounded-2xl p-3 hud-surface-strong"
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2 mb-2.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
              <MapPin className="w-3.5 h-3.5" />
              <span>المعالم والمناطق الرئيسية — اختر وجهة للانتقال الفوري</span>
            </div>
            <button
              type="button"
              onClick={() => setShowLandmarks(false)}
              aria-label="إغلاق المناطق"
              className="flex items-center justify-center w-6 h-6 rounded-md text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {WORLD_LANDMARKS.map((lm) => (
              <button
                key={lm.id}
                type="button"
                onClick={() => {
                  onFlyLandmark(lm.id);
                  setShowLandmarks(false);
                }}
                className="text-right rounded-xl px-2.5 py-2 bg-white/[0.04] hover:bg-amber-500/18 border border-white/10 hover:border-amber-400/50 transition-colors cursor-pointer"
              >
                <div className="text-[11px] font-bold text-amber-200 truncate">{lm.nameAr}</div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{lm.subtitleAr}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Minimal Center Targeting Reticle & Active Boarding Prompt Only (Zero clutter text!) */}
      <div className="pointer-events-none fixed inset-0 flex flex-col items-center justify-center">
        {hud.phase === 'flying' && !cinemaMode && !repositionMode && (
          <div className="w-4 h-4 rounded-full border border-white/35 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-amber-300/80" />
          </div>
        )}

        {hud.phase === 'boarding' && (
          <div className="mt-16 rounded-xl px-4 py-1.5 bg-slate-950/70 border border-amber-400/50 text-center">
            <span className="font-mono-nums text-xs font-bold text-amber-300">
              {hud.boardingHits} / {hud.boardingHitsRequired}
            </span>
          </div>
        )}
      </div>

      {/* War Round Resolution Banner */}
      {hud.mode === 'combat' &&
        (hud.warStatus === 'victory' || hud.warStatus === 'defeat') &&
        !repositionMode && (
          <div className="pointer-events-auto fixed top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 rounded-2xl px-4 py-2 hud-surface-strong border border-amber-400/60 shadow-2xl">
            <Trophy
              className={`w-4 h-4 ${
                hud.warStatus === 'victory' ? 'text-amber-300' : 'text-rose-400'
              }`}
            />
            <span className="text-xs font-extrabold text-white whitespace-nowrap">
              {hud.warStatus === 'victory' ? 'نصر الحرب — تم منح نقاط التطوير' : 'انتهت الجولة'}
            </span>
            <button
              type="button"
              onClick={onOpenUpgrades}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 cursor-pointer whitespace-nowrap"
            >
              التطويرات
            </button>
            <button
              type="button"
              onClick={onStartNewWar}
              className="rounded-lg px-2.5 py-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer whitespace-nowrap"
            >
              جولة جديدة
            </button>
          </div>
        )}

      {/* Customizable Draggable Control Groups (Visible unless Cinema Mode) */}
      {(!cinemaMode || repositionMode) && (
        <>
          {/* 1. Vitals Card (Matched width w-[236px] aligned with Bond card) */}
          {(!layout.compactTopBar || repositionMode) && (
            <div
              dir="rtl"
              style={getControlStyle('vitals')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'vitals';
              }}
              className={`pointer-events-auto fixed z-20 w-[236px] flex flex-col gap-2 rounded-2xl px-3 py-2.5 hud-surface ${
                repositionMode
                  ? 'border-2 border-dashed border-amber-400 cursor-move'
                  : hpPct <= 28
                    ? 'border-rose-500/75 shadow-[0_0_16px_rgba(244,63,94,0.28)]'
                    : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-white truncate">{spec.nameAr}</span>
                  <span className="text-[10px] text-slate-400 truncate">· {spec.elementAr}</span>
                </div>
                <span
                  className={`font-mono-nums text-[10px] transition-colors whitespace-nowrap ${
                    hud.inWindCurrent
                      ? 'text-sky-300 font-bold'
                      : hud.isBoosting || hud.motionBlurIntensity > 0.35
                        ? 'text-amber-300 font-bold'
                        : 'text-slate-300'
                  }`}
                >
                  {hud.speed} م/ث{hud.inWindCurrent ? ' · تيار' : ''}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <div className="flex justify-between text-[10px] leading-none mb-1">
                    <span className="text-slate-300">الصحة</span>
                    <span
                      className={`font-mono-nums font-bold ${
                        hpPct <= 35
                          ? 'text-rose-300'
                          : hpPct <= 55
                            ? 'text-amber-300'
                            : 'text-emerald-300'
                      }`}
                    >
                      {hud.hp}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10">
                    <div
                      className={`h-full transition-colors duration-200 ${
                        hpPct <= 35
                          ? 'bg-rose-500'
                          : hpPct <= 55
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                      }`}
                      style={{ width: `${hpPct}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[10px] leading-none mb-1">
                    <span className="text-slate-300">الطاقة</span>
                    <span className="font-mono-nums font-bold text-amber-300">
                      {energyPct}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-black/60 overflow-hidden border border-white/10">
                    <div className="h-full bg-amber-400" style={{ width: `${energyPct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 1b. Spiritual Bond Gauge & Fusion Trigger (Matched w-[236px] aligned with Vitals card) */}
          {(() => {
            const bondPct = Math.max(0, Math.min(100, Math.round(hud.spiritualBond)));
            const isReady = bondPct >= 100 && !hud.fusionActive;
            const isFused = hud.fusionActive;
            const ringR = 17;
            const ringC = 2 * Math.PI * ringR;
            const arcRatio = isFused
              ? Math.max(0, Math.min(1, hud.fusionTimeLeft / Math.max(1, hud.fusionDuration)))
              : bondPct / 100;
            const ringOffset = ringC * (1 - arcRatio);
            const strokeColor = isFused
              ? '#fbbf24'
              : isReady
                ? '#f59e0b'
                : '#38bdf8';

            return (
              <div
                dir="rtl"
                style={getControlStyle('bond')}
                onPointerDown={(e) => {
                  if (!repositionMode) return;
                  e.stopPropagation();
                  draggingControlRef.current = 'bond';
                }}
                className={`pointer-events-auto fixed z-20 w-[236px] flex items-center gap-2.5 rounded-2xl px-3 py-2.5 hud-surface transition-colors ${
                  repositionMode
                    ? 'border-2 border-dashed border-amber-400 cursor-move'
                    : isFused
                      ? 'border-amber-400/90 shadow-[0_0_24px_rgba(251,191,36,0.28)]'
                      : isReady
                        ? 'border-amber-300/80 shadow-[0_0_18px_rgba(245,158,11,0.22)]'
                        : ''
                }`}
              >
                {/* Circular Spiritual Resonance Crest */}
                <div className="relative w-11 h-11 shrink-0 flex items-center justify-center">
                  <svg className="w-11 h-11 -rotate-90" viewBox="0 0 44 44" aria-hidden="true">
                    <circle
                      cx="22"
                      cy="22"
                      r={ringR}
                      fill="rgba(7, 10, 16, 0.8)"
                      stroke="rgba(255, 255, 255, 0.14)"
                      strokeWidth="3.5"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r={ringR}
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeDasharray={ringC}
                      strokeDashoffset={ringOffset}
                      style={{ transition: 'stroke-dashoffset 120ms linear, stroke 180ms ease' }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Sparkles
                      className={`w-4 h-4 ${
                        isFused
                          ? 'text-amber-300'
                          : isReady
                            ? 'text-amber-300'
                            : 'text-sky-300'
                      }`}
                    />
                  </div>
                </div>

                {/* Bond Strength Meter + Limited-Duration Fusion Action */}
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
                    <span
                      className={`font-bold whitespace-nowrap ${
                        isFused
                          ? 'text-amber-300'
                          : isReady
                            ? 'text-amber-200'
                            : 'text-slate-100'
                      }`}
                    >
                      {isFused ? 'اندماج روحي نشط' : 'الرابطة الروحية'}
                    </span>
                    <span
                      className={`font-mono-nums font-bold whitespace-nowrap ${
                        isFused
                          ? 'text-amber-300'
                          : isReady
                            ? 'text-amber-300'
                            : 'text-sky-300'
                      }`}
                    >
                      {isFused ? `${hud.fusionTimeLeft.toFixed(1)}ث` : `${bondPct}%`}
                    </span>
                  </div>

                  {/* 5-Segment Resonance Progress Meter */}
                  <div className="grid grid-cols-5 gap-1 h-1.5 w-full">
                    {[0, 1, 2, 3, 4].map((segIdx) => {
                      const segStart = segIdx * 20;
                      const segFill = Math.max(
                        0,
                        Math.min(1, (arcRatio * 100 - segStart) / 20),
                      );
                      return (
                        <div
                          key={segIdx}
                          className="h-full rounded-sm bg-black/65 overflow-hidden border border-white/10"
                        >
                          <div
                            className="h-full transition-all duration-100"
                            style={{
                              width: `${Math.round(segFill * 100)}%`,
                              backgroundColor: isFused
                                ? '#fbbf24'
                                : isReady
                                  ? '#f59e0b'
                                  : '#38bdf8',
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {isReady && hud.phase === 'flying' ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        if (repositionMode) return;
                        e.stopPropagation();
                        onActivateFusion();
                      }}
                      title="تفعيل قدرة الاندماج (Z)"
                      className="mt-0.5 flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>تفعيل الاندماج (Z)</span>
                    </button>
                  ) : (
                    <div className="flex items-center justify-between text-[10px] leading-none text-slate-300 whitespace-nowrap">
                      <span>
                        {isFused
                          ? 'سرعة وطاقة وهجوم مضاعف'
                          : hud.maneuverKind !== 'none'
                            ? 'مناورة ناجحة · جاري الشحن'
                            : 'نفّذ المناورات للشحن'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 1c. Tactical Corner Mini-map (Dragons, Threat Tiers, Ships & Nearby Missions) */}
          {(() => {
            const blips = hud.minimapBlips ?? [];
            const threatOrder: Record<ThreatLevel, number> = {
              low: 0,
              medium: 1,
              high: 2,
              critical: 3,
            };
            const kindOrder: Record<MinimapBlip['kind'], number> = {
              mission_landmark: 0,
              sanctuary: 1,
              ally_dragon: 2,
              pirate_ship: 3,
              enemy_dragon: 4,
            };
            const sortedBlips = [...blips].sort((a, b) => {
              const td = threatOrder[a.threat] - threatOrder[b.threat];
              if (td !== 0) return td;
              return kindOrder[a.kind] - kindOrder[b.kind];
            });

            let nearestEnemy: MinimapBlip | null = null;
            let maxThreat: ThreatLevel = 'low';
            let nearestLandmark: MinimapBlip | null = null;
            for (const b of blips) {
              if (b.kind === 'enemy_dragon' || b.kind === 'pirate_ship') {
                if (!nearestEnemy || b.distance < nearestEnemy.distance) {
                  nearestEnemy = b;
                }
                if (threatOrder[b.threat] > threatOrder[maxThreat]) {
                  maxThreat = b.threat;
                }
              } else if (
                (b.kind === 'mission_landmark' || b.kind === 'sanctuary') &&
                (!nearestLandmark || b.distance < nearestLandmark.distance)
              ) {
                nearestLandmark = b;
              }
            }

            const enemyThreatColor = (threat: ThreatLevel) => {
              switch (threat) {
                case 'critical':
                  return '#ef4444';
                case 'high':
                  return '#f97316';
                case 'medium':
                  return '#facc15';
                case 'low':
                default:
                  return '#fde047';
              }
            };

            const headingRad = (-hud.playerHeadingDeg * Math.PI) / 180;
            const compassCardinals = [
              { label: 'ش', angle: headingRad, color: '#fbbf24' },
              { label: 'ق', angle: headingRad + Math.PI * 0.5, color: '#94a3b8' },
              { label: 'ج', angle: headingRad + Math.PI, color: '#94a3b8' },
              { label: 'غ', angle: headingRad - Math.PI * 0.5, color: '#94a3b8' },
            ];

            const borderTone =
              repositionMode
                ? 'border-2 border-dashed border-amber-400 cursor-move'
                : maxThreat === 'critical'
                  ? 'border-rose-500/80 shadow-[0_0_16px_rgba(239,68,68,0.28)]'
                  : maxThreat === 'high'
                    ? 'border-orange-400/65'
                    : 'border-white/20';

            const RADAR_R = 45;
            const CX = 60;
            const CY = 60;

            return (
              <div
                dir="rtl"
                style={getControlStyle('minimap')}
                onPointerDown={(e) => {
                  if (!repositionMode) return;
                  e.stopPropagation();
                  draggingControlRef.current = 'minimap';
                }}
                className={`pointer-events-auto fixed z-20 flex flex-col items-center gap-1.5 rounded-2xl p-2 hud-surface ${borderTone}`}
              >
                <div className="relative w-[114px] h-[114px] sm:w-[126px] sm:h-[126px]">
                  <svg viewBox="0 0 120 120" className="w-full h-full" aria-label="الخريطة المصغرة">
                    <defs>
                      <radialGradient id="minimapBgGrad" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="rgba(15, 23, 42, 0.85)" />
                        <stop offset="100%" stopColor="rgba(2, 6, 23, 0.96)" />
                      </radialGradient>
                    </defs>

                    {/* Radar Disk */}
                    <circle
                      cx={CX}
                      cy={CY}
                      r="56"
                      fill="url(#minimapBgGrad)"
                      stroke="rgba(148, 163, 184, 0.22)"
                      strokeWidth="1"
                    />

                    {/* Range Rings */}
                    <circle
                      cx={CX}
                      cy={CY}
                      r={RADAR_R * 0.36}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.14)"
                      strokeWidth="0.75"
                    />
                    <circle
                      cx={CX}
                      cy={CY}
                      r={RADAR_R * 0.68}
                      fill="none"
                      stroke="rgba(148, 163, 184, 0.16)"
                      strokeWidth="0.75"
                      strokeDasharray="2.5 2.5"
                    />
                    <circle
                      cx={CX}
                      cy={CY}
                      r={RADAR_R}
                      fill="none"
                      stroke="rgba(56, 189, 248, 0.22)"
                      strokeWidth="0.9"
                    />

                    {/* Crosshairs */}
                    <line
                      x1={CX - RADAR_R}
                      y1={CY}
                      x2={CX + RADAR_R}
                      y2={CY}
                      stroke="rgba(148, 163, 184, 0.12)"
                      strokeWidth="0.75"
                    />
                    <line
                      x1={CX}
                      y1={CY - RADAR_R}
                      x2={CX}
                      y2={CY + RADAR_R}
                      stroke="rgba(148, 163, 184, 0.12)"
                      strokeWidth="0.75"
                    />

                    {/* Forward 60-degree Heading Cone */}
                    <path
                      d={`M ${CX} ${CY} L ${CX - RADAR_R * 0.5} ${CY - RADAR_R * 0.866} A ${RADAR_R} ${RADAR_R} 0 0 1 ${CX + RADAR_R * 0.5} ${CY - RADAR_R * 0.866} Z`}
                      fill="rgba(251, 191, 36, 0.10)"
                    />

                    {/* Rotating Compass Cardinals */}
                    {compassCardinals.map((c) => {
                      const tx = CX + 51.5 * Math.sin(c.angle);
                      const ty = CY - 51.5 * Math.cos(c.angle) + 2.4;
                      return (
                        <text
                          key={c.label}
                          x={tx}
                          y={ty}
                          textAnchor="middle"
                          fontSize="6.8"
                          fontWeight="700"
                          fill={c.color}
                        >
                          {c.label}
                        </text>
                      );
                    })}

                    {/* Radar Blips */}
                    {sortedBlips.map((b) => {
                      const bx = CX + b.relX * RADAR_R;
                      const by = CY - b.relY * RADAR_R;

                      if (b.kind === 'sanctuary') {
                        return (
                          <g key={b.id} transform={`translate(${bx}, ${by})`}>
                            <polygon
                              points="0,-4.2 3.8,0 0,4.2 -3.8,0"
                              fill="#34d399"
                              stroke="#022c22"
                              strokeWidth="0.9"
                            />
                            <circle r="1.1" fill="#ecfdf5" />
                          </g>
                        );
                      }

                      if (b.kind === 'mission_landmark') {
                        return (
                          <g key={b.id} transform={`translate(${bx}, ${by})`}>
                            <polygon
                              points="0,-4 1.3,-1.3 4,0 1.3,1.3 0,4 -1.3,1.3 -4,0 -1.3,-1.3"
                              fill="#2dd4bf"
                              stroke="#042f2e"
                              strokeWidth="0.7"
                            />
                          </g>
                        );
                      }

                      if (b.kind === 'ally_dragon') {
                        return (
                          <g key={b.id} transform={`translate(${bx}, ${by})`}>
                            <polygon
                              points="0,-3.6 3.1,2.8 0,1.4 -3.1,2.8"
                              fill="#38bdf8"
                              stroke="#082f49"
                              strokeWidth="0.8"
                            />
                          </g>
                        );
                      }

                      if (b.kind === 'pirate_ship') {
                        const col = enemyThreatColor(b.threat);
                        return (
                          <g key={b.id} transform={`translate(${bx}, ${by})`}>
                            {b.threat === 'critical' && (
                              <circle
                                r="5.8"
                                fill="none"
                                stroke={col}
                                strokeWidth="0.9"
                                strokeOpacity="0.85"
                              />
                            )}
                            <rect
                              x="-3"
                              y="-3"
                              width="6"
                              height="6"
                              rx="1"
                              transform="rotate(45)"
                              fill={col}
                              stroke="#0f172a"
                              strokeWidth="0.9"
                            />
                          </g>
                        );
                      }

                      // Enemy Dragon: Color + Geometry Scale by Proximity & Threat Level
                      const col = enemyThreatColor(b.threat);
                      const sz =
                        b.threat === 'critical'
                          ? 4.6
                          : b.threat === 'high'
                            ? 4.0
                            : b.threat === 'medium'
                              ? 3.5
                              : 3.1;
                      return (
                        <g key={b.id} transform={`translate(${bx}, ${by})`}>
                          {b.threat === 'critical' && (
                            <path
                              d="M -6.2,-2.5 L -6.2,-6.2 L -2.5,-6.2 M 2.5,-6.2 L 6.2,-6.2 L 6.2,-2.5 M -6.2,2.5 L -6.2,6.2 L -2.5,6.2 M 2.5,6.2 L 6.2,6.2 L 6.2,2.5"
                              fill="none"
                              stroke="#ef4444"
                              strokeWidth="1.05"
                            />
                          )}
                          {b.threat === 'high' && (
                            <circle
                              r="5.6"
                              fill="none"
                              stroke="#f97316"
                              strokeWidth="0.85"
                              strokeDasharray="2 1.8"
                            />
                          )}
                          <polygon
                            points={`0,${sz} ${sz * 0.9},${-sz * 0.8} 0,${-sz * 0.35} ${-sz * 0.9},${-sz * 0.8}`}
                            fill={col}
                            stroke="#090d16"
                            strokeWidth="0.85"
                          />
                        </g>
                      );
                    })}

                    {/* Player Dragon Center Arrowhead */}
                    <polygon
                      points="0,-5.4 4.2,4.2 0,2.1 -4.2,4.2"
                      transform={`translate(${CX}, ${CY})`}
                      fill="#ffffff"
                      stroke="#f59e0b"
                      strokeWidth="1.1"
                    />
                  </svg>
                </div>

                {/* Compact Tactical Readout */}
                <div className="w-full px-1 flex items-center justify-between gap-1 text-[10px] leading-none">
                  {nearestEnemy ? (
                    <>
                      <span
                        className={`font-bold truncate ${
                          maxThreat === 'critical'
                            ? 'text-rose-400'
                            : maxThreat === 'high'
                              ? 'text-orange-400'
                              : maxThreat === 'medium'
                                ? 'text-amber-300'
                                : 'text-yellow-200'
                        }`}
                      >
                        {maxThreat === 'critical'
                          ? 'خطر داهم'
                          : maxThreat === 'high'
                            ? 'تهديد قريب'
                            : 'عدو مرصود'}
                      </span>
                      <span className="font-mono-nums font-bold text-slate-100 whitespace-nowrap">
                        {nearestEnemy.distance}م
                      </span>
                    </>
                  ) : nearestLandmark ? (
                    <>
                      <span className="font-semibold text-teal-300 truncate max-w-[74px]">
                        {nearestLandmark.labelAr}
                      </span>
                      <span className="font-mono-nums text-slate-200 whitespace-nowrap">
                        {nearestLandmark.distance}م
                      </span>
                    </>
                  ) : (
                    <span className="text-slate-300 w-full text-center">الأجواء صافية</span>
                  )}
                </div>
              </div>
            );
          })()}

          {/* 2. Flight / Skydive / Explorer Joystick */}
          {(hud.phase === 'flying' ||
            hud.phase === 'skydiving' ||
            hud.phase === 'on_foot') && (
            <div
              style={getControlStyle('joystick')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'joystick';
              }}
              className={`pointer-events-auto fixed z-20 rounded-full p-1 ${
                repositionMode ? 'border-2 border-dashed border-amber-400 cursor-move' : ''
              }`}
            >
              <div
                ref={stickRef}
                onPointerDown={(e) => {
                  if (repositionMode) return;
                  e.stopPropagation();
                  activePointerId.current = e.pointerId;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  updateStickFromClient(e.clientX, e.clientY);
                }}
                onPointerMove={(e) => {
                  if (repositionMode || activePointerId.current !== e.pointerId) return;
                  e.stopPropagation();
                  updateStickFromClient(e.clientX, e.clientY);
                }}
                onPointerUp={(e) => {
                  if (!repositionMode && activePointerId.current === e.pointerId) {
                    resetStick();
                  }
                }}
                onPointerCancel={resetStick}
                className="relative w-28 h-28 rounded-full hud-surface flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
              >
                <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
                <div className="pointer-events-none absolute inset-x-4 h-px bg-white/10" />
                <div className="pointer-events-none absolute inset-y-4 w-px bg-white/10" />
                <div
                  className="pointer-events-none w-10 h-10 rounded-full bg-amber-400 border border-white/80 shadow-lg flex items-center justify-center text-slate-950"
                  style={{
                    transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
                  }}
                >
                  <Wind className="w-4 h-4" />
                </div>
              </div>
            </div>
          )}

          {/* 3. Element Switcher */}
          {hud.phase === 'flying' && (
            <div
              dir="rtl"
              style={getControlStyle('elements')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'elements';
              }}
              className={`pointer-events-auto fixed z-20 flex items-center gap-1 p-1 rounded-xl hud-surface ${
                repositionMode ? 'border-2 border-dashed border-amber-400 cursor-move' : ''
              }`}
            >
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('fire')}
                className={`flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'fire'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>نار</span>
              </button>
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('ice')}
                className={`flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'ice'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                <span>جليد</span>
              </button>
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('rock')}
                className={`flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'rock'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Mountain className="w-3.5 h-3.5" />
                <span>صخر</span>
              </button>
            </div>
          )}

          {/* 4. Maneuver, Boost, Roar, Skydive, Landing, Explorer & Boarding Actions */}
          {(hud.phase === 'flying' ||
            hud.phase === 'boarding' ||
            hud.phase === 'skydiving' ||
            hud.phase === 'on_foot') && (
            <div
              dir="rtl"
              style={getControlStyle('actions')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'actions';
              }}
              className={`pointer-events-auto fixed z-20 flex flex-col items-center gap-1.5 p-1.5 rounded-2xl hud-surface ${
                repositionMode ? 'border-2 border-dashed border-amber-400 cursor-move' : ''
              }`}
            >
              {hud.phase === 'flying' && (
                <div className="grid grid-cols-2 gap-1.5 w-[166px]">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onTriggerHalfLoop();
                    }}
                    title="التفاف نصف دائري (X)"
                    className={`flex items-center justify-center gap-1 rounded-xl h-8 px-2 text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      hud.isLooping
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-white/[0.04] border-white/10 text-sky-200 hover:border-sky-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                    <span>التفاف</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onToggleKnifeEdge();
                    }}
                    title="ميلان أفقي 90 درجة (K)"
                    className={`flex items-center justify-center gap-1 rounded-xl h-8 px-2 text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      hud.knifeEdgeSide !== 0
                        ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                        : 'bg-white/[0.04] border-white/10 text-sky-200 hover:border-amber-400'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5 shrink-0" />
                    <span>ميلان 90°</span>
                  </button>

                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onBoostingChange(true);
                    }}
                    onPointerUp={() => !repositionMode && onBoostingChange(false)}
                    onPointerLeave={() => !repositionMode && onBoostingChange(false)}
                    onPointerCancel={() => !repositionMode && onBoostingChange(false)}
                    className="flex items-center justify-center gap-1 rounded-xl h-8 px-2 text-[11px] font-bold text-white bg-white/[0.04] border border-white/10 hover:border-amber-400 active:bg-amber-500 active:text-slate-950 transition-colors cursor-pointer touch-none whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>اندفاع</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onSkydive();
                    }}
                    title="قفز من التنين (U)"
                    className="flex items-center justify-center gap-1 rounded-xl h-8 px-2 text-[11px] font-bold text-sky-100 bg-white/[0.04] border border-white/10 hover:border-sky-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Feather className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span>قفز حر</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onLandDragon();
                    }}
                    title="إنزال التنين (G)"
                    className="flex items-center justify-center gap-1 rounded-xl h-8 px-2 text-[11px] font-bold text-amber-100 bg-white/[0.04] border border-white/10 hover:border-amber-400 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>هبوط</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onRoar();
                    }}
                    className="flex items-center justify-center rounded-xl h-8 px-2 text-[11px] font-bold text-slate-200 bg-white/[0.04] border border-white/10 hover:border-white/35 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span>زئير</span>
                  </button>
                </div>
              )}

              {hud.phase === 'skydiving' && (
                <button
                  type="button"
                  onClick={(e) => {
                    if (repositionMode) return;
                    e.stopPropagation();
                    onRecallDragon();
                  }}
                  title="استدعاء التنين (U / G)"
                  className="flex items-center justify-center gap-1.5 rounded-xl h-10 px-4 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-200 shadow-lg cursor-pointer whitespace-nowrap"
                >
                  <Anchor className="w-4 h-4 shrink-0" />
                  <span>نداء التنين</span>
                </button>
              )}

              {hud.phase === 'on_foot' && (
                <div className="grid grid-cols-2 gap-1.5 w-[166px]">
                  <button
                    type="button"
                    onPointerDown={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onBoostingChange(true);
                    }}
                    onPointerUp={() => !repositionMode && onBoostingChange(false)}
                    onPointerLeave={() => !repositionMode && onBoostingChange(false)}
                    onPointerCancel={() => !repositionMode && onBoostingChange(false)}
                    className="flex items-center justify-center gap-1 rounded-xl h-9 px-2 text-[11px] font-bold text-white bg-white/[0.04] border border-white/10 hover:border-amber-400 active:bg-amber-500 active:text-slate-950 cursor-pointer touch-none whitespace-nowrap"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                    <span>جري</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onKnightJump();
                    }}
                    title="قفز (Space)"
                    className="flex items-center justify-center gap-1 rounded-xl h-9 px-2 text-[11px] font-bold text-sky-100 bg-white/[0.04] border border-white/10 hover:border-sky-400 cursor-pointer whitespace-nowrap"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-sky-300 shrink-0" />
                    <span>قفز</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onRemountDragon();
                    }}
                    title="امتطاء التنين (G)"
                    className={`col-span-2 flex items-center justify-center gap-1.5 rounded-xl h-9 px-3 text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      hud.nearLandedDragon
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-200'
                        : 'bg-white/[0.06] text-amber-200 border-amber-400/50 hover:border-amber-300'
                    }`}
                  >
                    <Wind className="w-4 h-4 shrink-0" />
                    <span>امتطاء</span>
                  </button>
                </div>
              )}

              {(hud.phase === 'on_foot' ||
                (hud.phase === 'flying' && !hud.boardableEnemyId)) && (
                <button
                  type="button"
                  onClick={(e) => {
                    if (repositionMode) return;
                    e.stopPropagation();
                    onSwordSlash();
                  }}
                  title="ضربة سيف (F)"
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl h-8 px-3 text-[11px] font-bold text-amber-100 bg-rose-700/80 hover:bg-rose-600/90 border border-amber-300/55 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Swords className="w-3.5 h-3.5 text-amber-200 shrink-0" />
                  <span>ضربة سيف</span>
                </button>
              )}

              {(hud.boardableEnemyId || hud.phase === 'boarding') && (
                <button
                  type="button"
                  onClick={(e) => {
                    if (repositionMode) return;
                    e.stopPropagation();
                    if (hud.phase === 'boarding') {
                      onSwordSlash();
                    } else {
                      onTryBoard();
                    }
                  }}
                  className="w-16 h-16 rounded-full bg-rose-600/90 hover:bg-rose-500 text-white border-2 border-amber-300 shadow-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                >
                  <Swords className="w-5 h-5" />
                  <span className="text-[10px] font-extrabold">
                    {hud.phase === 'boarding' ? 'سيف' : 'قفز'}
                  </span>
                </button>
              )}
            </div>
          )}

          {/* 5. Primary Dragon Breath Attack Button */}
          {hud.phase === 'flying' && (
            <div
              style={getControlStyle('attack')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'attack';
              }}
              className={`pointer-events-auto fixed z-20 rounded-full p-1 ${
                repositionMode ? 'border-2 border-dashed border-amber-400 cursor-move' : ''
              }`}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  if (repositionMode) return;
                  e.stopPropagation();
                  onFiringChange(true);
                }}
                onPointerUp={() => !repositionMode && onFiringChange(false)}
                onPointerLeave={() => !repositionMode && onFiringChange(false)}
                onPointerCancel={() => !repositionMode && onFiringChange(false)}
                className={`w-20 h-20 rounded-full border-2 shadow-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer touch-none active:scale-95 transition-transform ${elementAccent}`}
              >
                <ElementIcon className="w-7 h-7" />
                <span className="text-[10px] font-extrabold">هجوم</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* HUD Layout & Fullscreen Settings Modal */}
      {showSettings && (
        <HudSettingsModal
          layout={layout}
          isFullscreen={isFullscreen}
          onChangeLayout={onChangeLayout}
          onStartReposition={() => {
            setShowSettings(false);
            setCinemaMode(false);
            setRepositionMode(true);
          }}
          onToggleFullscreen={onToggleFullscreen}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};
