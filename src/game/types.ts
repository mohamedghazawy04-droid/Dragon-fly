export type DragonId = 'ignis' | 'glacius' | 'terra';
export type ElementType = 'fire' | 'ice' | 'rock';
export type GameMode = 'combat' | 'free';
export type GamePhase =
  | 'sanctuary_bond'
  | 'flying'
  | 'boarding'
  | 'resting'
  | 'skydiving'
  | 'on_foot';
export type WeatherState = 'clear' | 'rain' | 'storm';
export type WeatherMode = 'auto' | WeatherState;
export type CameraView = 'full' | 'rider';
export type WarTargetType = 'dragons' | 'ships' | 'both';
export type WarStatus = 'idle' | 'active' | 'victory' | 'defeat';
export type KnightUpgradeKey = 'sword' | 'armor' | 'spirit';
export type DragonUpgradeKey = 'breath' | 'scales' | 'wings';

export const UPGRADE_MAX_LEVEL = 5;

export type LoreMood = 'fire' | 'storm' | 'steel' | 'forest' | 'stone' | 'royal';

export interface LoreTale {
  id: string;
  chapterNumber: string;
  titleAr: string;
  eraAr: string;
  durationLabelAr: string;
  unlockSeconds: number;
  mood: LoreMood;
  segments: string[];
}

export const ANCIENT_LORE_TALES: LoreTale[] = [
  {
    id: 'pact_of_first_flame',
    chapterNumber: '01',
    titleAr: 'ميثاق النار الأولى',
    eraAr: 'العصر الأول · كهف ملاذ الصخور',
    durationLabelAr: '0:42',
    unlockSeconds: 0,
    mood: 'fire',
    segments: [
      'في فجر الممالك القديمة، لم تكن التنانين ترضخ لسلاسل ولا لأوامر الملوك.',
      'اجتمع أول الفرسان في كهف ملاذ الصخور، وأقسم بالوفاء قبل أن يرفع سيفه.',
      'حين تلامس كف الفارس حراشف التنين دون خوف، يتولد عهد لا يكسره الموت ولا العاصفة.',
    ],
  },
  {
    id: 'knights_of_ash_storm',
    chapterNumber: '02',
    titleAr: 'فرسان العاصفة والرماد',
    eraAr: 'حروب الغيوم السوداء · الممرات الشمالية',
    durationLabelAr: '0:48',
    unlockSeconds: 45,
    mood: 'storm',
    segments: [
      'عندما أطبق البرق على قمم الشمال، تعلم الفرسان إمالة أجنحة تنانينهم بزاوية قائمة للعبور بين الشقوق الضيقة.',
      'كان الصقيع يجمّد الدروع في الأعالي، لكن زفير سَعِير وصَقِيع كانا يشقان قلب العاصفة.',
      'ومن سقط في البحر يومها، لم يتركه تنينه قط، بل انقضّ من بين السحاب لينتشله من الأمواج.',
    ],
  },
  {
    id: 'epic_of_ghazzawi',
    chapterNumber: '03',
    titleAr: 'ملحمة غزاوي ونصل الدمشق',
    eraAr: 'وقعة المضيق · أساطير السيوف',
    durationLabelAr: '0:52',
    unlockSeconds: 105,
    mood: 'steel',
    segments: [
      'سُئل القائد غزاوي يوماً عن سر الصمود أمام أساطيل القراصنة وتنانين الرماد المتوحشة.',
      'فأشهر سيفه الدمشقي المشحوذ بجمر التنين وقال كلمته التي تتوارثها الحامية: يجب أن نقص الرؤوس!',
      'ومن ذلك اليوم، كلما اشتعل الشرر على أسوار القلعة أو خشب السفن، تردد صدى صيحته في السماء.',
    ],
  },
  {
    id: 'hanging_roost_trees',
    chapterNumber: '04',
    titleAr: 'سرّ أشجار المبيت المعلقة',
    eraAr: 'غابات الغرب المنسية · زمن الهدنة',
    durationLabelAr: '0:46',
    unlockSeconds: 180,
    mood: 'forest',
    segments: [
      'خارج أوقات النفير والحرب، تبحث التنانين البرية عن الأشجار الشاهقة المعلقة لتستريح مقلوبة كحراس الغابة.',
      'هناك تصغي لخشخشة أوراق النخيل ونسيم المحيط، وتهدأ نيرانها المتقدة في صدورها.',
      'ولا يجرؤ صياد على الاقتراب من تلك القمم، لأن يقظة تنين واحد كافية لإحراق أسطول كامل.',
    ],
  },
  {
    id: 'siege_of_falcon_castle',
    chapterNumber: '05',
    titleAr: 'حصار قلعة الصقر الأول',
    eraAr: 'المملكة الوسطى · حرب الحصون',
    durationLabelAr: '0:50',
    unlockSeconds: 270,
    mood: 'stone',
    segments: [
      'كانت أسوار قلعة الصقر تُعد منيعة، تحرسها الأبراج ورماة المجانيق ليل نهار.',
      'حتى أطل جَلْمُود بصخوره المنصهرة واندفع الفرسان عبر السور المحطم، فتركوا ندوب اللهب والسيوف شاهدة على الحجارة.',
      'منذ تلك المعركة، صار البوق الحربي يرن من جهة الهجوم قبل أن تلامس أقدام التنانين القمم.',
    ],
  },
  {
    id: 'testament_of_the_prince',
    chapterNumber: '06',
    titleAr: 'وصية الأمير وسيد التنانين',
    eraAr: 'العهد الملكي · قصر المرجان',
    durationLabelAr: '0:56',
    unlockSeconds: 375,
    mood: 'royal',
    segments: [
      'في قاعات قصر المرجان، سلم الأمير راية السماء إلى حرسه المخلصين وقال: لن ندافع عن الجدران فحسب، بل عن الأرواح.',
      'كل نصر تكتسب به عزيمة الفارس وقوة التنين هو أمانة تزيد النصل مضاءً والحراشف صلابة.',
      'فارتقِ بتنينك أيها الفارس، واجعل نداءك في الأعالي عهداً لا ينطفئ.',
    ],
  },
];

