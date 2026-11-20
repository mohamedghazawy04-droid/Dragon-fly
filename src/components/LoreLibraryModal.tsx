import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Clock,
  Lock,
  Play,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { ANCIENT_LORE_TALES, HudState } from '../game/types';

interface LoreLibraryModalProps {
  hud: HudState;
  muted: boolean;
  onPlayTale: (taleId: string) => void;
  onStopTale: () => void;
  onClose: () => void;
}

function formatTimer(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const LoreLibraryModal: React.FC<LoreLibraryModalProps> = ({
  hud,
  muted,
  onPlayTale,
  onStopTale,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    hud.activeLoreTaleId ?? ANCIENT_LORE_TALES[0].id,
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const elapsed = hud.progression.loreElapsedSeconds;
  const unlockedCount = ANCIENT_LORE_TALES.filter((t) => elapsed >= t.unlockSeconds).length;
  const nextLocked = ANCIENT_LORE_TALES.find((t) => elapsed < t.unlockSeconds);
  const selectedTale =
    ANCIENT_LORE_TALES.find((t) => t.id === selectedId) ?? ANCIENT_LORE_TALES[0];

  const isSelectedUnlocked = elapsed >= selectedTale.unlockSeconds;
  const remainingForSelected = Math.max(0, selectedTale.unlockSeconds - elapsed);
  const isPlayingSelected =
    hud.isLorePlaying && hud.activeLoreTaleId === selectedTale.id;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-3 md:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl p-5 md:p-6 hud-surface-strong border border-amber-400/35 shadow-2xl text-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-3.5 mb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <BookOpen className="w-5 h-5 text-amber-300 shrink-0" />
              <h2 className="font-display text-2xl font-bold text-amber-300">
                مكتبة أساطير فرسان التنانين
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="font-mono-nums text-amber-200">
                المفتوح: {unlockedCount} / {ANCIENT_LORE_TALES.length}
              </span>
              {nextLocked ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-nums">
                    الحكاية التالية بعد {formatTimer(nextLocked.unlockSeconds - elapsed)}
                  </span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-300">اكتملت جميع السجلات الملكية</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>يتضاعف زمن الفتح أثناء الراحة في الملاذ</span>
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

        {/* 2-Column Chronicle Index + Audio Story Reader */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Chapter List */}
          <div className="md:col-span-5 flex flex-col gap-2">
            {ANCIENT_LORE_TALES.map((tale) => {
              const unlocked = elapsed >= tale.unlockSeconds;
              const isSelected = selectedTale.id === tale.id;
              const isCurrentlyNarrating =
                hud.isLorePlaying && hud.activeLoreTaleId === tale.id;
              const unlockPct =
                tale.unlockSeconds <= 0
                  ? 100
                  : Math.min(100, Math.round((elapsed / tale.unlockSeconds) * 100));

              return (
                <button
                  key={tale.id}
                  type="button"
                  onClick={() => setSelectedId(tale.id)}
                  className={`w-full text-right rounded-xl p-3 border transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-white/10 border-amber-400/75'
                      : unlocked
                        ? 'bg-white/5 border-white/10 hover:border-white/25'
                        : 'bg-black/30 border-white/10 opacity-85 hover:opacity-100'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-nums text-xs text-amber-300 font-bold shrink-0">
                        {tale.chapterNumber}.
                      </span>
                      <span className="text-sm font-bold text-white truncate">
                        {tale.titleAr}
                      </span>
                    </div>

                    {unlocked ? (
                      <Volume2
                        className={`w-4 h-4 shrink-0 ${
                          isCurrentlyNarrating ? 'text-amber-300' : 'text-slate-400'
                        }`}
                      />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span className="truncate">{tale.eraAr}</span>
                    {unlocked ? (
                      <span className="font-mono-nums shrink-0">{tale.durationLabelAr}</span>
                    ) : (
                      <span className="font-mono-nums text-amber-300 shrink-0">
                        {formatTimer(tale.unlockSeconds - elapsed)}
                      </span>
                    )}
                  </div>

                  {!unlocked && (
                    <div className="mt-2 h-1 rounded-full bg-black/50 overflow-hidden">
                      <div
                        className="h-full bg-amber-400/80 transition-all duration-300"
                        style={{ width: `${unlockPct}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active Tale Narration & Scroll */}
          <div className="md:col-span-7 flex flex-col justify-between rounded-xl bg-black/35 border border-white/10 p-4 md:p-5">
            {isSelectedUnlocked ? (
              <>
                <div>
                  <div className="text-xs text-slate-400 mb-1">
                    الفصل {selectedTale.chapterNumber} · {selectedTale.eraAr}
                  </div>
                  <h3 className="font-display text-2xl font-bold text-amber-200 mb-4">
                    {selectedTale.titleAr}
                  </h3>

                  <div className="flex flex-col gap-3">
                    {selectedTale.segments.map((seg, idx) => {
                      const activeSeg = isPlayingSelected && hud.activeLoreSegment === idx;
                      return (
                        <p
                          key={idx}
                          className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed transition-colors ${
                            activeSeg
                              ? 'bg-amber-500/15 text-amber-100 border border-amber-400/50'
                              : 'bg-white/5 text-slate-200 border border-transparent'
                          }`}
                        >
                          {seg}
                        </p>
                      );
                    })}
                  </div>
                </div>

                {/* Audio Controls Bar */}
                <div className="mt-5 border-t border-white/10 pt-4">
                  {muted && (
                    <div className="mb-2.5 text-xs text-amber-300">
                      الصوت مكتوم حالياً — فعّل الصوت لسماع رواية الفارس والموسيقى
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={muted}
                      onClick={() => {
                        if (isPlayingSelected) {
                          onStopTale();
                        } else {
                          onPlayTale(selectedTale.id);
                        }
                      }}
                      className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                        muted
                          ? 'bg-white/10 text-slate-500 cursor-not-allowed'
                          : isPlayingSelected
                            ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                      }`}
                    >
                      {isPlayingSelected ? (
                        <>
                          <Square className="w-3.5 h-3.5 fill-current" />
                          <span>إيقاف السرد</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>استماع لرواية الفارس</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-nums">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {isPlayingSelected
                          ? `المقطع ${hud.activeLoreSegment + 1} / ${selectedTale.segments.length}`
                          : selectedTale.durationLabelAr}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="my-auto flex flex-col items-center justify-center text-center py-10 px-4">
                <Lock className="w-10 h-10 text-amber-300/80 mb-3" />
                <h3 className="font-display text-xl font-bold text-white mb-1.5">
                  {selectedTale.titleAr}
                </h3>
                <p className="text-xs text-slate-400 max-w-sm leading-relaxed mb-4">
                  تُفتح هذه الأسطورة تلقائياً مع مرور الوقت، وتنكشف ذكرياتها بسرعة مضاعفة
                  أثناء راحة التنين والفارس في كهف الملاذ.
                </p>
                <div className="font-mono-nums text-lg font-bold text-amber-300">
                  يفتح خلال {formatTimer(remainingForSelected)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
