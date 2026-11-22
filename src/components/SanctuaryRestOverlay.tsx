import React from 'react';
import {
  Bandage,
  BatteryCharging,
  BookOpen,
  Compass,
  Flame,
  Maximize2,
  Minimize2,
  Mountain,
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

interface SanctuaryRestOverlayProps {
  hud: HudState;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTendWounds: () => void;
  onRechargeEnergy: () => void;
  onSelectDragon: (id: DragonId) => void;
  onSelectMode: (mode: GameMode) => void;
  onSelectWarType: (warType: WarTargetType) => void;
  onOpenUpgrades: () => void;
  onOpenLore: () => void;
  onTakeOff: () => void;
}

export const SanctuaryRestOverlay: React.FC<SanctuaryRestOverlayProps> = ({
  hud,
  isFullscreen,
  onToggleFullscreen,
  onTendWounds,
  onRechargeEnergy,
  onSelectDragon,
  onSelectMode,
  onSelectWarType,
  onOpenUpgrades,
  onOpenLore,
  onTakeOff,
}) => {
  const spec = DRAGON_SPECS[hud.dragonId];
  const hpPct = Math.round((hud.hp / hud.maxHp) * 100);
  const energyPct = Math.round((hud.energy / hud.maxEnergy) * 100);
  const fullHp = hud.hp >= hud.maxHp;
  const fullEnergy = hud.energy >= hud.maxEnergy;
  const totalPoints = hud.progression.knightPoints + hud.progression.dragonPoints;
  const unlockedLoreCount = ANCIENT_LORE_TALES.filter(
    (t) => hud.progression.loreElapsedSeconds >= t.unlockSeconds,
  ).length;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 sm:p-5">
      <header className="pointer-events-auto mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 hud-surface-strong">
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-display text-xl md:text-2xl font-bold text-amber-300 whitespace-nowrap">
            كهف الملاذ الصخري
          </h2>
          <span className="text-xs text-slate-300 font-semibold">
            · {spec.nameAr}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-xl bg-black/45 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => onSelectMode('combat')}
              className={`flex items-center gap-1.5 rounded-lg h-7 px-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
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
              className={`flex items-center gap-1.5 rounded-lg h-7 px-2.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
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

      {/* Bottom Care, Sanctuary Tales & Recovery Panel */}
      <section className="pointer-events-auto mx-auto w-full max-w-5xl rounded-2xl p-3.5 md:p-4 hud-surface-strong">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
          {/* Health & Energy Bars + Healing Actions */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-200 font-medium">صحة التنين والجروح</span>
                  <span className="font-mono-nums text-emerald-300 font-bold">
                    {hud.hp}/{hud.maxHp}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-black/55 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-200"
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-200 font-medium">طاقة العناصر</span>
                  <span className="font-mono-nums text-amber-300 font-bold">
                    {energyPct}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-black/55 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-amber-400 transition-all duration-200"
                    style={{ width: `${energyPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onTendWounds}
                disabled={fullHp}
                className={`flex items-center justify-center gap-2 rounded-xl h-10 px-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  fullHp
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/35 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Bandage className="w-4 h-4 shrink-0" />
                <span>{fullHp ? 'التأمت الجروح' : 'تضميد الجروح'}</span>
              </button>

              <button
                type="button"
                onClick={onRechargeEnergy}
                disabled={fullEnergy}
                className={`flex items-center justify-center gap-2 rounded-xl h-10 px-3 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  fullEnergy
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-400/35 cursor-default'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                <BatteryCharging className="w-4 h-4 shrink-0" />
                <span>{fullEnergy ? 'طاقة مكتملة' : 'شحن الطاقة'}</span>
              </button>
            </div>
          </div>

          {/* Quick Dragon Switch + Take Off */}
          <div className="lg:col-span-5 flex flex-col gap-3 border-t lg:border-t-0 lg:border-r border-white/10 pt-3 lg:pt-0 lg:pr-4">
            <div className="grid grid-cols-3 gap-2">
              {(['ignis', 'glacius', 'terra'] as DragonId[]).map((id) => {
                const d = DRAGON_SPECS[id];
                const active = hud.dragonId === id;
                const Icon =
                  id === 'ignis' ? Flame : id === 'glacius' ? Snowflake : Mountain;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onSelectDragon(id)}
                    className={`flex items-center justify-center gap-1.5 rounded-xl h-10 text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-amber-500/15 border-amber-400/80 text-white'
                        : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:border-white/25'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: d.accentHex }} />
                    <span>{d.nameAr}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onTakeOff}
              className="w-full flex items-center justify-center gap-2 rounded-xl h-11 bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 text-sm font-extrabold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Wind className="w-4 h-4 shrink-0" />
              <span>التحليق في السماء مجدداً</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