export type DragonScalePaletteId =
  | 'default'
  | 'crimson_ember'
  | 'arctic_sapphire'
  | 'obsidian_shadow'
  | 'royal_jade'
  | 'amethyst_storm'
  | 'imperial_gold'
  | 'celestial_prism';

export type DragonHornStyleId =
  | 'classic'
  | 'curved_ram'
  | 'split_crown'
  | 'forward_spear'
  | 'ancient_halo';

export type DragonWingStyleId =
  | 'natural'
  | 'ember_vein'
  | 'aurora_frost'
  | 'abyssal_violet'
  | 'solar_gold';

export interface DragonAppearanceConfig {
  scalePalette: DragonScalePaletteId;
  hornStyle: DragonHornStyleId;
  wingStyle: DragonWingStyleId;
}

export const DEFAULT_DRAGON_APPEARANCE_BY_ID: Record<DragonId, DragonAppearanceConfig> = {
  ignis: { scalePalette: 'default', hornStyle: 'classic', wingStyle: 'natural' },
  glacius: { scalePalette: 'default', hornStyle: 'classic', wingStyle: 'natural' },
  terra: { scalePalette: 'default', hornStyle: 'classic', wingStyle: 'natural' },
};

export type AppearanceUnlockRequirement =
  | { kind: 'always'; labelAr: string }
  | { kind: 'dragon_upgrade'; key: DragonUpgradeKey; level: number; labelAr: string }
  | { kind: 'knight_upgrade'; key: KnightUpgradeKey; level: number; labelAr: string }
  | { kind: 'total_dragon'; level: number; labelAr: string };

export interface DragonScalePreset {
  id: DragonScalePaletteId;
  nameAr: string;
  subtitleAr: string;
  primaryColor?: number;
  secondaryColor?: number;
  bellyColor?: number;
  swatchPrimary: string;
  swatchAccent: string;
  iridescenceBoost?: number;
  unlock: AppearanceUnlockRequirement;
}

export interface DragonHornPreset {
  id: DragonHornStyleId;
  nameAr: string;
  subtitleAr: string;
  unlock: AppearanceUnlockRequirement;
}

export interface DragonWingPreset {
  id: DragonWingStyleId;
  nameAr: string;
  subtitleAr: string;
  membraneColor?: number;
  eyeColor?: number;
  emissiveTint?: number;
  emissiveIntensity?: number;
  swatchHex: string;
  unlock: AppearanceUnlockRequirement;
}

