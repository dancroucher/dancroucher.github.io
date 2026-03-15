"use strict";

// ── Shared state (single source of truth) ──
// Exposed on window for React tapes bridge
const AppState = window.AppState = {
    singleVideo: false,
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

    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
        if (input.length <= 11) {
            return { id: input, type: "video" };
        }
        return { id: input, type: "playlist" };
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
        const loadingOverlay = document.getElementById("loading-overlay");
        if (loadingOverlay) loadingOverlay.classList.add("visible");

        const startContainer = document.getElementById("start-container");
        if (startContainer) startContainer.style.display = "none";

        document.getElementById("idEntry").value = videoID;

        setTimeout(() => {
            window.myApp.submitVideoNameFromSaved(videoID, trackIndex);
        }, 500);
        return true;
    }

    document.getElementById("start-container").style.display = "flex";
    document.getElementById("tapes-root").style.display = "flex";
    document.getElementById("tape-deck").style.display = "block";
    return false;
}

// ── YouTube Search ──
const Search = {
    _results: [],
    _searching: false,
    _dropdown: null,

    async doSearch(query) {
        if (!query || !query.trim() || this._searching) return;

        this._searching = true;
        this._renderDropdown();

        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
            this._results = await response.json();
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

        const form = document.getElementById("video-form");
        if (form && form.parentNode) {
            form.parentNode.insertBefore(this._dropdown, form.nextSibling);
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
            meta.textContent = `${result.author}  //  ${result.durationText}`;

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
