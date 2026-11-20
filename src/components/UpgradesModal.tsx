import React, { useState } from 'react';
import {
  Check,
  Flame,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Ship,
  Sparkles,
  Swords,
  Trophy,
  Wind,
  X,
} from 'lucide-react';
import {
  DragonUpgradeKey,
  HudState,
  KnightUpgradeKey,
  UPGRADE_MAX_LEVEL,
  WarTargetType,
} from '../game/types';

interface UpgradesModalProps {
  hud: HudState;
  onSelectWarType: (warType: WarTargetType) => void;
  onUpgradeKnight: (key: KnightUpgradeKey) => void;
  onUpgradeDragon: (key: DragonUpgradeKey) => void;
  onSaveProgression: () => void;
  onResetProgression: () => void;
  onClose: () => void;
}

const KNIGHT_ITEMS: Array<{
  key: KnightUpgradeKey;
  labelAr: string;
  effectAr: string;
  Icon: typeof Swords;
}> = [
  {
    key: 'sword',
    labelAr: 'نصل السيف الدمشقي',
    effectAr: '+14 ضرر سيف بكل مستوى',
    Icon: Swords,
  },
  {
    key: 'armor',
    labelAr: 'الدرع الملكي',
    effectAr: '+14 درع وصحة إضافية',
    Icon: Shield,
  },
  {
    key: 'spirit',
    labelAr: 'عزيمة الفارس',
    effectAr: '+16 طاقة ومكافأة نقاط فوز',
    Icon: Sparkles,
  },
];

const DRAGON_ITEMS: Array<{
  key: DragonUpgradeKey;
  labelAr: string;
  effectAr: string;
  Icon: typeof Flame;
}> = [
  {
    key: 'breath',
    labelAr: 'قوة النفث العنصري',
    effectAr: '+15% ضرر النار والجليد والصخر',
    Icon: Flame,
  },
  {
    key: 'scales',
    labelAr: 'حراشف فولاذية',
    effectAr: '+24 صلابة وتحمل للتنين',
    Icon: Shield,
  },
  {
    key: 'wings',
    labelAr: 'سرعة الأجنحة',
    effectAr: '+6 م/ث سرعة تحليق قصوى',
    Icon: Wind,
  },
];

