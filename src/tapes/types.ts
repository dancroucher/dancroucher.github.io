export interface InfiniteConfig {
  source: 'youtube';
  type: 'decade' | 'genre' | 'year' | 'artist';
  value: string;
}

export interface InfiniteTrack {
  videoId: string;
  title: string;
  author: string;
}

export interface Tape {
  id: string;
  videoId: string;
  playlistId?: string;
  isPlaylist: boolean;
  title: string;
  author: string;
  tapeStyle: number;
  progress: number;
  playlistIndex?: number;
  timestamp: number;
  x?: number;
  y?: number;
  angle?: number;
  // 3D texture variant: 'a', 'b', or 'c'
  textureVariant?: string;
  // Infinite tape fields
  isInfinite?: boolean;
  infiniteConfig?: InfiniteConfig;
  infiniteHistory?: InfiniteTrack[];
  infiniteIndex?: number;
}

export const TAPE_STYLES: {
  housing: string;
  label: string;
  titleBg: string;
  midBg: string;
  stripes: string[];
}[] = [
  { // 0: Sony HF-ES — dark housing, silver/white label, grey mid
    housing: '#1e1e1e',
    label: '#2a2a2a',
    titleBg: '#e8e4dc',
    midBg: '#888884',
    stripes: ['#888884', '#787874', '#686864', '#585854'],
  },
  { // 1: Sony BHF — dark housing, cream label, green mid-stripe
    housing: '#1c1c1c',
    label: '#2a2a28',
    titleBg: '#ede8d8',
    midBg: '#4a7a4a',
    stripes: ['#4a7a4a', '#3a6a3a', '#2a5a2a', '#1a4a1a'],
  },
  { // 2: Sony HF-S — dark housing, white label, red accent line
    housing: '#1e1e1e',
    label: '#2a2a2a',
    titleBg: '#f0ece4',
    midBg: '#b83030',
    stripes: ['#b83030', '#a82828', '#982020', '#881818'],
  },
  { // 3: Sony CHF — dark housing, red/gold stripe, cream label
    housing: '#1a1a1a',
    label: '#1e1e1e',
    titleBg: '#e8e0cc',
    midBg: '#c83828',
    stripes: ['#c83828', '#b83020', '#a82818', '#982010'],
  },
  { // 4: Maxell UD II — dark housing, gold/amber label area
    housing: '#1c1c1c',
    label: '#8a6828',
    titleBg: '#c8a040',
    midBg: '#b09030',
    stripes: ['#b09030', '#a08028', '#907020', '#806018'],
  },
  { // 5: Maxell XL II — dark housing, gold title, dark charcoal mid
    housing: '#1a1a1a',
    label: '#282828',
    titleBg: '#c8a848',
    midBg: '#333330',
    stripes: ['#333330', '#2a2a28', '#222220', '#1a1a18'],
  },
  { // 6: Maxell XL II (cream) — dark teal housing, cream label
    housing: '#1a2828',
    label: '#282828',
    titleBg: '#ede8d8',
    midBg: '#c8b880',
    stripes: ['#c8b880', '#b8a870', '#a89860', '#988850'],
  },
  { // 7: Maxell UD II CD — all dark, gold accents
    housing: '#181818',
    label: '#222220',
    titleBg: '#c0a040',
    midBg: '#282828',
    stripes: ['#282828', '#222222', '#1c1c1c', '#161616'],
  },
  { // 8: Maxell AD — dark housing, beige/cream label, olive mid
    housing: '#1a1e1a',
    label: '#2a2e2a',
    titleBg: '#e0dcc8',
    midBg: '#606850',
    stripes: ['#606850', '#505840', '#404830', '#303820'],
  },
  { // 9: Sony D — dark housing, gold mid, cream label
    housing: '#1c1c1c',
    label: '#282828',
    titleBg: '#e8e0c8',
    midBg: '#b8a048',
    stripes: ['#b8a048', '#a89040', '#988038', '#887030'],
  },
  { // 10: Generic — dark housing, white label, dark grey mid
    housing: '#1e1e1e',
    label: '#2a2a2a',
    titleBg: '#f0ece0',
    midBg: '#484848',
    stripes: ['#484848', '#404040', '#383838', '#303030'],
  },
  { // 11: BHF green — dark housing, green label band, off-white title
    housing: '#1c1c1c',
    label: '#3a6a3a',
    titleBg: '#eee8d8',
    midBg: '#4a7848',
    stripes: ['#4a7848', '#3a6838', '#2a5828', '#1a4818'],
  },
  { // 12: GT-IIx — dark housing, gold/bronze mid, cream label
    housing: '#1a1a1a',
    label: '#282420',
    titleBg: '#e8e0c8',
    midBg: '#a89040',
    stripes: ['#a89040', '#988038', '#887030', '#786028'],
  },
  { // 13: Clear/transparent style — very dark, silver label
    housing: '#141414',
    label: '#1a1a1a',
    titleBg: '#d8d4cc',
    midBg: '#3a3a3a',
    stripes: ['#3a3a3a', '#333333', '#2c2c2c', '#252525'],
  },
  { // 14: Maxell XL II 90 — dark housing, gold title, warm dark mid
    housing: '#1a1a18',
    label: '#2a2820',
    titleBg: '#cca848',
    midBg: '#3a3830',
    stripes: ['#3a3830', '#323028', '#2a2820', '#222018'],
  },
  { // 15: Sony HF — warm dark housing, warm white label, beige mid
    housing: '#222220',
    label: '#383830',
    titleBg: '#f0e8d8',
    midBg: '#c8c0a8',
    stripes: ['#c8c0a8', '#b8b098', '#a8a088', '#989078'],
  },
  { // 16: Red-stripe — dark housing, off-white label, red accent
    housing: '#1e1e1e',
    label: '#1a1a1a',
    titleBg: '#eee8dc',
    midBg: '#c03030',
    stripes: ['#c03030', '#b02828', '#a02020', '#901818'],
  },
  { // 17: Cream/beige — dark housing, warm cream label, tan mid
    housing: '#1e1e1c',
    label: '#383428',
    titleBg: '#ede4c8',
    midBg: '#c0b088',
    stripes: ['#c0b088', '#b0a078', '#a09068', '#908058'],
  },
  { // 18: All-dark premium — near-black housing, dark grey everything
    housing: '#141414',
    label: '#1a1a1a',
    titleBg: '#282828',
    midBg: '#1e1e1e',
    stripes: ['#1e1e1e', '#1a1a1a', '#161616', '#121212'],
  },
  { // 19: Gold premium — dark housing, rich gold label, dark mid
    housing: '#181818',
    label: '#8a7028',
    titleBg: '#d0b048',
    midBg: '#2a2820',
    stripes: ['#2a2820', '#242218', '#1e1c10', '#181608'],
  },
  { // 20: White label classic — dark housing, clean white label, charcoal
    housing: '#1c1c1c',
    label: '#2a2a2a',
    titleBg: '#f2eee4',
    midBg: '#505050',
    stripes: ['#505050', '#484848', '#404040', '#383838'],
  },
  { // 21: Teal accent — dark housing, off-white label, dark teal mid
    housing: '#1a1e1e',
    label: '#1e2828',
    titleBg: '#e8e4d8',
    midBg: '#2a5050',
    stripes: ['#2a5050', '#204040', '#183838', '#103030'],
  },
  { // 22: Yellow-cream label — dark housing, yellowed label, warm grey
    housing: '#1e1e1c',
    label: '#3a3828',
    titleBg: '#e8dcb0',
    midBg: '#888068',
    stripes: ['#888068', '#787058', '#686048', '#585038'],
  },
  { // 23: Maxell UD gold/red — dark housing, gold mid, red stripe accent
    housing: '#1a1a1a',
    label: '#682020',
    titleBg: '#c8a040',
    midBg: '#a88830',
    stripes: ['#a88830', '#987828', '#886820', '#785818'],
  },
  { // 24: Silver-grey — dark housing, cool grey label, medium grey mid
    housing: '#1c1c1e',
    label: '#303038',
    titleBg: '#d8d8d4',
    midBg: '#6a6a68',
    stripes: ['#6a6a68', '#606060', '#585858', '#505050'],
  },
  { // 25: Warm aged — dark housing, heavily yellowed label, brown-gold mid
    housing: '#201e1a',
    label: '#4a4028',
    titleBg: '#ddd0a8',
    midBg: '#9a8850',
    stripes: ['#9a8850', '#8a7840', '#7a6830', '#6a5820'],
  },
  { // 26: Green label band — dark housing, off-white label, bright green accent
    housing: '#1c1c1c',
    label: '#2a4a2a',
    titleBg: '#eee8dc',
    midBg: '#3a7a3a',
    stripes: ['#3a7a3a', '#2a6a2a', '#1a5a1a', '#0a4a0a'],
  },
  { // 27: Minimal — very dark, pale cream label, subtle dark mid
    housing: '#161616',
    label: '#1e1e1e',
    titleBg: '#e8e4d8',
    midBg: '#2a2a2a',
    stripes: ['#2a2a2a', '#242424', '#1e1e1e', '#181818'],
  },
  { // 28: Gold metallic — shiny gold title, dark gold mid
    housing: '#1a1a18',
    label: '#6a5820',
    titleBg: 'linear-gradient(135deg, #c8a040 0%, #e8cc68 25%, #d4b050 40%, #f0d878 55%, #c8a040 70%, #b89030 100%)',
    midBg: 'linear-gradient(135deg, #8a7028 0%, #b09838 30%, #9a8030 50%, #c0a840 70%, #8a7028 100%)',
    stripes: ['#8a7028', '#7a6020', '#6a5018', '#5a4010'],
  },
  { // 29: Silver metallic — chrome/silver title, steel mid
    housing: '#1a1a1c',
    label: '#404048',
    titleBg: 'linear-gradient(135deg, #b0b0b4 0%, #d8d8dc 25%, #c0c0c4 40%, #e8e8ec 55%, #b0b0b4 70%, #a0a0a4 100%)',
    midBg: 'linear-gradient(135deg, #686870 0%, #888890 30%, #787880 50%, #989898 70%, #686870 100%)',
    stripes: ['#686870', '#585860', '#484850', '#383840'],
  },
  { // 30: Gold premium — dark housing, gold shimmer everywhere
    housing: '#141410',
    label: 'linear-gradient(90deg, #7a6428 0%, #9a8438 50%, #7a6428 100%)',
    titleBg: 'linear-gradient(135deg, #d0a838 0%, #e8c858 20%, #c8a030 45%, #ecd060 60%, #d0a838 80%, #b89028 100%)',
    midBg: '#2a2818',
    stripes: ['#2a2818', '#242210', '#1e1c08', '#181600'],
  },
  { // 31: Silver chrome — cool silver label, dark chrome mid
    housing: '#181820',
    label: '#2a2a30',
    titleBg: 'linear-gradient(135deg, #c8c8d0 0%, #e0e0e8 30%, #b8b8c0 50%, #e8e8f0 65%, #c0c0c8 85%, #a8a8b0 100%)',
    midBg: 'linear-gradient(135deg, #484850 0%, #606068 30%, #505058 50%, #707078 70%, #484850 100%)',
    stripes: ['#484850', '#404048', '#383840', '#303038'],
  },
];

