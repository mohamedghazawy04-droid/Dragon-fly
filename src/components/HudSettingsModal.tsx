import React, { useEffect } from 'react';
import {
  Check,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  Sliders,
  X,
} from 'lucide-react';
import {
  DEFAULT_HUD_LAYOUT,
  HUD_LAYOUT_PRESETS,
  HudLayoutConfig,
} from '../game/types';

interface HudSettingsModalProps {
  layout: HudLayoutConfig;
  isFullscreen: boolean;
  onChangeLayout: (next: HudLayoutConfig) => void;
  onStartReposition: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

const isPresetMatch = (a: HudLayoutConfig, b: HudLayoutConfig) =>
  a.compactTopBar === b.compactTopBar &&
  Math.abs(a.buttonScale - b.buttonScale) < 0.02 &&
  Math.abs(a.positions.joystick.xPct - b.positions.joystick.xPct) < 1.5;

export const HudSettingsModal: React.FC<HudSettingsModalProps> = ({
  layout,
  isFullscreen,
  onChangeLayout,
  onStartReposition,
  onToggleFullscreen,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const activePreset = isPresetMatch(layout, HUD_LAYOUT_PRESETS.left_handed)
    ? 'left_handed'
    : isPresetMatch(layout, HUD_LAYOUT_PRESETS.compact_edges)
      ? 'compact_edges'
      : isPresetMatch(layout, HUD_LAYOUT_PRESETS.standard)
        ? 'standard'
        : null;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 hud-surface-strong border border-amber-400/30 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3.5 mb-4">
          <div className="flex items-center gap-2.5 text-amber-300">
            <Sliders className="w-5 h-5 shrink-0" />
            <h2 className="font-display text-xl font-bold">إعدادات التحكم والشاشة</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs">
          {/* Fullscreen Landscape Toggle */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] p-3 border border-white/10">
            <div>
              <div className="font-bold text-white">وضع ملء الشاشة الأفقي</div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                توسيع العرض وتثبيت الاتجاه الأفقي
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`flex items-center gap-1.5 rounded-lg h-9 px-3 font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isFullscreen
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
              }`}
            >
              {isFullscreen ? (
                <>
                  <Minimize2 className="w-3.5 h-3.5" />
                  <span>إلغاء ملء الشاشة</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span>ملء الشاشة</span>
                </>
              )}
            </button>
          </div>

          {/* Interactive Drag & Drop Reposition Mode */}
          <button
            type="button"
            onClick={onStartReposition}
            className="w-full flex items-center justify-center gap-2 rounded-xl h-10 bg-sky-500 hover:bg-sky-400 text-slate-950 px-4 text-sm font-extrabold transition-colors cursor-pointer"
          >
            <Move className="w-4 h-4" />
            <span>تحريك وتوزيع أماكن الأزرار على الشاشة</span>
          </button>

          {/* Layout Presets */}
          <div>
            <div className="mb-2 font-semibold text-slate-300">قوالب التوزيع السريع</div>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'standard', label: 'قياسي' },
                  { id: 'compact_edges', label: 'حواف مدمجة' },
                  { id: 'left_handed', label: 'تبديل اليدين' },
                ] as const
              ).map(({ id, label }) => {
                const active = activePreset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeLayout(HUD_LAYOUT_PRESETS[id])}
                    className={`rounded-xl h-9 px-2 border font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-amber-500/18 border-amber-400/75 text-amber-200'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-slate-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sliders */}
          <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 flex flex-col gap-3">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-slate-300 font-medium">حجم الأزرار</span>
                <span className="font-mono-nums text-amber-300 font-bold">
                  {Math.round(layout.buttonScale * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={65}
                max={120}
                value={Math.round(layout.buttonScale * 100)}
                onChange={(e) =>
                  onChangeLayout({
                    ...layout,
                    buttonScale: Number(e.target.value) / 100,
                  })
                }
                className="w-full accent-amber-400 cursor-pointer"
              />
            </div>

            <div className="border-t border-white/10 pt-3">
              <div className="flex justify-between mb-1.5">
                <span className="text-slate-300 font-medium">شفافية الأزرار</span>
                <span className="font-mono-nums text-sky-300 font-bold">
                  {Math.round(layout.buttonOpacity * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={35}
                max={100}
                value={Math.round(layout.buttonOpacity * 100)}
                onChange={(e) =>
                  onChangeLayout({
                    ...layout,
                    buttonOpacity: Number(e.target.value) / 100,
                  })
                }
                className="w-full accent-sky-400 cursor-pointer"
              />
            </div>
          </div>

          {/* Toggles for ultra-clear view */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                onChangeLayout({ ...layout, compactTopBar: !layout.compactTopBar })
              }
              className={`rounded-xl h-9 px-3 border font-semibold cursor-pointer transition-colors ${
                layout.compactTopBar
                  ? 'bg-amber-500/18 border-amber-400/75 text-amber-200'
                  : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              شريط علوي مدمج
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeLayout({ ...layout, showIndicators: !layout.showIndicators })
              }
              className={`rounded-xl h-9 px-3 border font-semibold cursor-pointer transition-colors ${
                layout.showIndicators
                  ? 'bg-sky-500/18 border-sky-400/75 text-sky-200'
                  : 'bg-white/[0.04] border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              مؤشرات الأعداء
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/10 pt-4">
          <button
            type="button"
            onClick={() => onChangeLayout(DEFAULT_HUD_LAYOUT)}
            className="flex items-center gap-1.5 rounded-xl h-9 px-3.5 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl h-9 px-5 text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>تم</span>
          </button>
        </div>
      </div>
    </div>
  );
};