export const UpgradesModal: React.FC<UpgradesModalProps> = ({
  hud,
  onSelectWarType,
  onUpgradeKnight,
  onUpgradeDragon,
  onSaveProgression,
  onResetProgression,
  onClose,
}) => {
  const [justSaved, setJustSaved] = useState(false);
  const { progression } = hud;

  const handleSave = () => {
    onSaveProgression();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 2000);
  };

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 md:p-6 hud-surface-strong border border-amber-400/35 shadow-2xl text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3.5 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-amber-300">
              ترسانة الفارس وتطويرات التنين
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-nums">
              <span className="inline-flex items-center gap-1 text-amber-200">
                <Trophy className="w-3.5 h-3.5 text-amber-400" />
                الانتصارات: {progression.warsWon}
              </span>
              <span aria-hidden="true">·</span>
              <span>الموجة: {progression.warWave}</span>
              <span aria-hidden="true">·</span>
              <span className="text-sky-300">نقاط الفارس: {progression.knightPoints}</span>
              <span aria-hidden="true">·</span>
              <span className="text-orange-300">نقاط التنين: {progression.dragonPoints}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* War Target Selector */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/5 px-4 py-3 border border-white/10">
          <div>
            <div className="text-sm font-bold text-white">هدف الحرب المؤقتة</div>
            <div className="text-xs text-slate-400">
              اختر خصوم الجولة الموقوتة (120 ثانية) لكسب نقاط الفارس والتنين
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-black/45 p-1 border border-white/10">
            {(
              [
                { id: 'dragons', label: 'تنانين', Icon: Wind },
                { id: 'ships', label: 'سفن', Icon: Ship },
                { id: 'both', label: 'تنانين وسفن', Icon: Swords },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = hud.warType === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectWarType(id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Two-Column Upgrade Trees */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Knight Upgrades */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-bold text-sky-300 border-b border-white/10 pb-2">
              <span>تطويرات الفارس</span>
              <span className="font-mono-nums text-xs">
                متاح: {progression.knightPoints} نقطة
              </span>
            </div>

            {KNIGHT_ITEMS.map(({ key, labelAr, effectAr, Icon }) => {
              const level = progression.knightUpgrades[key];
              const isMax = level >= UPGRADE_MAX_LEVEL;
              const canUpgrade = progression.knightPoints > 0 && !isMax;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 border border-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-sky-300 shrink-0" />
                      <span className="text-sm font-bold text-white truncate">{labelAr}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{effectAr}</div>
                    <div className="mt-2 flex items-center gap-1">
                      {Array.from({ length: UPGRADE_MAX_LEVEL }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            idx < level ? 'bg-sky-400' : 'bg-white/10'
                          }`}
                        />
                      ))}
                      <span className="mr-1.5 font-mono-nums text-[11px] text-sky-200">
                        {level}/{UPGRADE_MAX_LEVEL}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeKnight(key)}
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors shrink-0 ${
                      isMax
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 cursor-default'
                        : canUpgrade
                          ? 'bg-sky-500 hover:bg-sky-400 border-sky-300 text-slate-950 cursor-pointer'
                          : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                    title={isMax ? 'المستوى الأقصى' : 'ترقية'}
                  >
                    {isMax ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Dragon Upgrades */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm font-bold text-orange-300 border-b border-white/10 pb-2">
              <span>تطويرات التنين</span>
              <span className="font-mono-nums text-xs">
                متاح: {progression.dragonPoints} نقطة
              </span>
            </div>

            {DRAGON_ITEMS.map(({ key, labelAr, effectAr, Icon }) => {
              const level = progression.dragonUpgrades[key];
              const isMax = level >= UPGRADE_MAX_LEVEL;
              const canUpgrade = progression.dragonPoints > 0 && !isMax;
              return (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 p-3 border border-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-orange-400 shrink-0" />
                      <span className="text-sm font-bold text-white truncate">{labelAr}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{effectAr}</div>
                    <div className="mt-2 flex items-center gap-1">
                      {Array.from({ length: UPGRADE_MAX_LEVEL }).map((_, idx) => (
                        <div
                          key={idx}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            idx < level ? 'bg-amber-400' : 'bg-white/10'
                          }`}
                        />
                      ))}
                      <span className="mr-1.5 font-mono-nums text-[11px] text-amber-200">
                        {level}/{UPGRADE_MAX_LEVEL}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!canUpgrade}
                    onClick={() => onUpgradeDragon(key)}
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors shrink-0 ${
                      isMax
                        ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300 cursor-default'
                        : canUpgrade
                          ? 'bg-amber-500 hover:bg-amber-400 border-amber-300 text-slate-950 cursor-pointer'
                          : 'bg-white/5 border-white/10 text-slate-500 cursor-not-allowed'
                    }`}
                    title={isMax ? 'المستوى الأقصى' : 'ترقية'}
                  >
                    {isMax ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Actions: Save, Reset, Close */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleSave}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors whitespace-nowrap cursor-pointer ${
                justSaved
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {justSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{justSaved ? 'تم حفظ التطورات' : 'حفظ التطورات'}</span>
            </button>

            <button
              type="button"
              onClick={onResetProgression}
              className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>إعادة ضبط</span>
            </button>

            {progression.savedAt && (
              <span className="hidden sm:inline text-[11px] text-slate-400 font-mono-nums">
                آخر حفظ:{' '}
                {new Date(progression.savedAt).toLocaleTimeString('ar-SA', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-5 py-2 text-xs font-bold bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
