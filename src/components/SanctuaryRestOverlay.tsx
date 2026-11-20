import React from 'react';
import {
  Bandage,
  BatteryCharging,
  Compass,
  Flame,
  Maximize2,
  Minimize2,
  Mountain,
  Shield,
  Snowflake,
  Wind,
} from 'lucide-react';
import { DRAGON_SPECS, DragonId, GameMode, HudState } from '../game/types';

interface SanctuaryRestOverlayProps {
  hud: HudState;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onTendWounds: () => void;
  onRechargeEnergy: () => void;
  onSelectDragon: (id: DragonId) => void;
  onSelectMode: (mode: GameMode) => void;
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
  onTakeOff,
}) => {
  const spec = DRAGON_SPECS[hud.dragonId];
  const hpPct = Math.round((hud.hp / hud.maxHp) * 100);
  const energyPct = Math.round((hud.energy / hud.maxEnergy) * 100);
  const fullHp = hud.hp >= hud.maxHp;
  const fullEnergy = hud.energy >= hud.maxEnergy;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 flex flex-col justify-between p-3 md:p-4">
      <header className="pointer-events-auto mx-auto flex w-full max-w-4xl items-center justify-between gap-4 rounded-xl px-4 py-2 bg-slate-950/60 backdrop-blur-md border border-white/10">
        <div>
          <h2 className="font-display text-xl font-bold text-amber-300">
            كهف الملاذ الصخري — {spec.nameAr}
          </h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 rounded-lg bg-black/45 p-1 border border-white/10">
            <button
              type="button"
              onClick={() => onSelectMode('combat')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
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
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium cursor-pointer ${
                hud.mode === 'free'
                  ? 'bg-sky-400 text-slate-950 font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>تحليق حر</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة الأفقي'}
            className="flex items-center gap-1.5 rounded-lg bg-black/50 hover:bg-black/75 px-2.5 py-1.5 text-xs font-medium text-slate-200 border border-white/15 cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5 text-amber-300" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5 text-amber-300" />
            )}
          </button>
        </div>
      </header>

      {/* Bottom Care & Recovery Panel */}
      <section className="pointer-events-auto mx-auto w-full max-w-4xl rounded-2xl p-3 md:p-4 bg-slate-950/65 backdrop-blur-md border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* Health & Energy Bars + Healing Actions */}
          <div className="md:col-span-7 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">صحة التنين والجروح</span>
                  <span className="font-mono-nums text-emerald-300 font-bold">
                    {hud.hp}/{hud.maxHp}
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/50 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-emerald-400 transition-all duration-200"
                    style={{ width: `${hpPct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">طاقة العناصر</span>
                  <span className="font-mono-nums text-amber-300 font-bold">
                    {energyPct}%
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-black/50 overflow-hidden border border-white/10">
                  <div
                    className="h-full bg-amber-400 transition-all duration-200"
                    style={{ width: `${energyPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={onTendWounds}
                disabled={fullHp}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  fullHp
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-400/30 cursor-default'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                <Bandage className="w-4 h-4" />
                <span>{fullHp ? 'التأمت الجروح' : 'رفيف وتضميد الجروح'}</span>
              </button>

              <button
                type="button"
                onClick={onRechargeEnergy}
                disabled={fullEnergy}
                className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  fullEnergy
                    ? 'bg-amber-500/15 text-amber-300 border border-amber-400/30 cursor-default'
                    : 'bg-sky-600 hover:bg-sky-500 text-white'
                }`}
              >
                <BatteryCharging className="w-4 h-4" />
                <span>{fullEnergy ? 'الطاقة مكتملة' : 'إعادة شحن الطاقة'}</span>
              </button>
            </div>
          </div>

          {/* Quick Dragon Switch + Take Off */}
          <div className="md:col-span-5 flex flex-col gap-3 border-t md:border-t-0 md:border-r border-white/10 pt-3 md:pt-0 md:pr-4">
            <div className="flex items-center justify-between gap-2">
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
                    className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold border transition-colors cursor-pointer ${
                      active
                        ? 'bg-white/15 border-amber-400 text-white'
                        : 'bg-black/30 border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" style={{ color: d.accentHex }} />
                    <span>{d.nameAr}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onTakeOff}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 px-5 py-3 text-sm font-extrabold transition-colors cursor-pointer"
            >
              <Wind className="w-4 h-4" />
              <span>التحليق في السماء مجدداً</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
