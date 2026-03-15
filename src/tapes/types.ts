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
}

export const TAPE_STYLES: {
  housing: string;
  housingAlt: string;
  label: string;
  labelAlt: string;
  accent: string;
  textColor: string;
  spoolColor: string;
  tapeColor: string;
  windowTint: string;
}[] = [
  // 0 - Classic white
  { housing: '#e8e4dc', housingAlt: '#d4d0c8', label: '#f5f2ec', labelAlt: '#ebe8e0', accent: '#c41e3a', textColor: '#1a1a1a', spoolColor: '#fff', tapeColor: '#2a1810', windowTint: 'rgba(200,195,185,0.3)' },
  // 1 - TDK SA grey
  { housing: '#8a8a8a', housingAlt: '#7a7a7a', label: '#b8d4e8', labelAlt: '#a0c0d8', accent: '#1a5276', textColor: '#0a2540', spoolColor: '#ddd', tapeColor: '#1a0f08', windowTint: 'rgba(100,100,100,0.3)' },
  // 2 - Maxell gold
  { housing: '#c8a854', housingAlt: '#b89844', label: '#f0e8c0', labelAlt: '#e8ddb0', accent: '#8b4513', textColor: '#3a2a10', spoolColor: '#e8d8a0', tapeColor: '#1a0f08', windowTint: 'rgba(180,160,80,0.3)' },
  // 3 - Sony black
  { housing: '#2a2a2a', housingAlt: '#1a1a1a', label: '#e0ddd5', labelAlt: '#d0cdc5', accent: '#ff6600', textColor: '#1a1a1a', spoolColor: '#444', tapeColor: '#0a0604', windowTint: 'rgba(40,40,40,0.3)' },
  // 4 - Memorex red
  { housing: '#b52020', housingAlt: '#a01818', label: '#f5f0e8', labelAlt: '#e8e3db', accent: '#1a1a1a', textColor: '#1a1a1a', spoolColor: '#d44', tapeColor: '#1a0f08', windowTint: 'rgba(160,30,30,0.3)' },
  // 5 - BASF chrome blue
  { housing: '#2a4a6a', housingAlt: '#1a3a5a', label: '#c8dce8', labelAlt: '#b8ccd8', accent: '#ff8c00', textColor: '#0a2040', spoolColor: '#6a8aaa', tapeColor: '#0a0604', windowTint: 'rgba(40,70,100,0.3)' },
  // 6 - Fuji green
  { housing: '#2a6a3a', housingAlt: '#1a5a2a', label: '#d8e8d0', labelAlt: '#c8d8c0', accent: '#f0c040', textColor: '#0a3010', spoolColor: '#4a8a5a', tapeColor: '#1a0f08', windowTint: 'rgba(40,100,55,0.3)' },
  // 7 - Scotch transparent
  { housing: '#d8d0c4', housingAlt: '#c8c0b4', label: '#f8f4ec', labelAlt: '#ece8e0', accent: '#cc3333', textColor: '#2a2a2a', spoolColor: '#eee', tapeColor: '#2a1810', windowTint: 'rgba(220,215,200,0.15)' },
  // 8 - Denon purple
  { housing: '#4a2a6a', housingAlt: '#3a1a5a', label: '#d8c8e8', labelAlt: '#c8b8d8', accent: '#e8a020', textColor: '#1a0a30', spoolColor: '#7a5a9a', tapeColor: '#0a0604', windowTint: 'rgba(70,40,100,0.3)' },
  // 9 - Nakamichi silver
  { housing: '#9a9a9a', housingAlt: '#8a8a8a', label: '#e0e0e0', labelAlt: '#d0d0d0', accent: '#333333', textColor: '#1a1a1a', spoolColor: '#bbb', tapeColor: '#0a0604', windowTint: 'rgba(140,140,140,0.3)' },
  // 10 - Realistic orange
  { housing: '#cc6622', housingAlt: '#bb5511', label: '#f8e8d0', labelAlt: '#f0ddc0', accent: '#2a2a2a', textColor: '#2a1a08', spoolColor: '#e89040', tapeColor: '#1a0f08', windowTint: 'rgba(190,95,30,0.3)' },
  // 11 - That's pink
  { housing: '#cc4488', housingAlt: '#bb3377', label: '#f8d8e8', labelAlt: '#f0c8d8', accent: '#ffffff', textColor: '#4a1030', spoolColor: '#e87aaa', tapeColor: '#1a0f08', windowTint: 'rgba(190,60,125,0.3)' },
  // 12 - Agfa brown
  { housing: '#6a4a2a', housingAlt: '#5a3a1a', label: '#e8d8c0', labelAlt: '#d8c8b0', accent: '#cc3333', textColor: '#2a1a08', spoolColor: '#8a6a4a', tapeColor: '#1a0f08', windowTint: 'rgba(100,70,40,0.3)' },
  // 13 - Ampex reel-to-reel cream
  { housing: '#d8c8a8', housingAlt: '#c8b898', label: '#f0e8d0', labelAlt: '#e8e0c0', accent: '#1a5a1a', textColor: '#2a2010', spoolColor: '#e0d0b0', tapeColor: '#2a1810', windowTint: 'rgba(200,185,155,0.3)' },
  // 14 - Quantegy teal
  { housing: '#1a6a6a', housingAlt: '#0a5a5a', label: '#c8e8e8', labelAlt: '#b8d8d8', accent: '#ff6600', textColor: '#0a3030', spoolColor: '#4a9a9a', tapeColor: '#0a0604', windowTint: 'rgba(25,100,100,0.3)' },
  // 15 - EMI red-brown
  { housing: '#7a2a1a', housingAlt: '#6a1a0a', label: '#f0d8c8', labelAlt: '#e0c8b8', accent: '#f0c040', textColor: '#3a1008', spoolColor: '#a04a3a', tapeColor: '#1a0f08', windowTint: 'rgba(115,38,22,0.3)' },
  // 16 - Philips dark green
  { housing: '#1a4a2a', housingAlt: '#0a3a1a', label: '#c8e0c8', labelAlt: '#b8d0b8', accent: '#ff8c00', textColor: '#0a2010', spoolColor: '#3a7a4a', tapeColor: '#0a0604', windowTint: 'rgba(25,70,40,0.3)' },
  // 17 - Capitol lemon
  { housing: '#c8b820', housingAlt: '#b8a810', label: '#f8f0c0', labelAlt: '#f0e8b0', accent: '#cc3333', textColor: '#3a3008', spoolColor: '#d8c840', tapeColor: '#1a0f08', windowTint: 'rgba(185,170,28,0.3)' },
  // 18 - Certron slate
  { housing: '#4a5058', housingAlt: '#3a4048', label: '#d0d4d8', labelAlt: '#c0c4c8', accent: '#e8a020', textColor: '#1a1c20', spoolColor: '#6a7078', tapeColor: '#0a0604', windowTint: 'rgba(70,76,82,0.3)' },
  // 19 - Irish warm grey
  { housing: '#8a7a6a', housingAlt: '#7a6a5a', label: '#e8e0d0', labelAlt: '#d8d0c0', accent: '#2a7a2a', textColor: '#2a2018', spoolColor: '#aa9a8a', tapeColor: '#1a0f08', windowTint: 'rgba(130,115,100,0.3)' },
  // 20 - Maxell XLII-S black/gold
  { housing: '#1a1a1a', housingAlt: '#0a0a0a', label: '#d8c890', labelAlt: '#c8b880', accent: '#c8a050', textColor: '#3a3010', spoolColor: '#333', tapeColor: '#0a0604', windowTint: 'rgba(20,20,20,0.3)' },
  // 21 - TDK MA-R metal
  { housing: '#6a6a70', housingAlt: '#5a5a60', label: '#e8e8ec', labelAlt: '#d8d8dc', accent: '#cc2222', textColor: '#1a1a20', spoolColor: '#8a8a90', tapeColor: '#0a0604', windowTint: 'rgba(100,100,105,0.3)' },
  // 22 - Sunset gradient
  { housing: '#cc5533', housingAlt: '#bb4422', label: '#f8e0c8', labelAlt: '#f0d0b8', accent: '#ffd700', textColor: '#3a1808', spoolColor: '#e07a50', tapeColor: '#1a0f08', windowTint: 'rgba(190,78,45,0.3)' },
  // 23 - Ocean blue
  { housing: '#1a3a8a', housingAlt: '#0a2a7a', label: '#c8d8f8', labelAlt: '#b8c8f0', accent: '#ff4444', textColor: '#0a1840', spoolColor: '#3a5aaa', tapeColor: '#0a0604', windowTint: 'rgba(25,55,130,0.3)' },
  // 24 - Mint green
  { housing: '#5aaa8a', housingAlt: '#4a9a7a', label: '#d8f0e8', labelAlt: '#c8e0d8', accent: '#cc3366', textColor: '#0a3028', spoolColor: '#7acaaa', tapeColor: '#1a0f08', windowTint: 'rgba(85,160,130,0.3)' },
  // 25 - Coral pink
  { housing: '#e87060', housingAlt: '#d86050', label: '#fce8e4', labelAlt: '#f4d8d4', accent: '#1a5a6a', textColor: '#4a1810', spoolColor: '#f09080', tapeColor: '#1a0f08', windowTint: 'rgba(220,105,90,0.3)' },
  // 26 - Plum
  { housing: '#6a2a5a', housingAlt: '#5a1a4a', label: '#e8c8e0', labelAlt: '#d8b8d0', accent: '#f0c040', textColor: '#2a0a20', spoolColor: '#8a4a7a', tapeColor: '#0a0604', windowTint: 'rgba(100,38,85,0.3)' },
  // 27 - Olive drab
  { housing: '#6a6a2a', housingAlt: '#5a5a1a', label: '#e0e0c0', labelAlt: '#d0d0b0', accent: '#cc4444', textColor: '#2a2a08', spoolColor: '#8a8a4a', tapeColor: '#1a0f08', windowTint: 'rgba(100,100,38,0.3)' },
  // 28 - Charcoal
  { housing: '#3a3a3a', housingAlt: '#2a2a2a', label: '#c8c8c8', labelAlt: '#b8b8b8', accent: '#00cccc', textColor: '#0a0a0a', spoolColor: '#555', tapeColor: '#0a0604', windowTint: 'rgba(55,55,55,0.3)' },
  // 29 - Sand
  { housing: '#c8b090', housingAlt: '#b8a080', label: '#f0e8d8', labelAlt: '#e8e0c8', accent: '#6a3a1a', textColor: '#3a2810', spoolColor: '#d8c0a0', tapeColor: '#2a1810', windowTint: 'rgba(185,162,132,0.3)' },
  // 30 - Neon green
  { housing: '#1a3a1a', housingAlt: '#0a2a0a', label: '#c8f0c8', labelAlt: '#a8e0a8', accent: '#00ff66', textColor: '#0a2a0a', spoolColor: '#2a5a2a', tapeColor: '#0a0604', windowTint: 'rgba(25,55,25,0.3)' },
  // 31 - Ice blue
  { housing: '#a8c8e0', housingAlt: '#98b8d0', label: '#e0f0f8', labelAlt: '#d0e8f0', accent: '#1a3a5a', textColor: '#0a2040', spoolColor: '#b8d8f0', tapeColor: '#1a0f08', windowTint: 'rgba(158,188,210,0.3)' },
];

export const STORAGE_KEY = 'jeem_tapes';
