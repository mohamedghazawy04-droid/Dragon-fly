import React from 'react';
import {
  BookOpen,
  Compass,
  Flame,
  HeartHandshake,
  Maximize2,
  Minimize2,
  Mountain,
  Palette,
  Shield,
  Ship,
  Snowflake,
  Sparkles,
  Swords,
  Wind,
} from 'lucide-react';
import {
  ANCIENT_LORE_TALES,
  DRAGON_SPECS,
  DragonId,
  GameMode,
  HudState,
  WarTargetType,
} from '../game/types';

interface SanctuaryBondOverlayProps {
  hud: HudState;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onSelectDragon: (id: DragonId) => void;
  onBondStep: () => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectWarType: (warType: WarTargetType) => void;
  onOpenUpgrades: () => void;
  onOpenCustomize: () => void;
  onOpenLore: () => void;
  onLaunch: () => void;
}

export const SanctuaryBondOverlay: React.FC<SanctuaryBondOverlayProps> = ({
  hud,
  isFullscreen,
  onToggleFullscreen,
  onSelectDragon,
  onBondStep,
  onSelectMode,
  onSelectWarType,
  onOpenUpgrades,
  onOpenCustomize,
  onOpenLore,
  onLaunch,
}) => {
  const currentSpec = DRAGON_SPECS[hud.dragonId];
  const isBonded = hud.bondLevel >= 100;
  const totalPoints = hud.progression.knightPoints + hud.progression.dragonPoints;
  const unlockedLoreCount = ANCIENT_LORE_TALES.filter(
    (t) => hud.progression.loreElapsedSeconds >= t.unlockSeconds,
  ).length;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      {/* Top Title Header */}
      <header className="pointer-events-auto mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 hud-surface-strong">
        <div className="flex items-baseline gap-2.5">
          <h1 className="font-display text-xl md:text-2xl font-bold tracking-wide text-amber-300 whitespace-nowrap">
            أجنحة السماء: فرسان التنانين
          </h1>
          <span className="hidden sm:inline text-xs text-slate-400">
            · كهف ملاذ الصخور
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 rounded-xl bg-black/45 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => onSelectMode('combat')}
              className={`flex items-center gap-1.5 rounded-lg h-7 px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hud.mode === 'combat'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>حرب السماء</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectMode('free')}
              className={`flex items-center gap-1.5 rounded-lg h-7 px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hud.mode === 'free'
                  ? 'bg-sky-400 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>تحليق حر</span>
            </button>
          </div>

          {hud.mode === 'combat' && (
            <div className="hidden md:flex items-center gap-1 rounded-xl bg-black/45 p-1 border border-white/10">
              {(
                [
                  { id: 'dragons', label: 'تنانين', Icon: Wind },
                  { id: 'ships', label: 'سفن', Icon: Ship },
                  { id: 'both', label: 'كلاهما', Icon: Swords },
                ] as const
              ).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectWarType(id)}
                  className={`flex items-center gap-1 rounded-lg h-7 px-2.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    hud.warType === id
                      ? 'bg-sky-500 text-slate-950 font-bold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenLore}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 h-9 px-3 text-xs font-medium text-amber-200 border border-white/12 transition-colors cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="w-3.5 h-3.5 text-amber-300" />
              <span>الأساطير</span>
              <span className="font-mono-nums text-[11px] text-slate-300">
                {unlockedLoreCount}/{ANCIENT_LORE_TALES.length}
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenUpgrades}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 h-9 px-3 text-xs font-medium text-sky-200 border border-white/12 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              <span>التطويرات</span>
              {totalPoints > 0 && (
                <span className="font-mono-nums text-[11px] font-bold text-amber-300">
                  +{totalPoints}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onOpenCustomize}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 h-9 px-3 text-xs font-medium text-amber-200 border border-white/12 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Palette className="w-3.5 h-3.5 text-amber-300" />
              <span>المظهر</span>
            </button>

            <button
              type="button"
              onClick={onToggleFullscreen}
              title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة الأفقي'}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 h-9 px-3 text-xs font-medium text-slate-200 border border-white/12 transition-colors cursor-pointer whitespace-nowrap"
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span className="hidden md:inline">
                {isFullscreen ? 'تصغير' : 'ملء الشاشة'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Center remains unobstructed so the 3D Dragon inside the Rock Cavern shines */}

      {/* Bottom Bonding & Selection Dock */}
      <section className="pointer-events-auto mx-auto w-full max-w-5xl rounded-2xl p-3.5 md:p-4 hud-surface-strong">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Dragon Selection Cards (3 dragons) */}
          <div className="lg:col-span-7 grid grid-cols-3 gap-2.5">
            {(['ignis', 'glacius', 'terra'] as DragonId[]).map((id) => {
              const spec = DRAGON_SPECS[id];
              const active = hud.dragonId === id;
              const Icon =
                id === 'ignis' ? Flame : id === 'glacius' ? Snowflake : Mountain;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectDragon(id)}
                  className={`flex flex-col justify-between text-right rounded-xl p-3 transition-colors cursor-pointer border ${
                    active
                      ? 'bg-amber-500/12 border-amber-400/75'
                      : 'bg-white/[0.04] border-white/10 hover:border-white/25 hover:bg-white/[0.07]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-display text-lg font-bold text-white whitespace-nowrap">
                        {spec.nameAr}
                      </span>
                      <Icon
                        className="w-4 h-4 shrink-0"
                        style={{ color: spec.accentHex }}
                      />
                    </div>
                    <div className="text-xs text-slate-300 truncate">{spec.titleAr}</div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between gap-1.5 text-[11px] text-slate-300">
                    <span>{spec.elementAr}</span>
                    <span className="font-mono-nums text-slate-200">{spec.maxHp} صحة</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Bonding Ritual + Launch Action */}
          <div className="lg:col-span-5 flex flex-col justify-between gap-3 border-t lg:border-t-0 lg:border-r border-white/10 pt-3 lg:pt-0 lg:pr-4">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-slate-200 font-semibold">
                  مستوى التآلف مع {currentSpec.nameAr}
                </span>
                <span className="font-mono-nums font-bold text-amber-300">
                  {hud.bondLevel}%
                </span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-black/55 overflow-hidden border border-white/10">
                <div
                  className="h-full transition-all duration-200"
                  style={{
                    width: `${hud.bondLevel}%`,
                    backgroundColor: isBonded ? '#34d399' : currentSpec.accentHex,
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                {currentSpec.descriptionAr}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onBondStep}
                disabled={isBonded}
                className={`flex items-center justify-center gap-2 rounded-xl h-11 px-3 text-xs sm:text-sm font-bold transition-colors whitespace-nowrap cursor-pointer ${
                  isBonded
                    ? 'bg-emerald-500/18 text-emerald-300 border border-emerald-400/40 cursor-default'
                    : 'bg-white/8 hover:bg-white/15 text-white border border-white/15'
                }`}
              >
                <HeartHandshake className="w-4 h-4 shrink-0" />
                <span>{isBonded ? 'اكتمل التآلف' : 'تآلف مع التنين'}</span>
              </button>

              <button
                type="button"
                onClick={onLaunch}
                className="flex items-center justify-center gap-2 rounded-xl h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 text-xs sm:text-sm font-extrabold transition-colors whitespace-nowrap cursor-pointer"
              >
                <Wind className="w-4 h-4 shrink-0" />
                <span>امْتَطِ التنين وحلّق</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
