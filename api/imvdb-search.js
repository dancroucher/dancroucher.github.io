// Search music videos via IMVDb, returns YouTube video IDs
// Supports optional year filtering: /api/imvdb-search?q=rock&year=1985
// Or decade: /api/imvdb-search?q=rock&decade=1980

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; jeem-fm/1.0)',
  'Accept': 'application/json',
};

function imvdbFetch(url, timeout = 8000) {
  return fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(timeout) });
}

export default async function handler(req, res) {
  const query = req.query.q;
  const yearFilter = req.query.year ? parseInt(req.query.year) : null;
  const decadeFilter = req.query.decade ? parseInt(req.query.decade) : null;
  const page = req.query.page ? parseInt(req.query.page) : 1;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Missing query parameter' });
  }

  try {
    // Search IMVDb
    const searchRes = await imvdbFetch(
      `https://imvdb.com/api/v1/search/videos?q=${encodeURIComponent(query.trim())}&per_page=50&page=${page}`
    );
    if (!searchRes.ok) {
      return res.status(502).json({ error: `IMVDb search failed: ${searchRes.status}` });
    }
    const searchData = await searchRes.json();

    let videos = searchData.results || [];

    // Filter by year or decade if specified
    if (yearFilter) {
      videos = videos.filter(v => v.year === yearFilter);
    } else if (decadeFilter) {
      videos = videos.filter(v => v.year >= decadeFilter && v.year < decadeFilter + 10);
    }

    if (videos.length === 0) {
      return res.status(200).json({ results: [], total: 0 });
    }

    // Fetch YouTube sources + popularity for each result (in parallel, max 20)
    const batch = videos.slice(0, 20);
    const details = await Promise.allSettled(
      batch.map(v =>
        imvdbFetch(`https://imvdb.com/api/v1/video/${v.id}?include=sources,popularity`, 5000)
          .then(r => r.ok ? r.json() : null)
      )
    );

    const results = [];
    for (let i = 0; i < batch.length; i++) {
      const detail = details[i].status === 'fulfilled' ? details[i].value : null;
      if (!detail) continue;

      const ytSource = (detail.sources || []).find(s => s.source === 'youtube');
      if (!ytSource?.source_data) continue;

      const artistName = (detail.artists || [])[0]?.name || '';
      const views = detail.popularity?.views_all_time || 0;
      results.push({
        videoId: ytSource.source_data,
        title: detail.song_title || batch[i].song_title || '',
        author: artistName,
        year: detail.year || batch[i].year || null,
        views,
        imvdbId: detail.id,
        durationText: '',
      });
    }

    // Sort by popularity (most views first)
    results.sort((a, b) => b.views - a.views);

    return res.status(200).json({
      results: results.slice(0, 16),
      total: searchData.total_results || 0,
      totalPages: searchData.total_pages || 1,
      page,
    });
  } catch (error) {
    console.error('IMVDb search error:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
}
