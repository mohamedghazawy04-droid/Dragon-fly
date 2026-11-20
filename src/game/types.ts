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

export interface ProgressionState {
  knightPoints: number;
  dragonPoints: number;
  warsWon: number;
  warWave: number;
  knightUpgrades: Record<KnightUpgradeKey, number>;
  dragonUpgrades: Record<DragonUpgradeKey, number>;
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
  loreElapsedSeconds: 0,
  savedAt: null,
};

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
  toastMessage: string | null;
  woundsCount: number;
  pointerLocked: boolean;
  weather: WeatherState;
  weatherMode: WeatherMode;
  stormIntensity: number;
  lightningActive: boolean;
  cameraView: CameraView;
  isLooping: boolean;
  knifeEdgeSide: -1 | 0 | 1;
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
}

export type HudControlId = 'joystick' | 'attack' | 'elements' | 'actions' | 'vitals';

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
    vitals: { xPct: 14, yPct: 7 },
    joystick: { xPct: 10, yPct: 79 },
    elements: { xPct: 86, yPct: 60 },
    actions: { xPct: 76, yPct: 80 },
    attack: { xPct: 91, yPct: 80 },
  },
  buttonScale: 0.9,
  buttonOpacity: 0.78,
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
      vitals: { xPct: 13, yPct: 6 },
      joystick: { xPct: 8, yPct: 82 },
      elements: { xPct: 91, yPct: 54 },
      actions: { xPct: 82, yPct: 84 },
      attack: { xPct: 93, yPct: 83 },
    },
    buttonScale: 0.78,
    buttonOpacity: 0.65,
    compactTopBar: true,
    showIndicators: true,
  },
  left_handed: {
    positions: {
      vitals: { xPct: 86, yPct: 7 },
      joystick: { xPct: 90, yPct: 79 },
      elements: { xPct: 14, yPct: 60 },
      actions: { xPct: 24, yPct: 80 },
      attack: { xPct: 9, yPct: 80 },
    },
    buttonScale: 0.9,
    buttonOpacity: 0.78,
    compactTopBar: false,
    showIndicators: true,
  },
};
