import React, { useEffect } from 'react';
import {
  Check,
  Crown,
  Feather,
  Flame,
  Lock,
  Mountain,
  Palette,
  RotateCcw,
  Shield,
  Snowflake,
  Sparkles,
  Wind,
  X,
} from 'lucide-react';
import {
  DRAGON_HORN_PRESETS,
  DRAGON_SCALE_PRESETS,
  DRAGON_SPECS,
  DRAGON_WING_PRESETS,
  DragonAppearanceConfig,
  DragonHornStyleId,
  DragonId,
  HudState,
  isAppearanceUnlocked,
  UPGRADE_MAX_LEVEL,
} from '../game/types';

interface DragonCustomizeModalProps {
  hud: HudState;
  onSelectDragon: (id: DragonId) => void;
  onChangeAppearance: (patch: Partial<DragonAppearanceConfig>) => void;
  onResetAppearance: () => void;
  onOpenUpgrades: () => void;
  onClose: () => void;
}

const HornSilhouette: React.FC<{ styleId: DragonHornStyleId; active: boolean }> = ({
  styleId,
  active,
}) => {
  const stroke = active ? '#fbbf24' : '#94a3b8';
  const accent = active ? '#fde68a' : '#cbd5e1';

  return (
    <svg
      viewBox="0 0 64 40"
      className="w-12 h-8 shrink-0"
      fill="none"
      aria-hidden="true"
    >
      {/* Dragon brow baseline */}
      <path
        d="M22 31 Q32 27 42 31 L38 35 Q32 33 26 35 Z"
        fill={stroke}
        opacity={0.35}
      />
      {styleId === 'classic' && (
        <>
          <path
            d="M26 29 C18 22 12 14 7 7 C14 11 20 18 28 26 Z"
            fill={accent}
          />
          <path
            d="M38 29 C46 22 52 14 57 7 C50 11 44 18 36 26 Z"
            fill={accent}
          />
          <path
            d="M24 31 C17 29 12 25 8 21 C14 23 19 26 25 29 Z"
            fill={stroke}
            opacity={0.75}
          />
          <path
            d="M40 31 C47 29 52 25 56 21 C50 23 45 26 39 29 Z"
            fill={stroke}
            opacity={0.75}
          />
        </>
      )}
      {styleId === 'curved_ram' && (
        <>
          <path
            d="M26 27 C17 18 8 15 6 24 C5 31 12 35 19 32 C14 31 11 28 12 24 C13 20 19 22 25 28 Z"
            fill={accent}
          />
          <path
            d="M38 27 C47 18 56 15 58 24 C59 31 52 35 45 32 C50 31 53 28 52 24 C51 20 45 22 39 28 Z"
            fill={accent}
          />
        </>
      )}
      {styleId === 'split_crown' && (
        <>
          <path
            d="M27 29 C21 19 15 11 9 5 C17 9 23 17 29 26 Z"
            fill={accent}
          />
          <path
            d="M37 29 C43 19 49 11 55 5 C47 9 41 17 35 26 Z"
            fill={accent}
          />
          <path
            d="M23 23 C16 20 10 18 5 18 C11 21 16 24 23 27 Z"
            fill={stroke}
          />
          <path
            d="M41 23 C48 20 54 18 59 18 C53 21 48 24 41 27 Z"
            fill={stroke}
          />
        </>
      )}
      {styleId === 'forward_spear' && (
        <>
          <path
            d="M27 29 L10 11 L21 25 Z"
            fill={accent}
          />
          <path
            d="M37 29 L54 11 L43 25 Z"
            fill={accent}
          />
          <path d="M32 27 L32 8 L35 27 Z" fill={stroke} />
          <path d="M25 32 L11 23 L23 28 Z" fill={stroke} opacity={0.8} />
          <path d="M39 32 L53 23 L41 28 Z" fill={stroke} opacity={0.8} />
        </>
      )}
      {styleId === 'ancient_halo' && (
        <>
          <path
            d="M27 29 C18 18 10 10 4 6 C12 8 20 15 29 26 Z"
            fill={accent}
          />
          <path
            d="M37 29 C46 18 54 10 60 6 C52 8 44 15 35 26 Z"
            fill={accent}
          />
          <path
            d="M30 27 C27 17 24 10 21 4 C26 9 29 17 31 26 Z"
            fill={stroke}
          />
          <path
            d="M34 27 C37 17 40 10 43 4 C38 9 35 17 33 26 Z"
            fill={stroke}
          />
          <path d="M32 26 L32 10" stroke={accent} strokeWidth="2.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};

export const DragonCustomizeModal: React.FC<DragonCustomizeModalProps> = ({
  hud,
  onSelectDragon,
  onChangeAppearance,
  onResetAppearance,
  onOpenUpgrades,
  onClose,
}) => {
  const { progression } = hud;
  const spec = DRAGON_SPECS[hud.dragonId];
  const currentAppearance = progression.dragonAppearance[hud.dragonId];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activeScale =
    DRAGON_SCALE_PRESETS.find((p) => p.id === currentAppearance.scalePalette) ??
    DRAGON_SCALE_PRESETS[0];
  const activeHorn =
    DRAGON_HORN_PRESETS.find((p) => p.id === currentAppearance.hornStyle) ??
    DRAGON_HORN_PRESETS[0];
  const activeWing =
    DRAGON_WING_PRESETS.find((p) => p.id === currentAppearance.wingStyle) ??
    DRAGON_WING_PRESETS[0];

  const totalOptions =
    DRAGON_SCALE_PRESETS.length + DRAGON_HORN_PRESETS.length + DRAGON_WING_PRESETS.length;
  const unlockedOptions =
    DRAGON_SCALE_PRESETS.filter((p) => isAppearanceUnlocked(p.unlock, progression)).length +
    DRAGON_HORN_PRESETS.filter((p) => isAppearanceUnlocked(p.unlock, progression)).length +
    DRAGON_WING_PRESETS.filter((p) => isAppearanceUnlocked(p.unlock, progression)).length;

  const previewPrimary =
    activeScale.id === 'default' ? `#${spec.primaryColor.toString(16).padStart(6, '0')}` : activeScale.swatchPrimary;
  const previewAccent =
    activeScale.id === 'default' ? spec.accentHex : activeScale.swatchAccent;
  const previewWing =
    activeWing.id === 'natural' ? `#${spec.membraneColor.toString(16).padStart(6, '0')}` : activeWing.swatchHex;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        dir="rtl"
        className="hud-scroll w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 md:p-6 hud-surface-strong border border-amber-400/30 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-3.5 mb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <Palette className="w-5 h-5 text-amber-300 shrink-0" />
              <h2 className="font-display text-2xl font-bold text-amber-300">
                تخصيص مظهر التنين
              </h2>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono-nums">
              <span className="text-white font-semibold">{spec.nameAr}</span>
              <span aria-hidden="true">·</span>
              <span>حراشف {progression.dragonUpgrades.scales}/{UPGRADE_MAX_LEVEL}</span>
              <span aria-hidden="true">·</span>
              <span>نفث {progression.dragonUpgrades.breath}/{UPGRADE_MAX_LEVEL}</span>
              <span aria-hidden="true">·</span>
              <span>أجنحة {progression.dragonUpgrades.wings}/{UPGRADE_MAX_LEVEL}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-300">
                المتاح: {unlockedOptions}/{totalOptions}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenUpgrades}
              className="flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-bold bg-sky-500/18 hover:bg-sky-500/28 text-sky-200 border border-sky-400/35 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              <span>شجرة التطويرات</span>
              {progression.dragonPoints > 0 && (
                <span className="font-mono-nums text-amber-300">
                  +{progression.dragonPoints}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="إغلاق"
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Dragon Switcher + Active Look Summary */}
        <div className="mb-6 grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
          {/* Select which dragon to customize */}
          <div className="lg:col-span-5 grid grid-cols-3 gap-2">
            {(['ignis', 'glacius', 'terra'] as DragonId[]).map((id) => {
              const d = DRAGON_SPECS[id];
              const active = hud.dragonId === id;
              const Icon = id === 'ignis' ? Flame : id === 'glacius' ? Snowflake : Mountain;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectDragon(id)}
                  className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 border transition-colors cursor-pointer ${
                    active
                      ? 'bg-amber-500/16 border-amber-400/75 text-white'
                      : 'bg-white/[0.04] border-white/10 text-slate-300 hover:text-white hover:border-white/25'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" style={{ color: d.accentHex }} />
                  <span className="text-xs font-bold whitespace-nowrap">{d.nameAr}</span>
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">{d.elementAr}</span>
                </button>
              );
            })}
          </div>

          {/* Live Applied Look Summary */}
          <div className="lg:col-span-7 flex items-center justify-between gap-4 rounded-xl bg-white/[0.04] px-4 py-3 border border-white/10">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="w-11 h-11 rounded-full shrink-0 border-2 border-white/25 shadow-inner"
                style={{
                  background: `linear-gradient(135deg, ${previewPrimary} 0%, ${previewAccent} 55%, ${previewWing} 100%)`,
                }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">
                  {activeScale.nameAr}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                  <span>{activeHorn.nameAr}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeWing.nameAr}</span>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex flex-col items-end shrink-0 text-[11px] text-slate-400">
              <span className="text-amber-300 font-semibold">
                لمعان الحراشف +{progression.dragonUpgrades.scales * 15}%
              </span>
              <span>مرتبط بمستوى التطويرات</span>
            </div>
          </div>
        </div>

        {/* Section 1: Scale Color & Armor Finish */}
        <section className="mb-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-200">
              <Shield className="w-4 h-4 text-amber-300" />
              <span>لون الحراشف والدرع</span>
            </div>
            <span className="text-[11px] text-slate-400">
              تُفتح برفع مستوى حراشف التنين
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {DRAGON_SCALE_PRESETS.map((preset) => {
              const unlocked = isAppearanceUnlocked(preset.unlock, progression);
              const selected = currentAppearance.scalePalette === preset.id;
              const swatchA =
                preset.id === 'default'
                  ? `#${spec.primaryColor.toString(16).padStart(6, '0')}`
                  : preset.swatchPrimary;
              const swatchB =
                preset.id === 'default'
                  ? `#${spec.secondaryColor.toString(16).padStart(6, '0')}`
                  : preset.swatchAccent;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (unlocked) {
                      onChangeAppearance({ scalePalette: preset.id });
                    } else {
                      onOpenUpgrades();
                    }
                  }}
                  className={`flex flex-col justify-between text-right rounded-xl p-3 border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-amber-500/18 border-amber-400 text-white'
                      : unlocked
                        ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
                        : 'bg-black/35 hover:bg-white/[0.05] border-white/8 text-slate-400'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 w-full">
                    <div
                      className={`w-7 h-7 rounded-full border shrink-0 ${
                        selected ? 'border-amber-300' : 'border-white/25'
                      } ${!unlocked ? 'opacity-55' : ''}`}
                      style={{
                        background: `linear-gradient(135deg, ${swatchA} 45%, ${swatchB} 100%)`,
                      }}
                    />
                    {selected ? (
                      <Check className="w-4 h-4 text-amber-300 shrink-0" />
                    ) : !unlocked ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : null}
                  </div>

                  <div className="mt-2.5">
                    <div className="text-xs font-bold leading-snug">{preset.nameAr}</div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                      {unlocked ? preset.subtitleAr : preset.unlock.labelAr}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 2: Horn & Crown Styles */}
        <section className="mb-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-orange-200">
              <Crown className="w-4 h-4 text-orange-300" />
              <span>نمط القرون والتاج</span>
            </div>
            <span className="text-[11px] text-slate-400">
              تُفتح بتطويرات الحراشف والنفث والأجنحة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {DRAGON_HORN_PRESETS.map((preset) => {
              const unlocked = isAppearanceUnlocked(preset.unlock, progression);
              const selected = currentAppearance.hornStyle === preset.id;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (unlocked) {
                      onChangeAppearance({ hornStyle: preset.id });
                    } else {
                      onOpenUpgrades();
                    }
                  }}
                  className={`flex items-center justify-between gap-3 text-right rounded-xl p-3 border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-amber-500/18 border-amber-400 text-white'
                      : unlocked
                        ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
                        : 'bg-black/35 hover:bg-white/[0.05] border-white/8 text-slate-400'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold truncate">{preset.nameAr}</span>
                      {selected ? (
                        <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                      ) : !unlocked ? (
                        <Lock className="w-3 h-3 text-slate-500 shrink-0" />
                      ) : null}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-relaxed text-slate-400">
                      {unlocked ? preset.subtitleAr : preset.unlock.labelAr}
                    </div>
                  </div>

                  <HornSilhouette styleId={preset.id} active={selected} />
                </button>
              );
            })}
          </div>
        </section>

        {/* Section 3: Wing Membrane & Eye Resonance */}
        <section>
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-200">
              <Feather className="w-4 h-4 text-sky-300" />
              <span>نسيج الأجنحة وتوهج العين</span>
            </div>
            <span className="text-[11px] text-slate-400">
              تُفتح برفع مستوى النفث والأجنحة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {DRAGON_WING_PRESETS.map((preset) => {
              const unlocked = isAppearanceUnlocked(preset.unlock, progression);
              const selected = currentAppearance.wingStyle === preset.id;
              const swatch =
                preset.id === 'natural'
                  ? `#${spec.membraneColor.toString(16).padStart(6, '0')}`
                  : preset.swatchHex;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    if (unlocked) {
                      onChangeAppearance({ wingStyle: preset.id });
                    } else {
                      onOpenUpgrades();
                    }
                  }}
                  className={`flex items-center justify-between gap-3 text-right rounded-xl p-3 border transition-colors cursor-pointer ${
                    selected
                      ? 'bg-sky-500/18 border-sky-400 text-white'
                      : unlocked
                        ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
                        : 'bg-black/35 hover:bg-white/[0.05] border-white/8 text-slate-400'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className={`w-6 h-6 rounded-lg border border-white/25 shrink-0 flex items-center justify-center ${
                        !unlocked ? 'opacity-50' : ''
                      }`}
                      style={{ backgroundColor: swatch }}
                    >
                      <Wind className="w-3.5 h-3.5 text-slate-950/80" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{preset.nameAr}</div>
                      <div className="mt-0.5 text-[10px] leading-snug text-slate-400">
                        {unlocked ? preset.subtitleAr : preset.unlock.labelAr}
                      </div>
                    </div>
                  </div>

                  {selected ? (
                    <Check className="w-4 h-4 text-sky-300 shrink-0" />
                  ) : !unlocked ? (
                    <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        {/* Footer */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onResetAppearance}
              className="flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>استعادة المظهر الأصلي</span>
            </button>

            <button
              type="button"
              onClick={onOpenUpgrades}
              className="flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold text-sky-200 hover:text-white bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5 text-sky-300" />
              <span>ترقية لفتح المزيد</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl h-9 px-5 text-xs font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors cursor-pointer whitespace-nowrap"
          >
            تطبيق وإغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