export const DRAGON_SCALE_PRESETS: DragonScalePreset[] = [
  {
    id: 'default',
    nameAr: 'الحراشف الأصلية',
    subtitleAr: 'المظهر الفطري الكلاسيكي للتنين',
    swatchPrimary: '#64748b',
    swatchAccent: '#cbd5e1',
    unlock: { kind: 'always', labelAr: 'متاح منذ البداية' },
  },
  {
    id: 'crimson_ember',
    nameAr: 'ياقوت الجمر البركاني',
    subtitleAr: 'حراشف قرمزية عميقة بدرع برونزي متقد',
    primaryColor: 0x991b1b,
    secondaryColor: 0x3b0a0a,
    bellyColor: 0xea7a3a,
    swatchPrimary: '#b91c1c',
    swatchAccent: '#fb923c',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 1,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ١',
    },
  },
  {
    id: 'arctic_sapphire',
    nameAr: 'ياقوت الجليد القطبي',
    subtitleAr: 'صفائح زرقاء سماوية بلمعان فضي ناصع',
    primaryColor: 0x0f4c81,
    secondaryColor: 0xdbeafe,
    bellyColor: 0x93c5fd,
    swatchPrimary: '#0369a1',
    swatchAccent: '#dbeafe',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 1,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ١',
    },
  },
  {
    id: 'obsidian_shadow',
    nameAr: 'سبج العاصفة الداجي',
    subtitleAr: 'درع بركاني فاحم بحواف رمادية فولاذية',
    primaryColor: 0x1c1e26,
    secondaryColor: 0x64748b,
    bellyColor: 0x475569,
    swatchPrimary: '#1e293b',
    swatchAccent: '#94a3b8',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 2,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ٢',
    },
  },
  {
    id: 'royal_jade',
    nameAr: 'يشم الأعالي الملكي',
    subtitleAr: 'زمرد غابات السماء مع ترصيع ذهبي عتيق',
    primaryColor: 0x065f46,
    secondaryColor: 0xd4af37,
    bellyColor: 0x6ee7b7,
    swatchPrimary: '#047857',
    swatchAccent: '#fcd34d',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 3,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ٣',
    },
  },
  {
    id: 'amethyst_storm',
    nameAr: 'جمشت الرعد الأسطوري',
    subtitleAr: 'حراشف أرجوانية ملكية ببريق برق فضي',
    primaryColor: 0x4c1d95,
    secondaryColor: 0xddd6fe,
    bellyColor: 0xa78bfa,
    swatchPrimary: '#6d28d9',
    swatchAccent: '#e9d5ff',
    iridescenceBoost: 0.25,
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 3,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ٣',
    },
  },
  {
    id: 'imperial_gold',
    nameAr: 'درع الشمس الإمبراطوري',
    subtitleAr: 'سبائك ذهبية مصقولة لملوك فرسان السماء',
    primaryColor: 0xb45309,
    secondaryColor: 0xfde68a,
    bellyColor: 0xfcd34d,
    swatchPrimary: '#d97706',
    swatchAccent: '#fef08a',
    iridescenceBoost: 0.2,
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 4,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ٤',
    },
  },
  {
    id: 'celestial_prism',
    nameAr: 'طيف الفجر السماوي',
    subtitleAr: 'درع بلوري قزحي فائق النقاء والصلابة',
    primaryColor: 0x0f766e,
    secondaryColor: 0xfef3c7,
    bellyColor: 0x99f6e4,
    swatchPrimary: '#0d9488',
    swatchAccent: '#fde68a',
    iridescenceBoost: 0.55,
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 5,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ٥',
    },
  },
];

export const DRAGON_HORN_PRESETS: DragonHornPreset[] = [
  {
    id: 'classic',
    nameAr: 'التاج الملكي المقوس',
    subtitleAr: 'قرون طويلة منسابة للخلف بتصميم متوازن',
    unlock: { kind: 'always', labelAr: 'متاح منذ البداية' },
  },
  {
    id: 'curved_ram',
    nameAr: 'قرون الكبش الملتفة',
    subtitleAr: 'انحناء دائري مهيب يلتف حول جانبي الرأس',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'scales',
      level: 1,
      labelAr: 'يتطلب: حراشف فولاذية · مستوى ١',
    },
  },
  {
    id: 'split_crown',
    nameAr: 'التاج المزدوج المسنن',
    subtitleAr: 'شعبة قرون مزدوجة حادة وصفائح حاجب معززة',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'breath',
      level: 2,
      labelAr: 'يتطلب: قوة النفث · مستوى ٢',
    },
  },
  {
    id: 'forward_spear',
    nameAr: 'رماح الانقضاض الأمامية',
    subtitleAr: 'قرون هجومية مندفعة للأمام مع نصل أنفي طويل',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'wings',
      level: 2,
      labelAr: 'يتطلب: سرعة الأجنحة · مستوى ٢',
    },
  },
  {
    id: 'ancient_halo',
    nameAr: 'هالة التنين الأقدم',
    subtitleAr: 'تاج إمبراطوري ثلاثي الفروع بحلقات مدرعة',
    unlock: {
      kind: 'total_dragon',
      level: 6,
      labelAr: 'يتطلب: مجموع تطويرات التنين (٦ مستويات)',
    },
  },
];

