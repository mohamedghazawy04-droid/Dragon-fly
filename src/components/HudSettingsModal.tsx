import React from 'react';
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

export const HudSettingsModal: React.FC<HudSettingsModalProps> = ({
  layout,
  isFullscreen,
  onChangeLayout,
  onStartReposition,
  onToggleFullscreen,
  onClose,
}) => {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 hud-surface-strong border border-amber-400/35 shadow-2xl text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
          <div className="flex items-center gap-2 text-amber-300">
            <Sliders className="w-5 h-5" />
            <h2 className="font-display text-xl font-bold">إعدادات التحكم والشاشة</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 text-xs">
          {/* Fullscreen Landscape Toggle */}
          <div className="flex items-center justify-between rounded-xl bg-white/5 p-3 border border-white/10">
            <div>
              <div className="font-bold text-white">وضع ملء الشاشة الأفقي</div>
              <div className="text-[11px] text-slate-400">
                توسيع العرض وتثبيت الاتجاه الأفقي
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 font-bold transition-colors cursor-pointer ${
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
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 py-2.5 px-4 text-sm font-extrabold transition-colors cursor-pointer"
          >
            <Move className="w-4 h-4" />
            <span>تحريك وتوزيع أماكن الأزرار على الشاشة</span>
          </button>

          {/* Layout Presets */}
          <div>
            <div className="mb-1.5 font-semibold text-slate-300">قوالب التوزيع السريع</div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onChangeLayout(HUD_LAYOUT_PRESETS.standard)}
                className="rounded-lg py-2 px-2 bg-white/5 hover:bg-amber-500/20 border border-white/10 text-slate-200 font-medium cursor-pointer"
              >
                قياسي
              </button>
              <button
                type="button"
                onClick={() => onChangeLayout(HUD_LAYOUT_PRESETS.compact_edges)}
                className="rounded-lg py-2 px-2 bg-white/5 hover:bg-amber-500/20 border border-white/10 text-slate-200 font-medium cursor-pointer"
              >
                حواف مدمجة
              </button>
              <button
                type="button"
                onClick={() => onChangeLayout(HUD_LAYOUT_PRESETS.left_handed)}
                className="rounded-lg py-2 px-2 bg-white/5 hover:bg-amber-500/20 border border-white/10 text-slate-200 font-medium cursor-pointer"
              >
                تبديل اليدين
              </button>
            </div>
          </div>

          {/* Button Size Slider */}
          <div>
            <div className="flex justify-between mb-1">
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

          {/* Button Opacity Slider */}
          <div>
            <div className="flex justify-between mb-1">
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

          {/* Toggles for ultra-clear view */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() =>
                onChangeLayout({ ...layout, compactTopBar: !layout.compactTopBar })
              }
              className={`rounded-lg py-2 px-3 border font-semibold cursor-pointer transition-colors ${
                layout.compactTopBar
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              شريط علوي مدمج
            </button>
            <button
              type="button"
              onClick={() =>
                onChangeLayout({ ...layout, showIndicators: !layout.showIndicators })
              }
              className={`rounded-lg py-2 px-3 border font-semibold cursor-pointer transition-colors ${
                layout.showIndicators
                  ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                  : 'bg-white/5 border-white/10 text-slate-300'
              }`}
            >
              مؤشرات الأعداء
            </button>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => onChangeLayout(DEFAULT_HUD_LAYOUT)}
            className="flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>تم</span>
          </button>
        </div>
      </div>
    </div>
  );
};
