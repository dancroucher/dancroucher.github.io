"use strict";

// ── Shared state (single source of truth) ──
// Exposed on window for React tapes bridge
const AppState = window.AppState = {
    singleVideo: false,
    infiniteTape: false,
    myVideoName: null,
    myVideoPlaylistName: null,
    songTitle: null,
    songAuthor: null,
    playlistIndex: 0,
    videoNameClean: null,
    playing: false,
    starting: true,
    playerReady: false,
};

// ── URL helpers ──
function getURLParameter(name) {
    return new URLSearchParams(window.location.search).get(name);
}

function createShareableURL(videoID, trackIndex = 0) {
    const baseURL = window.location.origin + window.location.pathname;
    return `${baseURL}?v=${videoID}&t=${trackIndex}`;
}

// ── YouTube URL parser (robust, uses URL API) ──
function parseYouTubeInput(input) {
    if (!input || !input.trim()) return null;
    input = input.trim();

    let url;
    try {
        if (input.startsWith("http://") || input.startsWith("https://")) {
            url = new URL(input);
        }
    } catch (e) {}

    if (url) {
        const hostname = url.hostname.replace("www.", "");

        if (url.searchParams.has("list") && url.pathname.includes("/playlist")) {
            return { id: url.searchParams.get("list"), type: "playlist" };
        }

        if (url.searchParams.has("v")) {
            if (url.searchParams.has("list") && url.searchParams.has("start_radio")) {
                return { id: url.searchParams.get("list"), type: "playlist" };
            }
            return { id: url.searchParams.get("v"), type: "video" };
        }

        if (hostname === "youtu.be" && url.pathname.length > 1) {
            return { id: url.pathname.slice(1).split("/")[0], type: "video" };
        }

        if (url.pathname.startsWith("/live/")) {
            const liveId = url.pathname.replace("/live/", "").split("/")[0];
            return { id: liveId, type: "video" };
        }
    }

    // Bare YouTube video ID (exactly 11 chars) or playlist ID (starts with PL/UU/RD/OL)
    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
        if (input.length === 11) {
            return { id: input, type: "video" };
        }
        if (input.length > 11 && /^(PL|UU|RD|OL|FL)/.test(input)) {
            return { id: input, type: "playlist" };
        }
    }

    return null;
}

// ── YouTube validation + metadata fetch via oEmbed ──
// Returns { valid, title, author } so we can save metadata at add-time
async function validateYouTubeContent(id, type) {
    const videoBox = document.getElementById("idEntry");
    videoBox.className = "videobox";

    const endpoint =
        type === "playlist"
            ? `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${id}&format=json`
            : `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;

    try {
        const response = await fetch(endpoint);
        if (response.ok) {
            videoBox.className = "videobox videobox-ok";
            const data = await response.json();
            return {
                valid: true,
                title: data.title || "",
                author: data.author_name || "",
            };
        }

        videoBox.className = "videobox videobox-notok";
        videoBox.placeholder = `Invalid ${type} - please try again`;
        setTimeout(() => {
            videoBox.placeholder = "";
            videoBox.className = "videobox";
            videoBox.value = "";
        }, 1500);
        return { valid: false };
    } catch (error) {
        console.error("Validation error:", error);
        videoBox.className = "videobox videobox-notok";
        videoBox.placeholder = "Connection error - please try again";
        setTimeout(() => {
            videoBox.placeholder = "";
            videoBox.className = "videobox";
            videoBox.value = "";
        }, 1500);
        return { valid: false };
    }
}

// ── Submit handler ──
async function submitVideoName() {
    const input = document.getElementById("idEntry").value;
    const parsed = parseYouTubeInput(input);

    if (!parsed) return;

    const result = await validateYouTubeContent(parsed.id, parsed.type);
    if (!result.valid) return;

    // Set metadata from oEmbed BEFORE starting player
    if (parsed.type === "video") {
        AppState.singleVideo = true;
        AppState.myVideoName = parsed.id;
        AppState.songTitle = result.title;
        AppState.songAuthor = result.author;
    } else {
        AppState.singleVideo = false;
        AppState.myVideoPlaylistName = parsed.id;
        AppState.songTitle = result.title;
        AppState.songAuthor = result.author;
    }

    // Save to history immediately with confirmed metadata
    const videoID = AppState.singleVideo ? AppState.myVideoName : AppState.myVideoPlaylistName;
    const videoType = AppState.singleVideo ? "single" : "playlist";
    History.add(videoID, result.title, result.author, videoType, 0);

    // Create a tape in the React tapes table
    if (window.TapesBridge) {
        const isPlaylist = parsed.type === "playlist";
        window.TapesBridge.addTapeFromSearch(
            isPlaylist ? "" : parsed.id,
            result.title,
            result.author,
            isPlaylist,
            isPlaylist ? parsed.id : undefined
        );
    }

    Search.close();
    document.getElementById("idEntry").value = "";
}

// ── Auto-load from URL params ──
function checkAndLoadFromURL() {
    const videoID = getURLParameter("v");
    const trackIndex = parseInt(getURLParameter("t")) || 0;

    if (videoID) {
        const parsed = parseYouTubeInput(videoID);
        if (parsed) {
            const isPlaylist = parsed.type === "playlist";
            const id = parsed.id;
            const endpoint = isPlaylist
                ? `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${id}&format=json`
                : `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;

            fetch(endpoint)
                .then(r => r.ok ? r.json() : null)
                .then(data => {
                    if (data && window.TapesBridge) {
                        window.TapesBridge.addTapeFromSearch(
                            isPlaylist ? "" : id,
                            data.title || "",
                            data.author_name || "",
                            isPlaylist,
                            isPlaylist ? id : undefined
                        );
                    }
                })
                .catch(() => {});
        }

        // Show start screen with tapes — don't auto-play
        document.getElementById("start-container").style.display = "flex";
        document.getElementById("tapes-root").style.display = "flex";
        document.querySelector(".crt")?.classList.add("tapes-active");
        return true;
    }

    document.getElementById("start-container").style.display = "flex";
    document.getElementById("tapes-root").style.display = "flex";
    document.querySelector(".crt")?.classList.add("tapes-active");
    return false;
}