export const DRAGON_WING_PRESETS: DragonWingPreset[] = [
  {
    id: 'natural',
    nameAr: 'النسيج الفطري الأصلي',
    subtitleAr: 'أغشية وأعين متناغمة مع عنصر التنين',
    swatchHex: '#94a3b8',
    unlock: { kind: 'always', labelAr: 'متاح منذ البداية' },
  },
  {
    id: 'ember_vein',
    nameAr: 'عروق الجمر المتقدة',
    subtitleAr: 'أغشية بركانية دافئة وبريق عيون كهرماني',
    membraneColor: 0xea580c,
    eyeColor: 0xfb923c,
    emissiveTint: 0x7c2d12,
    emissiveIntensity: 0.16,
    swatchHex: '#f97316',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'breath',
      level: 1,
      labelAr: 'يتطلب: قوة النفث · مستوى ١',
    },
  },
  {
    id: 'aurora_frost',
    nameAr: 'شفق الصقيع الفيروزي',
    subtitleAr: 'أجنحة شفافة بلون السماء القطبية وبريق سماوي',
    membraneColor: 0x0ea5e9,
    eyeColor: 0x7dd3fc,
    emissiveTint: 0x0c4a6e,
    emissiveIntensity: 0.18,
    swatchHex: '#38bdf8',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'wings',
      level: 1,
      labelAr: 'يتطلب: سرعة الأجنحة · مستوى ١',
    },
  },
  {
    id: 'abyssal_violet',
    nameAr: 'غسق العاصفة البنفسجي',
    subtitleAr: 'وهج أرجواني رعدي يعكس طاقة الطيران العالية',
    membraneColor: 0x7c3aed,
    eyeColor: 0xd8b4fe,
    emissiveTint: 0x4c1d95,
    emissiveIntensity: 0.22,
    swatchHex: '#a855f7',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'wings',
      level: 3,
      labelAr: 'يتطلب: سرعة الأجنحة · مستوى ٣',
    },
  },
  {
    id: 'solar_gold',
    nameAr: 'أجنحة الشفق الذهبي',
    subtitleAr: 'غشاء ذهبي مضيء وعيون شمسية متوهجة',
    membraneColor: 0xeab308,
    eyeColor: 0xfef08a,
    emissiveTint: 0x854d0e,
    emissiveIntensity: 0.25,
    swatchHex: '#facc15',
    unlock: {
      kind: 'dragon_upgrade',
      key: 'breath',
      level: 4,
      labelAr: 'يتطلب: قوة النفث · مستوى ٤',
    },
  },
];

export interface ProgressionState {
  knightPoints: number;
  dragonPoints: number;
  warsWon: number;
  warWave: number;
  knightUpgrades: Record<KnightUpgradeKey, number>;
  dragonUpgrades: Record<DragonUpgradeKey, number>;
  dragonAppearance: Record<DragonId, DragonAppearanceConfig>;
  loreElapsedSeconds: number;
  savedAt: number | null;
}

export const DEFAULT_PROGRESSION: ProgressionState = {
  knightPoints: 1,
  dragonPoints: 1,
  warsWon: 0,
  warWave: 1,
  knightUpgrades: {
    sword: 0,
    armor: 0,
    spirit: 0,
  },
  dragonUpgrades: {
    breath: 0,
    scales: 0,
    wings: 0,
  },
  dragonAppearance: {
    ignis: { ...DEFAULT_DRAGON_APPEARANCE_BY_ID.ignis },
    glacius: { ...DEFAULT_DRAGON_APPEARANCE_BY_ID.glacius },
    terra: { ...DEFAULT_DRAGON_APPEARANCE_BY_ID.terra },
  },
  loreElapsedSeconds: 0,
  savedAt: null,
};

