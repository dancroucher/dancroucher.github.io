export const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const IMVDB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; jeem-fm/1.0)',
  'Accept': 'application/json',
};

// Parse "3:45" or "1:02:30" to seconds
export function parseDuration(text) {
  if (!text) return 0;
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

// Extract and parse ytInitialData JSON from a YouTube HTML page
export function parseYtInitialData(html) {
  const match = html.match(/var ytInitialData\s*=\s*({.*?});\s*<\/script>/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

// Fisher-Yates shuffle (returns new array)
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
