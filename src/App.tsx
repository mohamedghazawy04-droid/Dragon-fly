import { useCallback, useEffect, useRef, useState } from 'react';
import { FlightHud } from './components/FlightHud';
import { LoreLibraryModal } from './components/LoreLibraryModal';
import { SanctuaryBondOverlay } from './components/SanctuaryBondOverlay';
import { SanctuaryRestOverlay } from './components/SanctuaryRestOverlay';
import { UpgradesModal } from './components/UpgradesModal';
import { DragonEngine } from './game/DragonEngine';
import {
  DEFAULT_HUD_LAYOUT,
  DEFAULT_PROGRESSION,
  HudControlId,
  HudLayoutConfig,
  HudState,
} from './game/types';

const LAYOUT_STORAGE_KEY = 'dragon_hud_layout_v1';

function loadSavedLayout(): HudLayoutConfig {
  try {
    const raw = window.localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_HUD_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<HudLayoutConfig>;
    const rawPos: Partial<Record<HudControlId, { xPct?: unknown; yPct?: unknown }>> =
      parsed.positions ?? {};
    const safePoint = (
      pt: { xPct?: unknown; yPct?: unknown } | undefined,
      fallback: { xPct: number; yPct: number },
    ) => ({
      xPct:
        typeof pt?.xPct === 'number' && Number.isFinite(pt.xPct)
          ? Math.max(5, Math.min(95, pt.xPct))
          : fallback.xPct,
      yPct:
        typeof pt?.yPct === 'number' && Number.isFinite(pt.yPct)
          ? Math.max(5, Math.min(95, pt.yPct))
          : fallback.yPct,
    });
    return {
      positions: {
        vitals: safePoint(rawPos.vitals, DEFAULT_HUD_LAYOUT.positions.vitals),
        bond: safePoint(rawPos.bond, DEFAULT_HUD_LAYOUT.positions.bond),
        minimap: safePoint(rawPos.minimap, DEFAULT_HUD_LAYOUT.positions.minimap),
        joystick: safePoint(rawPos.joystick, DEFAULT_HUD_LAYOUT.positions.joystick),
        elements: safePoint(rawPos.elements, DEFAULT_HUD_LAYOUT.positions.elements),
        actions: safePoint(rawPos.actions, DEFAULT_HUD_LAYOUT.positions.actions),
        attack: safePoint(rawPos.attack, DEFAULT_HUD_LAYOUT.positions.attack),
      },
      buttonScale:
        typeof parsed.buttonScale === 'number' && Number.isFinite(parsed.buttonScale)
          ? parsed.buttonScale
          : DEFAULT_HUD_LAYOUT.buttonScale,
      buttonOpacity:
        typeof parsed.buttonOpacity === 'number' && Number.isFinite(parsed.buttonOpacity)
          ? parsed.buttonOpacity
          : DEFAULT_HUD_LAYOUT.buttonOpacity,
      compactTopBar:
        typeof parsed.compactTopBar === 'boolean'
          ? parsed.compactTopBar
          : DEFAULT_HUD_LAYOUT.compactTopBar,
      showIndicators:
        typeof parsed.showIndicators === 'boolean'
          ? parsed.showIndicators
          : DEFAULT_HUD_LAYOUT.showIndicators,
    };
  } catch {
    return DEFAULT_HUD_LAYOUT;
  }
}