export function getTotalDragonUpgrades(progression: ProgressionState): number {
  return (
    progression.dragonUpgrades.breath +
    progression.dragonUpgrades.scales +
    progression.dragonUpgrades.wings
  );
}

export function isAppearanceUnlocked(
  req: AppearanceUnlockRequirement,
  progression: ProgressionState,
): boolean {
  if (req.kind === 'always') return true;
  if (req.kind === 'dragon_upgrade') {
    return progression.dragonUpgrades[req.key] >= req.level;
  }
  if (req.kind === 'knight_upgrade') {
    return progression.knightUpgrades[req.key] >= req.level;
  }
  return getTotalDragonUpgrades(progression) >= req.level;
}


export interface DragonSpec {
  id: DragonId;
  nameAr: string;
  titleAr: string;
  element: ElementType;
  elementAr: string;
  descriptionAr: string;
  primaryColor: number;
  secondaryColor: number;
  bellyColor: number;
  membraneColor: number;
  eyeColor: number;
  accentHex: string;
  maxHp: number;
  maxEnergy: number;
  baseSpeed: number;
  turnRate: number;
  wingSpan: number;
}

export const DRAGON_SPECS: Record<DragonId, DragonSpec> = {
  ignis: {
    id: 'ignis',
    nameAr: 'سَعِير',
    titleAr: 'تنين اللهب الملكي',
    element: 'fire',
    elementAr: 'النار',
    descriptionAr:
      'سريع الانقضاض، قشوره بلون الياقوت والبركان، ينفث سيلاً من الجمر الحارق يشعل السماء.',
    primaryColor: 0x8b1e16,
    secondaryColor: 0x261210,
    bellyColor: 0xd48b45,
    membraneColor: 0xc2410c,
    eyeColor: 0xffaa00,
    accentHex: '#f97316',
    maxHp: 120,
    maxEnergy: 100,
    baseSpeed: 70,
    turnRate: 1.9,
    wingSpan: 1.0,
  },
  glacius: {
    id: 'glacius',
    nameAr: 'صَقِيع',
    titleAr: 'تنين الجليد القطبي',
    element: 'ice',
    elementAr: 'الجليد',
    descriptionAr:
      'رشيق المناورة بين شقوق الجبال، ينفث عاصفة صقيع بلورية تبطئ الأعداء وتجمّد الهواء.',
    primaryColor: 0x1d4e78,
    secondaryColor: 0xdbeafe,
    bellyColor: 0xb6d6f2,
    membraneColor: 0x38bdf8,
    eyeColor: 0x7dd3fc,
    accentHex: '#38bdf8',
    maxHp: 110,
    maxEnergy: 115,
    baseSpeed: 74,
    turnRate: 2.2,
    wingSpan: 0.96,
  },
  terra: {
    id: 'terra',
    nameAr: 'جَلْمُود',
    titleAr: 'تنين الصخر العتيق',
    element: 'rock',
    elementAr: 'الصخر',
    descriptionAr:
      'مدرع بألواح بازلتية وذهبية صلبة، يقذف صخوراً منصهرة متفجرة تحطم حصون الممالك.',
    primaryColor: 0x4b443b,
    secondaryColor: 0xb48a3e,
    bellyColor: 0x9b8b73,
    membraneColor: 0x785d38,
    eyeColor: 0xfbbf24,
    accentHex: '#eab308',
    maxHp: 155,
    maxEnergy: 105,
    baseSpeed: 64,
    turnRate: 1.7,
    wingSpan: 1.12,
  },
};

export interface LandmarkInfo {
  id: string;
  nameAr: string;
  subtitleAr: string;
  x: number;
  y: number;
  z: number;
}

