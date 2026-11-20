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

      {/* Top-Right Compact Utility Toolbar (Transparent, edge-hugging so nothing blocks the world!) */}
      {!repositionMode && (
        <div
          className="pointer-events-auto fixed top-2.5 right-3 z-20 flex flex-wrap items-center justify-end gap-1"
          style={{ opacity: Math.max(0.65, layout.buttonOpacity) }}
        >
          {/* Weather Segmented Pill */}
          <div className="flex items-center gap-0.5 rounded-xl p-0.5 bg-slate-950/55 border border-white/15">
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
                  className={`flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-medium transition-colors cursor-pointer ${
                    active
                      ? id === 'storm'
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : id === 'rain'
                          ? 'bg-sky-300 text-slate-950 font-bold'
                          : 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {!layout.compactTopBar && <span className="hidden md:inline">{label}</span>}
                </button>
              );
            })}
          </div>

          {hud.mode === 'combat' && !layout.compactTopBar && (
            <div
              className={`flex items-center gap-2 rounded-xl px-2.5 py-1 bg-slate-950/55 border text-[11px] font-mono-nums ${
                hud.dangerAlertActive
                  ? 'border-rose-400/80 text-rose-200'
                  : 'border-white/15'
              }`}
            >
              <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                <Clock className="w-3 h-3" />
                {warTimeFormatted}
              </span>
              {hud.warType !== 'ships' && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="inline-flex items-center gap-1 text-sky-300 font-bold">
                    <Wind className="w-3 h-3" />
                    {hud.warDragonsKilled}/{hud.warDragonsGoal}
                  </span>
                </>
              )}
              {hud.warType !== 'dragons' && (
                <>
                  <span className="text-slate-600">|</span>
                  <span className="inline-flex items-center gap-1 text-orange-300 font-bold">
                    <Ship className="w-3 h-3" />
                    {hud.warShipsSunk}/{hud.warShipsGoal}
                  </span>
                </>
              )}
            </div>
          )}

          {hud.mode === 'combat' && (
            <button
              type="button"
              onClick={onOpenUpgrades}
              title="ترسانة الفارس وتطويرات التنين"
              className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] bg-slate-950/55 border border-white/15 text-sky-200 hover:text-white cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              {!layout.compactTopBar && <span className="hidden sm:inline">تطوير</span>}
              {totalUpgradePts > 0 && (
                <span className="font-mono-nums font-bold text-amber-300">
                  +{totalUpgradePts}
                </span>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowLandmarks((v) => !v)}
            title="الخريطة والمواقع"
            className={`flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] bg-slate-950/55 border transition-colors cursor-pointer ${
              showLandmarks
                ? 'border-amber-400 text-amber-200'
                : 'border-white/15 text-slate-200 hover:text-white'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            {!layout.compactTopBar && <span className="hidden sm:inline">المناطق</span>}
          </button>

          <button
            type="button"
            onClick={onToggleCameraView}
            title="تبديل المنظور (V)"
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] bg-slate-950/55 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            {!layout.compactTopBar && (
              <span className="hidden lg:inline">
                {hud.cameraView === 'full' ? 'كامل' : 'فارس'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectMode(hud.mode === 'combat' ? 'free' : 'combat')}
            title={hud.mode === 'combat' ? 'وضع التحليق الحر' : 'وضع حرب السماء'}
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] bg-slate-950/55 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
          >
            {hud.mode === 'combat' ? (
              <Compass className="w-3.5 h-3.5 text-sky-300" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-amber-300" />
            )}
            {!layout.compactTopBar && (
              <span className="hidden sm:inline">
                {hud.mode === 'combat' ? 'سلم/أشجار' : 'حرب'}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onRequestPointerLock}
            title="توجيه بالماوس"
            className={`hidden md:flex items-center rounded-xl p-1.5 bg-slate-950/55 border transition-colors cursor-pointer ${
              hud.pointerLocked
                ? 'border-amber-400 text-amber-300'
                : 'border-white/15 text-slate-200 hover:text-white'
            }`}
          >
            <MousePointer2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={onReturnSanctuary}
            title="العودة للملاذ الصخري"
            className="flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] bg-slate-950/55 border border-white/15 text-amber-200 hover:text-white cursor-pointer"
          >
            <Home className="w-3.5 h-3.5" />
            {!layout.compactTopBar && <span className="hidden sm:inline">الملاذ</span>}
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title="ملء الشاشة الأفقي"
            className="flex items-center justify-center rounded-xl p-1.5 bg-slate-950/55 border border-white/15 text-amber-300 hover:text-white cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            title="إعدادات وتوزيع الأزرار"
            className="flex items-center justify-center rounded-xl p-1.5 bg-slate-950/55 border border-white/15 text-sky-300 hover:text-white cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setCinemaMode((v) => !v)}
            title="إخفاء الأزرار (H)"
            className="flex items-center justify-center rounded-xl p-1.5 bg-slate-950/55 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
          >
            {cinemaMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'تشغيل الصوت' : 'كتم الصوت'}
            className="flex items-center justify-center rounded-xl p-1.5 bg-slate-950/55 border border-white/15 text-slate-200 hover:text-white cursor-pointer"
          >
            {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Landmarks Quick Teleport Dropdown */}
      {showLandmarks && !repositionMode && (
        <div className="pointer-events-auto fixed top-12 right-3 left-3 mx-auto max-w-4xl z-30 grid grid-cols-3 sm:grid-cols-5 gap-1.5 rounded-xl p-2 hud-surface-strong">
          {WORLD_LANDMARKS.map((lm) => (
            <button
              key={lm.id}
              type="button"
              onClick={() => {
                onFlyLandmark(lm.id);
                setShowLandmarks(false);
              }}
              className="text-right rounded-lg p-2 bg-white/5 hover:bg-amber-500/20 border border-white/10 transition-colors cursor-pointer"
            >
              <div className="text-[11px] font-bold text-amber-200 truncate">{lm.nameAr}</div>
              <div className="text-[9px] text-slate-400 truncate">{lm.subtitleAr}</div>
            </button>
          ))}
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
          {/* 1. Vitals Bar (Compact HP / Energy) */}
          {(!layout.compactTopBar || repositionMode) && (
            <div
              style={getControlStyle('vitals')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'vitals';
              }}
              className={`pointer-events-auto fixed z-20 flex items-center gap-2.5 rounded-xl px-3 py-1.5 bg-slate-950/55 border ${
                repositionMode
                  ? 'border-2 border-dashed border-amber-400 cursor-move'
                  : 'border-white/15'
              }`}
            >
              <div className="w-20">
                <div className="flex justify-between text-[10px]">
                  <span className="font-bold text-white">{spec.nameAr}</span>
                  <span className="font-mono-nums text-emerald-300">{hud.hp}</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-black/60 overflow-hidden">
                  <div className="h-full bg-emerald-400" style={{ width: `${hpPct}%` }} />
                </div>
              </div>
              <div className="w-16">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-300">طاقة</span>
                  <span className="font-mono-nums text-amber-300">{energyPct}%</span>
                </div>
                <div className="mt-0.5 h-1.5 rounded-full bg-black/60 overflow-hidden">
                  <div className="h-full bg-amber-400" style={{ width: `${energyPct}%` }} />
                </div>
              </div>
              <span className="hidden md:inline font-mono-nums text-[10px] text-slate-300">
                {hud.speed}م/ث
              </span>
            </div>
          )}

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
                className="relative w-28 h-28 rounded-full bg-slate-950/45 border border-white/25 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
              >
                <div className="pointer-events-none absolute inset-3 rounded-full border border-white/10" />
                <div
                  className="pointer-events-none w-10 h-10 rounded-full bg-amber-400/85 border border-white shadow-lg flex items-center justify-center text-slate-950"
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
              style={getControlStyle('elements')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'elements';
              }}
              className={`pointer-events-auto fixed z-20 flex items-center gap-1 p-1 rounded-xl bg-slate-950/55 border ${
                repositionMode
                  ? 'border-2 border-dashed border-amber-400 cursor-move'
                  : 'border-white/15'
              }`}
            >
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('fire')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'fire'
                    ? 'bg-orange-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>نار</span>
              </button>
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('ice')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'ice'
                    ? 'bg-sky-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                <span>جليد</span>
              </button>
              <button
                type="button"
                onClick={() => !repositionMode && onSelectElement('rock')}
                className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors cursor-pointer ${
                  hud.activeElement === 'rock'
                    ? 'bg-amber-400 text-slate-950'
                    : 'text-slate-300 hover:text-white'
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
              style={getControlStyle('actions')}
              onPointerDown={(e) => {
                if (!repositionMode) return;
                e.stopPropagation();
                draggingControlRef.current = 'actions';
              }}
              className={`pointer-events-auto fixed z-20 flex flex-col gap-1.5 p-1 rounded-xl ${
                repositionMode ? 'border-2 border-dashed border-amber-400 cursor-move' : ''
              }`}
            >
              {hud.phase === 'flying' && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onTriggerHalfLoop();
                    }}
                    title="التفاف نصف دائري (X)"
                    className={`flex items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold bg-slate-950/55 border cursor-pointer ${
                      hud.isLooping
                        ? 'border-amber-400 text-amber-300'
                        : 'border-white/15 text-sky-200 hover:border-sky-400'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
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
                    className={`flex items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold bg-slate-950/55 border cursor-pointer ${
                      hud.knifeEdgeSide !== 0
                        ? 'border-amber-400 bg-amber-500/25 text-amber-200'
                        : 'border-white/15 text-sky-200 hover:border-amber-400'
                    }`}
                  >
                    <RotateCw className="w-3.5 h-3.5" />
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
                    className="flex items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-white bg-slate-950/55 border border-white/15 hover:border-amber-400 active:bg-amber-500 active:text-slate-950 cursor-pointer touch-none"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
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
                    className="flex items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-sky-100 bg-slate-950/55 border border-white/15 hover:border-sky-400 cursor-pointer"
                  >
                    <Feather className="w-3.5 h-3.5 text-sky-300" />
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
                    className="flex items-center justify-center gap-1 rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-amber-100 bg-slate-950/55 border border-white/15 hover:border-amber-400 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-amber-300" />
                    <span>هبوط</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      if (repositionMode) return;
                      e.stopPropagation();
                      onRoar();
                    }}
                    className="flex items-center justify-center rounded-xl px-2.5 py-1.5 text-[11px] font-bold text-slate-200 bg-slate-950/55 border border-white/15 hover:border-white/40 cursor-pointer"
                  >
                    <span>زئير</span>
                  </button>
                </>
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
                  className="flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 border border-amber-200 shadow-lg cursor-pointer"
                >
                  <Anchor className="w-4 h-4" />
                  <span>نداء التنين</span>
                </button>
              )}

              {hud.phase === 'on_foot' && (
                <>
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
                    className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-bold text-white bg-slate-950/60 border border-white/15 hover:border-amber-400 active:bg-amber-500 active:text-slate-950 cursor-pointer touch-none"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
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
                    className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-bold text-sky-100 bg-slate-950/60 border border-white/15 hover:border-sky-400 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5 text-sky-300" />
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
                    className={`flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold border shadow-lg cursor-pointer ${
                      hud.nearLandedDragon
                        ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 border-amber-200'
                        : 'bg-slate-950/60 text-amber-200 border-amber-400/50 hover:border-amber-300'
                    }`}
                  >
                    <Wind className="w-4 h-4" />
                    <span>امتطاء</span>
                  </button>
                </>
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
                  className="flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-bold text-amber-100 bg-rose-700/75 hover:bg-rose-600/85 border border-amber-300/60 cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5 text-amber-200" />
                  <span>سيف</span>
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
