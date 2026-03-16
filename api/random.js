// Random music video discovery via IMVDb
// Returns a YouTube video ID for a random music video

const ARTISTS_80s = [
  'Madonna', 'Michael Jackson', 'Prince', 'Duran Duran', 'A-ha', 'Tears for Fears',
  'Depeche Mode', 'The Cure', 'New Order', 'Pet Shop Boys', 'Talking Heads',
  'Blondie', 'Cyndi Lauper', 'Pat Benatar', 'Bon Jovi', 'Def Leppard',
  'Van Halen', 'Guns N Roses', 'Motley Crue', 'Whitesnake', 'Heart',
  'Whitney Houston', 'Janet Jackson', 'Paula Abdul', 'Belinda Carlisle',
  'Eurythmics', 'The Human League', 'Soft Cell', 'Yazoo', 'OMD',
  'Gary Numan', 'Kraftwerk', 'Devo', 'The B-52s', 'INXS',
  'Simple Minds', 'The Smiths', 'Echo and the Bunnymen', 'Siouxsie and the Banshees',
  'Kate Bush', 'Peter Gabriel', 'Phil Collins', 'Genesis', 'Yes',
  'Dire Straits', 'U2', 'R.E.M.', 'The Police', 'Billy Idol',
  'David Bowie', 'Robert Palmer', 'Hall and Oates', 'Huey Lewis',
  'Run DMC', 'Beastie Boys', 'LL Cool J', 'Salt-N-Pepa', 'Eric B and Rakim',
];

const ARTISTS_90s = [
  'Nirvana', 'Pearl Jam', 'Soundgarden', 'Alice in Chains', 'Stone Temple Pilots',
  'Radiohead', 'Oasis', 'Blur', 'Pulp', 'The Verve', 'Suede',
  'Weezer', 'Green Day', 'The Offspring', 'Blink 182', 'No Doubt',
  'Garbage', 'Hole', 'The Cranberries', 'Alanis Morissette', 'Fiona Apple',
  'Björk', 'Portishead', 'Massive Attack', 'Tricky', 'The Prodigy',
  'The Chemical Brothers', 'Fatboy Slim', 'Underworld', 'Orbital',
  'Aphex Twin', 'Jamiroquai', 'Beck', 'Moby', 'Nine Inch Nails',
  'Marilyn Manson', 'Tool', 'Rage Against the Machine', 'Smashing Pumpkins',
  'Red Hot Chili Peppers', 'Foo Fighters', 'Bush', 'Silverchair',
  'TLC', 'Destiny\'s Child', 'Lauryn Hill', 'Erykah Badu', 'Missy Elliott',
  'Wu-Tang Clan', 'Nas', 'Notorious B.I.G.', 'Tupac', 'OutKast', 'A Tribe Called Quest',
  'Spice Girls', 'Backstreet Boys', 'NSYNC', 'Britney Spears',
  'R. Kelly', 'Usher', 'Aaliyah', 'Brandy', 'Monica',
];

const ALL_ARTISTS = [...ARTISTS_80s, ...ARTISTS_90s];

export default async function handler(req, res) {
  try {
    // Pick a random artist
    const artist = ALL_ARTISTS[Math.floor(Math.random() * ALL_ARTISTS.length)];

    // Search IMVDb for their music videos
    const searchRes = await fetch(
      `https://imvdb.com/api/v1/search/videos?q=${encodeURIComponent(artist)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!searchRes.ok) throw new Error(`IMVDb search failed: ${searchRes.status}`);
    const searchData = await searchRes.json();

    const videos = searchData.results || [];
    if (videos.length === 0) {
      return res.status(200).json({ error: 'No videos found', artist });
    }

    // Pick a random video from results
    const pick = videos[Math.floor(Math.random() * videos.length)];

    // Fetch full video details with YouTube source
    const detailRes = await fetch(
      `https://imvdb.com/api/v1/video/${pick.id}?include=sources`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!detailRes.ok) throw new Error(`IMVDb detail failed: ${detailRes.status}`);
    const detail = await detailRes.json();

    // Find YouTube source
    const ytSource = (detail.sources || []).find(s => s.source === 'youtube');
    if (!ytSource || !ytSource.source_data) {
      // No YouTube source — try another video from the same results
      for (const fallback of videos) {
        if (fallback.id === pick.id) continue;
        const fbRes = await fetch(
          `https://imvdb.com/api/v1/video/${fallback.id}?include=sources`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!fbRes.ok) continue;
        const fbDetail = await fbRes.json();
        const fbYt = (fbDetail.sources || []).find(s => s.source === 'youtube');
        if (fbYt?.source_data) {
          return res.status(200).json({
            videoId: fbYt.source_data,
            title: fbDetail.song_title || '',
            artist: (fbDetail.artists || [])[0]?.name || artist,
            year: fbDetail.year || null,
            imvdbUrl: fbDetail.url || '',
          });
        }
      }
      return res.status(200).json({ error: 'No YouTube source found', artist });
    }

    return res.status(200).json({
      videoId: ytSource.source_data,
      title: detail.song_title || '',
      artist: (detail.artists || [])[0]?.name || artist,
      year: detail.year || null,
      imvdbUrl: detail.url || '',
    });
  } catch (error) {
    console.error('Random video error:', error);
    return res.status(500).json({ error: 'Failed to find random video' });
  }
}