export const WORLD_LANDMARKS: LandmarkInfo[] = [
  {
    id: 'sanctuary',
    nameAr: 'كهف ملاذ الصخور',
    subtitleAr: 'مأوى صخري داخل الجبل',
    x: -640,
    y: 56,
    z: 580,
  },
  {
    id: 'roost',
    nameAr: 'أشجار المبيت المعلقة',
    subtitleAr: 'أشجار شاهقة تتدلى منها التنانين',
    x: -510,
    y: 78,
    z: 375,
  },
  {
    id: 'chasm',
    nameAr: 'شقوق الجبال التوأم',
    subtitleAr: 'ممر صخري عميق للتحليق',
    x: -480,
    y: 82,
    z: -560,
  },
  {
    id: 'castle',
    nameAr: 'مملكة قلعة الصقر',
    subtitleAr: 'أسوار وحصون يحرسها الجنود',
    x: -880,
    y: 92,
    z: -60,
  },
  {
    id: 'palace',
    nameAr: 'مملكة قصر المرجان',
    subtitleAr: 'قلعة ملكية وقباب مطلة على الخليج',
    x: 820,
    y: 62,
    z: -480,
  },
  {
    id: 'beach',
    nameAr: 'الشاطئ الذهبي',
    subtitleAr: 'خليج رملي وأشجار نخيل',
    x: 720,
    y: 26,
    z: 560,
  },
  {
    id: 'volcano',
    nameAr: 'جبل البركان الأعظم',
    subtitleAr: 'فوهة بركانية مشتعلة شرق البحر',
    x: 940,
    y: 120,
    z: 90,
  },
  {
    id: 'frostspire',
    nameAr: 'أبراج الجليد الشمالية',
    subtitleAr: 'قمم ثلجية في أقصى الشمال',
    x: 120,
    y: 98,
    z: -940,
  },
  {
    id: 'pirates',
    nameAr: 'أسطول القراصنة',
    subtitleAr: 'سفن حربية تجوب المحيط',
    x: 80,
    y: 32,
    z: 60,
  },
  {
    id: 'volcanic_archipelago',
    nameAr: 'جزر البراكين الخفية',
    subtitleAr: 'فوهات حمم وأبراج بازلتية خفية',
    x: -1520,
    y: 112,
    z: -1500,
  },
  {
    id: 'enchanted_forest',
    nameAr: 'الغابات المسحورة',
    subtitleAr: 'أشجار مضيئة ومزارات بلورية قديمة',
    x: -1600,
    y: 62,
    z: 1220,
  },
  {
    id: 'eastern_sky_spires',
    nameAr: 'أبراج السماء الشرقية',
    subtitleAr: 'قمم شاهقة وتيارات هوائية عاتية في الأفق الشرقي',
    x: 2950,
    y: 165,
    z: -2350,
  },
  {
    id: 'southern_coral_atoll',
    nameAr: 'أرخبيل المرجان الجنوبي',
    subtitleAr: 'بحيرة فيروزية وجزر نخيل دافئة في أقصى الجنوب',
    x: 2450,
    y: 46,
    z: 2780,
  },
  {
    id: 'northern_glacier_crown',
    nameAr: 'تاج الجليد الأعظم',
    subtitleAr: 'جبال جليدية شاهقة تتلألأ تحت الشمس القطبية',
    x: -360,
    y: 185,
    z: -3350,
  },
  {
    id: 'western_storm_isles',
    nameAr: 'جزر العواصف الغربية',
    subtitleAr: 'جروف بازلتية وعواصف عاتية في البحر الغربي السحيق',
    x: -3250,
    y: 125,
    z: 260,
  },
];

export interface EnemyIndicator {
  id: string;
  nameAr: string;
  screenX: number;
  screenY: number;
  visible: boolean;
  hp: number;
  maxHp: number;
  distance: number;
  canBoard: boolean;
  isAlly: boolean;
}

export type MinimapBlipKind =
  | 'enemy_dragon'
  | 'ally_dragon'
  | 'pirate_ship'
  | 'mission_landmark'
  | 'sanctuary';

export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';

export interface MinimapBlip {
  id: string;
  kind: MinimapBlipKind;
  relX: number;
  relY: number;
  distance: number;
  clamped: boolean;
  threat: ThreatLevel;
  labelAr?: string;
}

export type ManeuverKind =
  | 'none'
  | 'sharp_turn'
  | 'knife_edge'
  | 'half_loop'
  | 'steep_dive'
  | 'barrel_roll';

export type FlightTipCategory = 'maneuver' | 'landmark';

export interface FlightTip {
  id: string;
  category: FlightTipCategory;
  titleAr: string;
  bodyAr: string;
  mechanicTagAr: string;
}