const INITIAL_HUD: HudState = {
  phase: 'sanctuary_bond',
  mode: 'combat',
  dragonId: 'ignis',
  activeElement: 'fire',
  hp: 120,
  maxHp: 120,
  energy: 100,
  maxEnergy: 100,
  bondLevel: 35,
  speed: 0,
  altitude: 56,
  zoneNameAr: 'كهف ملاذ الصخور',
  isSkimmingWater: false,
  isSlicingCloud: false,
  nearSanctuary: true,
  boardableEnemyId: null,
  boardableEnemyName: null,
  boardingHits: 0,
  boardingHitsRequired: 3,
  allyScore: 0,
  enemyScore: 0,
  alliesAlive: 3,
  enemiesAlive: 4,
  indicators: [],
  minimapBlips: [],
  playerHeadingDeg: 0,
  toastMessage: null,
  activeFlightTip: null,
  woundsCount: 0,
  pointerLocked: false,
  weather: 'clear',
  weatherMode: 'auto',
  stormIntensity: 0,
  lightningActive: false,
  cameraView: 'full',
  isLooping: false,
  knifeEdgeSide: 0,
  maneuverKind: 'none',
  maneuverSide: 0,
  maneuverIntensity: 0,
  bankAngleDeg: 0,
  motionBlurIntensity: 0,
  isBoosting: false,
  nearLandedDragon: false,
  isInWater: false,
  warType: 'both',
  warTimeLeft: 120,
  warDuration: 120,
  warStatus: 'idle',
  warDragonsKilled: 0,
  warDragonsGoal: 3,
  warShipsSunk: 0,
  warShipsGoal: 3,
  progression: DEFAULT_PROGRESSION,
  dangerAlertActive: false,
  activeLoreTaleId: null,
  activeLoreSegment: 0,
  isLorePlaying: false,
  knightSpeechText: null,
  spiritualBond: 25,
  fusionActive: false,
  fusionTimeLeft: 0,
  fusionDuration: 14,
  inWindCurrent: false,
  windCurrentIntensity: 0,
  autoCinematicEnabled: true,
  cinematicActive: false,
  cinematicLandmarkNameAr: null,
  cinematicLandmarkSubtitleAr: null,
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<DragonEngine | null>(null);
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layout, setLayout] = useState<HudLayoutConfig>(() => loadSavedLayout());
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [showLoreModal, setShowLoreModal] = useState(false);

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new DragonEngine(container, (nextState) => {
      setHud(nextState);
    });
    engineRef.current = engine;

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const handleChangeLayout = useCallback((next: HudLayoutConfig) => {
    setLayout(next);
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        const orientation = screen.orientation as
          | (ScreenOrientation & { lock?: (orientation: string) => Promise<void> })
          | undefined;
        await orientation?.lock?.('landscape').catch(() => {});
      } else {
        await document.exitFullscreen();
        const orientation = screen.orientation as
          | (ScreenOrientation & { unlock?: () => void })
          | undefined;
        orientation?.unlock?.();
      }
    } catch {
      // Fullscreen may be blocked by host frame policy
    }
  }, []);

  const handleToggleMute = () => {
    const engine = engineRef.current;
    if (!engine) return;
    const next = !muted;
    engine.setMuted(next);
    setMuted(next);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#070a10]">
      {/* Dedicated isolated WebGL canvas container */}
      <div ref={canvasMountRef} className="w-full h-full" />

      {/* Phase-specific Semantic DOM Overlays */}
      {hud.phase === 'sanctuary_bond' && (
        <SanctuaryBondOverlay
          hud={hud}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onSelectDragon={(id) => engineRef.current?.selectDragon(id)}
          onBondStep={() => engineRef.current?.bondStep()}
          onSelectMode={(m) => engineRef.current?.setMode(m)}
          onSelectWarType={(wt) => engineRef.current?.setWarType(wt)}
          onOpenUpgrades={() => setShowUpgradesModal(true)}
          onOpenLore={() => setShowLoreModal(true)}
          onLaunch={() => {
            setShowLoreModal(false);
            setShowUpgradesModal(false);
            engineRef.current?.launchFlight();
          }}
        />
      )}

      {(hud.phase === 'flying' ||
        hud.phase === 'boarding' ||
        hud.phase === 'skydiving' ||
        hud.phase === 'on_foot') && (
        <FlightHud
          hud={hud}
          muted={muted}
          isFullscreen={isFullscreen}
          layout={layout}
          onChangeLayout={handleChangeLayout}
          onToggleFullscreen={handleToggleFullscreen}
          onToggleMute={handleToggleMute}
          onSelectElement={(el) => engineRef.current?.setActiveElement(el)}
          onSelectMode={(m) => engineRef.current?.setMode(m)}
          onSelectWeatherMode={(wm) => engineRef.current?.setWeatherMode(wm)}
          onToggleCameraView={() => engineRef.current?.toggleCameraView()}
          onToggleAutoCinematic={() => engineRef.current?.toggleAutoCinematic()}
          onTriggerHalfLoop={() => engineRef.current?.triggerHalfLoop()}
          onToggleKnifeEdge={() => engineRef.current?.toggleKnifeEdge()}
          onSkydive={() => engineRef.current?.jumpOffDragon()}
          onRecallDragon={() => engineRef.current?.recallDragon()}
          onLandDragon={() => engineRef.current?.landDragon()}
          onKnightJump={() => engineRef.current?.jumpOnFoot()}
          onRemountDragon={() => engineRef.current?.remountDragon()}
          onReturnSanctuary={() => engineRef.current?.returnToSanctuary()}
          onTryBoard={() => engineRef.current?.tryBoardEnemy()}
          onSwordSlash={() => engineRef.current?.performSwordSlash()}
          onFiringChange={(active) => engineRef.current?.setFiring(active)}
          onBoostingChange={(active) => engineRef.current?.setBoosting(active)}
          onManualSteer={(x, y) => engineRef.current?.setManualSteer(x, y)}
          onRoar={() => engineRef.current?.triggerRoar()}
          onFlyLandmark={(id) => engineRef.current?.flyToLandmark(id)}
          onRequestPointerLock={() => engineRef.current?.requestPointerLock()}
          onOpenUpgrades={() => setShowUpgradesModal(true)}
          onStartNewWar={() => engineRef.current?.startNewWarWave()}
          onActivateFusion={() => engineRef.current?.activateFusion()}
          onDismissFlightTip={() => engineRef.current?.dismissFlightTip()}
        />
      )}

      {hud.phase === 'resting' && (
        <SanctuaryRestOverlay
          hud={hud}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onTendWounds={() => engineRef.current?.tendWounds()}
          onRechargeEnergy={() => engineRef.current?.rechargeEnergy()}
          onSelectDragon={(id) => engineRef.current?.selectDragon(id)}
          onSelectMode={(m) => engineRef.current?.setMode(m)}
          onSelectWarType={(wt) => engineRef.current?.setWarType(wt)}
          onOpenUpgrades={() => setShowUpgradesModal(true)}
          onOpenLore={() => setShowLoreModal(true)}
          onTakeOff={() => {
            setShowLoreModal(false);
            setShowUpgradesModal(false);
            engineRef.current?.launchFlight();
          }}
        />
      )}

      {showUpgradesModal && (
        <UpgradesModal
          hud={hud}
          onSelectWarType={(wt) => engineRef.current?.setWarType(wt)}
          onUpgradeKnight={(k) => engineRef.current?.upgradeKnight(k)}
          onUpgradeDragon={(k) => engineRef.current?.upgradeDragon(k)}
          onSaveProgression={() => engineRef.current?.saveProgression()}
          onResetProgression={() => engineRef.current?.resetProgression()}
          onClose={() => setShowUpgradesModal(false)}
        />
      )}

      {showLoreModal && (
        <LoreLibraryModal
          hud={hud}
          muted={muted}
          onPlayTale={(id) => engineRef.current?.playLoreTale(id)}
          onStopTale={() => engineRef.current?.stopLoreTale()}
          onClose={() => setShowLoreModal(false)}
        />
      )}

      {/* Classical Arabic Spoken Dialogue Overlay in Bright Orange Font */}
      {hud.knightSpeechText && (
        <div
          dir="rtl"
          className="pointer-events-none select-none fixed inset-x-0 bottom-20 sm:bottom-24 z-40 flex justify-center px-4"
        >
          <div className="max-w-2xl bg-gradient-to-r from-transparent via-slate-950/80 to-transparent px-8 sm:px-12 py-2.5 text-center">
            <p className="font-display text-lg sm:text-2xl md:text-[26px] font-bold leading-relaxed text-[#ff8c24] drop-shadow-[0_2px_8px_rgba(0,0,0,0.95)]">
              « {hud.knightSpeechText} »
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