// ── Music Video Search ──
const Search = {
    _results: [],
    _searching: false,
    _dropdown: null,

    _getSource() {
        return 'youtube';
    },

    async doSearch(query) {
        if (!query || !query.trim() || this._searching) return;

        this._searching = true;
        this._renderDropdown();

        try {
            const source = this._getSource();
            const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
            this._results = await res.json();
        } catch (err) {
            console.error("Search failed:", err);
            this._results = [];
        }

        this._searching = false;
        this._renderDropdown();
    },

    close() {
        this._results = [];
        this._searching = false;
        if (this._dropdown) {
            this._dropdown.style.display = "none";
        }
    },

    _ensureDropdown() {
        if (this._dropdown) return;

        this._dropdown = document.createElement("div");
        this._dropdown.className = "search-dropdown";
        this._dropdown.style.display = "none";

        // Insert directly inside the make-tape search container (so width +
        // position track the search bar). Falls back to the legacy spot
        // beside .start-form for safety.
        const searchEl = document.getElementById("single-tape-search");
        if (searchEl) {
            searchEl.appendChild(this._dropdown);
            return;
        }
        const startForm = document.querySelector(".start-form");
        if (startForm && startForm.parentNode) {
            startForm.parentNode.insertBefore(this._dropdown, startForm.nextSibling);
        }
    },

    _renderDropdown() {
        this._ensureDropdown();
        this._dropdown.innerHTML = "";
        this._dropdown.style.display = "block";

        if (this._searching) {
            const msg = document.createElement("div");
            msg.className = "search-message";
            msg.innerHTML = '<i class="fas fa-spinner fa-spin"></i>&nbsp;Searching...';
            this._dropdown.appendChild(msg);
            return;
        }

        if (this._results.length === 0) {
            const msg = document.createElement("div");
            msg.className = "search-message";
            msg.textContent = "No results";
            this._dropdown.appendChild(msg);
            return;
        }

        this._results.forEach((result) => {
            const item = document.createElement("button");
            item.className = "search-result";

            const title = document.createElement("div");
            title.className = "search-result-title";
            title.textContent = result.title;

            const meta = document.createElement("div");
            meta.className = "search-result-meta";
            const parts = [result.author];
            if (result.year) parts.push(result.year);
            if (result.durationText) parts.push(result.durationText);
            meta.textContent = parts.filter(Boolean).join('  //  ');

            item.appendChild(title);
            item.appendChild(meta);

            item.addEventListener("click", () => {
                document.getElementById("idEntry").value = result.videoId;
                this.close();
                submitVideoName();
            });

            this._dropdown.appendChild(item);
        });
    },
};