export interface HudState {
  phase: GamePhase;
  mode: GameMode;
  dragonId: DragonId;
  activeElement: ElementType;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  bondLevel: number;
  speed: number;
  altitude: number;
  zoneNameAr: string;
  isSkimmingWater: boolean;
  isSlicingCloud: boolean;
  nearSanctuary: boolean;
  boardableEnemyId: string | null;
  boardableEnemyName: string | null;
  boardingHits: number;
  boardingHitsRequired: number;
  allyScore: number;
  enemyScore: number;
  alliesAlive: number;
  enemiesAlive: number;
  indicators: EnemyIndicator[];
  minimapBlips: MinimapBlip[];
  playerHeadingDeg: number;
  toastMessage: string | null;
  activeFlightTip: FlightTip | null;
  woundsCount: number;
  pointerLocked: boolean;
  weather: WeatherState;
  weatherMode: WeatherMode;
  stormIntensity: number;
  lightningActive: boolean;
  cameraView: CameraView;
  isLooping: boolean;
  isBarrelRolling: boolean;
  barrelRollCooldown: number;
  barrelRollCooldownMax: number;
  knifeEdgeSide: -1 | 0 | 1;
  maneuverKind: ManeuverKind;
  maneuverSide: -1 | 0 | 1;
  maneuverIntensity: number;
  bankAngleDeg: number;
  motionBlurIntensity: number;
  isBoosting: boolean;
  nearLandedDragon: boolean;
  isInWater: boolean;
  warType: WarTargetType;
  warTimeLeft: number;
  warDuration: number;
  warStatus: WarStatus;
  warDragonsKilled: number;
  warDragonsGoal: number;
  warShipsSunk: number;
  warShipsGoal: number;
  progression: ProgressionState;
  dangerAlertActive: boolean;
  activeLoreTaleId: string | null;
  activeLoreSegment: number;
  isLorePlaying: boolean;
  knightSpeechText: string | null;
  spiritualBond: number;
  isCommuning: boolean;
  communeCooldown: number;
  communeCooldownMax: number;
  fusionActive: boolean;
  fusionTimeLeft: number;
  fusionDuration: number;
  inWindCurrent: boolean;
  windCurrentIntensity: number;
  autoCinematicEnabled: boolean;
  cinematicActive: boolean;
  cinematicLandmarkNameAr: string | null;
  cinematicLandmarkSubtitleAr: string | null;
}

export type HudControlId =
  | 'joystick'
  | 'attack'
  | 'elements'
  | 'actions'
  | 'vitals'
  | 'bond'
  | 'minimap';

export interface HudPoint {
  xPct: number;
  yPct: number;
}

export interface HudLayoutConfig {
  positions: Record<HudControlId, HudPoint>;
  buttonScale: number;
  buttonOpacity: number;
  compactTopBar: boolean;
  showIndicators: boolean;
}

export const DEFAULT_HUD_LAYOUT: HudLayoutConfig = {
  positions: {
    vitals: { xPct: 12, yPct: 7 },
    bond: { xPct: 12, yPct: 19 },
    minimap: { xPct: 92, yPct: 24 },
    joystick: { xPct: 10, yPct: 80 },
    elements: { xPct: 85, yPct: 60 },
    actions: { xPct: 76, yPct: 79 },
    attack: { xPct: 91, yPct: 79 },
  },
  buttonScale: 0.9,
  buttonOpacity: 0.84,
  compactTopBar: false,
  showIndicators: true,
};

export const HUD_LAYOUT_PRESETS: Record<
  'standard' | 'compact_edges' | 'left_handed',
  HudLayoutConfig
> = {
  standard: DEFAULT_HUD_LAYOUT,
  compact_edges: {
    positions: {
      vitals: { xPct: 11, yPct: 6.5 },
      bond: { xPct: 11, yPct: 17.5 },
      minimap: { xPct: 93, yPct: 21 },
      joystick: { xPct: 8.5, yPct: 82 },
      elements: { xPct: 88, yPct: 61 },
      actions: { xPct: 78, yPct: 81 },
      attack: { xPct: 93, yPct: 81 },
    },
    buttonScale: 0.8,
    buttonOpacity: 0.72,
    compactTopBar: true,
    showIndicators: true,
  },
  left_handed: {
    positions: {
      vitals: { xPct: 88, yPct: 7 },
      bond: { xPct: 88, yPct: 19 },
      minimap: { xPct: 8, yPct: 24 },
      joystick: { xPct: 90, yPct: 80 },
      elements: { xPct: 15, yPct: 60 },
      actions: { xPct: 24, yPct: 79 },
      attack: { xPct: 9, yPct: 79 },
    },
    buttonScale: 0.9,
    buttonOpacity: 0.84,
    compactTopBar: false,
    showIndicators: true,
  },
};