// ── Lucky pick buttons (single video + mixtape) ──
const LuckyPicks = {
    init() {
        const mixtapeBtn = document.getElementById("mixtape-btn");
        if (mixtapeBtn) mixtapeBtn.addEventListener("click", () => {
          const searchInput = document.getElementById('idEntry');
          const keywords = searchInput ? searchInput.value.trim() : '';
          if (!keywords) return;
          window.dispatchEvent(new CustomEvent('jeem-create-mixtape', { detail: { keywords } }));
        });

        const videoBtn = document.getElementById("lucky-video-btn");
        if (videoBtn) videoBtn.addEventListener("click", () => this._luckyVideo(videoBtn));

        const mixBtn = document.getElementById("lucky-mixtape-btn");
        if (mixBtn) mixBtn.addEventListener("click", () => this._luckyMixtape(mixBtn));
    },

    _setLoading(btn, loading) {
        if (!btn) return;
        if (loading) {
            btn.dataset.originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            btn.disabled = true;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.6';
        } else {
            if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
            btn.disabled = false;
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    },

    async _luckyVideo(btn) {
        this._setLoading(btn, true);
        try {
            const res = await fetch('/api/random');
            const data = await res.json();
            if (data && data.videoId && window.TapesBridge) {
                const song = data.title || '';
                const artist = data.artist || '';
                // Use the full combined "Artist - Title" as the tape label
                const fullTitle = artist && song ? `${artist} - ${song}` : (song || artist || 'Untitled');
                window.TapesBridge.addTapeFromSearch(data.videoId, fullTitle, artist, false);
            } else {
                console.warn('Lucky video: no result', data);
            }
        } catch (e) {
            console.warn('Lucky video failed', e);
        } finally {
            this._setLoading(btn, false);
        }
    },

    async _luckyMixtape(btn) {
        const queries = this._luckyQueries;
        const pick = queries[Math.floor(Math.random() * queries.length)];
        this._setLoading(btn, true);
        try {
            const res = await fetch('/api/mixtape/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: '', keywords: pick }),
            });
            const data = await res.json();
            if (data && data.tracks && data.tracks.length && window.TapesBridge) {
                const label = pick.charAt(0).toUpperCase() + pick.slice(1);
                const name = `🎲 ${label}`;
                window.TapesBridge.addMixtapeTape(name, data.tracks.map(t => ({
                    videoId: t.videoId, title: t.title, author: t.author,
                })));
            } else {
                console.warn('Lucky mixtape: no tracks', data);
            }
        } catch (e) {
            console.warn('Lucky mixtape failed', e);
        } finally {
            this._setLoading(btn, false);
        }
    },

    _luckyQueries: [
        '80s music videos', '90s music videos', '70s music videos',
        '2000s music videos', '60s music videos', '2010s music videos',
        'rock music videos', 'pop music videos', 'jazz music',
        'soul music', 'funk music', 'disco music',
        'punk rock', 'new wave music', 'synthwave',
        'indie rock', 'alternative rock', 'grunge music',
        'hip hop music videos', 'r&b music', 'reggae music',
        'electronic music', 'house music', 'techno music',
        'classical music', 'blues music', 'country music',
        'metal music', 'folk music', 'ambient music',
        'chill music', 'driving music', 'summer music',
        'feel good music', 'late night music',
        'classic rock', 'one hit wonders',
        'motown', 'brit pop', 'post punk',
        'shoegaze', 'dream pop', 'lo-fi music',
    ],

};

// ── Form submit binding ──
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("video-form");
    const input = document.getElementById("idEntry");

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const value = input.value.trim();
            if (!value) return;

            const parsed = parseYouTubeInput(value);
            if (parsed) {
                await submitVideoName();
            } else {
                Search.doSearch(value);
            }
        });
    }

    LuckyPicks.init();

    // New primary entry points: "make a single tape" / "make a mixtape".
    const createTapeBtn = document.getElementById("create-tape-btn");
    if (createTapeBtn) {
        createTapeBtn.addEventListener("click", () => {
            window.dispatchEvent(new CustomEvent('jeem-create-pending-tape'));
        });
    }
    // Mixtape button is intentionally disabled for now.

    // Grey out mixtape button when search bar is empty
    const mixtapeBtn = document.getElementById("mixtape-btn");
    function updateMixtapeBtnState() {
        if (!mixtapeBtn) return;
        const hasText = input && input.value.trim().length > 0;
        mixtapeBtn.style.opacity = hasText ? '1' : '0.35';
        mixtapeBtn.style.pointerEvents = hasText ? '' : 'none';
    }
    if (input) {
        input.addEventListener("input", updateMixtapeBtnState);
    }
    updateMixtapeBtnState();

    if (input) {
        input.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                Search.close();
            }
        });

        document.addEventListener("click", (e) => {
            if (Search._dropdown && !Search._dropdown.contains(e.target) && e.target !== input) {
                Search.close();
            }
        });
    }

});
