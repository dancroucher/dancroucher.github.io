"use strict";

// ── DOM refs (cached once) ──
const DOM = {
    songName: document.getElementById("song-name"),
    songAuthor: document.getElementById("song-author"),
    backgroundType: document.getElementById("background-type"),
    backgroundAuto: document.getElementById("background-auto"),
    mp4BackgroundA: document.getElementById("mp4-background-a"),
    mp4BackgroundB: document.getElementById("mp4-background-b"),
    songContainer: document.getElementById("song-container"),
    startContainer: document.getElementById("start-container"),
    titleContainer: document.getElementById("title-container"),
    bgMp4: document.getElementById("bg-mp4"),
    bgYoutube: document.getElementById("bg-youtube"),
    bgNone: document.getElementById("bg-none"),
    pauseOverlay: document.getElementById("pause-overlay"),
    loadingOverlay: document.getElementById("loading-overlay"),
    trackNumber: document.getElementById("track-number"),
    playlistPrev: document.getElementById("playlist-prev"),
    playlistNext: document.getElementById("playlist-next"),
    savedVideosContainer: document.getElementById("saved-videos-container"),
    info: document.getElementById("info"),
    popup: document.getElementById("myPopup"),
};

// ── Background management ──
const BG_TYPES = ["vintage", "anime", "video", "original", "none"];
const CHANGE_TIMES = [0, 30, 10]; // seconds (0 = off)

const Backgrounds = {
    video: [],
    anime: [],
    vintage: [],
    indices: { video: 0, anime: 0, vintage: 0 },
    bgTypeIndex: 0,
    changeTimeIndex: 0,
    _interval: null,
    _transitioning: false,

    // Dual-video crossfade state
    _activeEl: null,   // currently visible <video>
    _inactiveEl: null, // hidden <video>, used for preloading

    _initVideos() {
        this._activeEl = DOM.mp4BackgroundA;
        this._inactiveEl = DOM.mp4BackgroundB;
    },

    // Get the currently active background video element (for play/pause sync)
    getActiveVideo() {
        return this._activeEl;
    },

    async fetchList(folder) {
        try {
            const response = await fetch(`/api/list-files?folder=${folder}`);
            const text = await response.text();
            this[folder] = text.split(/\n|\r/g).filter((line) => line.trim() !== "");
        } catch (err) {
            console.error(`Failed to load ${folder} backgrounds:`, err);
        }
    },

    loadAll() {
        this._initVideos();
        this.fetchList("video");
        this.fetchList("anime");
        this.fetchList("vintage");
    },

    _folder() {
        return BG_TYPES[this.bgTypeIndex];
    },

    _isMediaType() {
        return this.bgTypeIndex <= 2;
    },

    // Build the src path for a given folder + index
    _srcFor(folder, index) {
        return `./${folder}/${this[folder][index]}`;
    },

    // Preload the next video into the inactive element so it's ready for instant crossfade
    _preloadNext() {
        if (!this._isMediaType()) return;
        const folder = this._folder();
        const list = this[folder];
        if (list.length < 2) return;

        const nextIndex = (this.indices[folder] + 1) % list.length;
        const nextSrc = this._srcFor(folder, nextIndex);

        // Only set src if it's different from what's already loaded
        if (this._inactiveEl.getAttribute("src") !== nextSrc) {
            this._inactiveEl.src = nextSrc;
            this._inactiveEl.load();
        }
    },

    // Crossfade: swap active/inactive videos with opacity transition
    _crossfade(newSrc, callback) {
        if (this._transitioning) return;
        this._transitioning = true;

        const incoming = this._inactiveEl;
        const outgoing = this._activeEl;

        // If the incoming video already has the right src (preloaded), skip loading
        const needsLoad = incoming.getAttribute("src") !== newSrc;

        const doSwap = () => {
            // Start playing the incoming video
            if (AppState.playing) incoming.play();

            // Fade in incoming, fade out outgoing
            incoming.classList.add("active");
            outgoing.classList.remove("active");

            // After transition completes, clean up
            setTimeout(() => {
                outgoing.pause();
                outgoing.removeAttribute("src");
                outgoing.load(); // release memory for old video

                // Swap references
                this._activeEl = incoming;
                this._inactiveEl = outgoing;
                this._transitioning = false;

                // Preload the next one
                this._preloadNext();

                if (callback) callback();
            }, 1300); // slightly longer than CSS transition (1.2s)
        };

        if (needsLoad) {
            incoming.src = newSrc;
            // Wait until enough data is buffered to play
            incoming.addEventListener("canplay", doSwap, { once: true });
            incoming.load();
        } else {
            doSwap();
        }
    },

    // Load a video directly into the active element (no crossfade, used for initial load)
    _loadDirect(src) {
        this._activeEl.src = src;
        this._activeEl.classList.add("active");
        this._activeEl.load();
        if (AppState.playing) this._activeEl.play();

        // Preload next
        setTimeout(() => this._preloadNext(), 500);
    },

    setType(index) {
        this.bgTypeIndex = index;
        const typeName = BG_TYPES[index];
        DOM.backgroundType.innerHTML = `<i class='fas fa-file-image'></i>&nbsp;${typeName}`;

        if (this._isMediaType()) {
            const folder = this._folder();
            const list = this[folder];
            if (list.length > 0) {
                this.indices[folder] = Math.floor(Math.random() * list.length);
                this._loadDirect(this._srcFor(folder, this.indices[folder]));
            }
            DOM.bgMp4.style.display = "block";
            DOM.bgNone.style.background = "#000000";
            DOM.bgYoutube.style.display = "block";
        } else if (index === 3) {
            this._clearVideos();
            DOM.bgMp4.style.display = "none";
            DOM.bgNone.style.background = "#00000000";
            DOM.bgYoutube.style.display = "block";
        } else {
            this._clearVideos();
            DOM.bgMp4.style.display = "none";
            DOM.bgNone.style.background = "#000000";
            DOM.bgYoutube.style.display = "block";
        }

        localStorage.setItem("backtype", index);

        if (!AppState.playing) {
            this._activeEl.pause();
        }
    },

    _clearVideos() {
        this._activeEl.classList.remove("active");
        this._activeEl.removeAttribute("src");
        this._activeEl.load();
        this._inactiveEl.removeAttribute("src");
        this._inactiveEl.load();
    },

    cycleType() {
        this.bgTypeIndex = (this.bgTypeIndex + 1) % BG_TYPES.length;
        this.setType(this.bgTypeIndex);
    },

    cycleNext() {
        if (!AppState.playing || !this._isMediaType() || this._transitioning) return;

        const folder = this._folder();
        const list = this[folder];
        if (list.length === 0) return;

        this.indices[folder] = (this.indices[folder] + 1) % list.length;
        this._crossfade(this._srcFor(folder, this.indices[folder]));
    },

    loadSavedType() {
        const saved = localStorage.getItem("backtype");
        this.bgTypeIndex = saved !== null ? parseInt(saved) : 0;
    },

    loadSavedChangeTime() {
        const saved = localStorage.getItem("changeTime");
        this.changeTimeIndex = saved !== null ? parseInt(saved) : 0;
    },

    cycleChangeTime() {
        this.changeTimeIndex = (this.changeTimeIndex + 1) % CHANGE_TIMES.length;
        this.applyChangeTime();
    },

    applyChangeTime() {
        if (this._interval) {
            clearInterval(this._interval);
            this._interval = null;
        }

        const seconds = CHANGE_TIMES[this.changeTimeIndex];

        if (seconds === 0) {
            DOM.backgroundAuto.innerHTML = "bg change: off";
        } else {
            DOM.backgroundAuto.innerHTML = `bg change: ${seconds}s`;
            this._interval = setInterval(() => {
                if (AppState.playing) this.cycleNext();
            }, seconds * 1000);
        }

        localStorage.setItem("changeTime", this.changeTimeIndex);
    },
};

// ── Video history (localStorage) ──
const History = {
    _key: "userVideoHistory",

    _load() {
        return JSON.parse(localStorage.getItem(this._key)) || [];
    },

    _save(list) {
        localStorage.setItem(this._key, JSON.stringify(list));
    },

    add(videoID, videoName, videoAuthor, videoType, trackIndex = 0, progress = 0) {
        // Don't save entries with no metadata
        if (!videoName && !videoAuthor) return;

        const savedVideos = this._load();
        const existingIndex = savedVideos.findIndex((v) => v.id === videoID);

        if (existingIndex !== -1) {
            savedVideos[existingIndex].track = trackIndex;
            savedVideos[existingIndex].timestamp = Date.now();
            // Only update name/author if we have real values (don't overwrite with empty)
            if (videoName) savedVideos[existingIndex].name = videoName;
            if (videoAuthor) savedVideos[existingIndex].author = videoAuthor;
            if (progress > 0) savedVideos[existingIndex].progress = progress;
            const item = savedVideos.splice(existingIndex, 1)[0];
            savedVideos.unshift(item);
        } else {
            savedVideos.unshift({
                id: videoID,
                name: videoName,
                author: videoAuthor,
                type: videoType,
                track: trackIndex,
                progress: progress,
                timestamp: Date.now(),
            });
            if (savedVideos.length > 50) savedVideos.pop();
        }

        this._save(savedVideos);
    },

    remove(videoID) {
        const savedVideos = this._load().filter((v) => v.id !== videoID);
        this._save(savedVideos);
        this.renderUI();
    },

    renderUI() {
        const savedVideos = this._load();
        DOM.savedVideosContainer.innerHTML = "";

        savedVideos.forEach((video) => {
            const row = document.createElement("div");
            row.className = "history-row";

            const btn = document.createElement("button");
            const shareBtn = document.createElement("button");
            const removeBtn = document.createElement("button");

            const trackInfo =
                video.type !== "single" && video.track !== undefined
                    ? ` // Playlist // Track ${video.track + 1}`
                    : " // Single video";

            const progressPct = Math.round((video.progress || 0) * 100);

            const icon = video.type === "single" ? "fa-file-video-o" : "fa-list-alt";
            btn.className = `history-item${video.type !== "single" ? " playlist" : ""}`;
            btn.innerHTML = `<i class="fa ${icon}" aria-hidden="true"></i> ${video.name} // ${video.author}${trackInfo}`;

            // Progress bar
            if (video.progress && video.progress > 0.01) {
                const progressBar = document.createElement("div");
                progressBar.className = "history-progress";
                const progressFill = document.createElement("div");
                progressFill.className = "history-progress-fill";
                progressFill.style.width = `${progressPct}%`;
                progressBar.appendChild(progressFill);
                btn.appendChild(progressBar);
            }

            shareBtn.className = "history-share";
            shareBtn.innerHTML = '<i class="fa fa-clipboard" aria-hidden="true"></i>';
            shareBtn.title = "Share this video";

            removeBtn.className = "history-remove";
            removeBtn.innerHTML = '<i class="fa fa-trash" aria-hidden="true"></i>';

            btn.onclick = () => {
                if (window.myApp) {
                    window.myApp.submitVideoNameFromSaved(video.id, video.track || 0);
                }
            };

            shareBtn.onclick = (e) => {
                e.stopPropagation();
                const shareURL = createShareableURL(video.id, video.track || 0);

                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(shareURL).then(() => {
                        const originalHTML = shareBtn.innerHTML;
                        shareBtn.innerHTML = '<i class="fa fa-check" aria-hidden="true"></i>';
                        shareBtn.style.color = "#00ff00";
                        setTimeout(() => {
                            shareBtn.innerHTML = originalHTML;
                            shareBtn.style.color = "";
                        }, 2000);
                    }).catch(() => {
                        prompt("Copy this link:", shareURL);
                    });
                } else {
                    prompt("Copy this link:", shareURL);
                }
            };

            removeBtn.onclick = (e) => {
                e.stopPropagation();
                History.remove(video.id);
            };

            DOM.savedVideosContainer.appendChild(row);
            row.appendChild(btn);
            btn.appendChild(shareBtn);
            btn.appendChild(removeBtn);
        });
    },
};

// ── UI helpers ──
let fullscreenActive = false;

function doStart() {
    AppState.starting = false;
    AppState.playing = true;
    DOM.startContainer.style.display = "none";
    DOM.songContainer.style.display = "block";
    DOM.bgYoutube.style.display = "block";

    if (AppState.singleVideo) {
        DOM.playlistPrev.style.display = "none";
        DOM.trackNumber.style.display = "none";
        DOM.playlistNext.style.display = "none";
    }

    Inactivity.init();
    Backgrounds.loadSavedType();
    Backgrounds.setType(Backgrounds.bgTypeIndex);
    Backgrounds.loadSavedChangeTime();
    Backgrounds.applyChangeTime();
    // Metadata save handled by video_data_change event in demo.js — no setTimeout race
}

function doFullscreen() {
    const elem = document.documentElement;
    if (!fullscreenActive) {
        (elem.requestFullscreen || elem.webkitRequestFullscreen || elem.msRequestFullscreen).call(elem);
        fullscreenActive = true;
    } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen).call(document);
        fullscreenActive = false;
    }
}

function doPopup() {
    DOM.popup.classList.toggle("show");
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? "0" : ""}${sec}`;
}

// ── Inactivity fade ──
const Inactivity = {
    _timer: null,
    _visible: true,
    DELAY: 5000,

    init() {
        DOM.songContainer.style.transition = "opacity 1s ease";
        this.reset();

        const events = ["mousemove", "mousedown", "keydown", "touchstart", "touchmove", "scroll"];
        events.forEach((evt) => document.addEventListener(evt, () => this.reset()));
    },

    reset() {
        this._show();
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._hide(), this.DELAY);
    },

    _hide() {
        if (DOM.songContainer && this._visible && AppState.playing) {
            DOM.songContainer.style.opacity = "0";
            this._visible = false;
            document.body.style.cursor = "none";
        }
    },

    _show() {
        if (DOM.songContainer && !this._visible) {
            DOM.songContainer.style.opacity = "1";
            this._visible = true;
            document.body.style.cursor = "default";
        }
    },
};

// ── Keyboard controls ──
window.addEventListener("keydown", (event) => {
    if (event.target.tagName === "INPUT" || event.target.tagName === "TEXTAREA") return;

    switch (event.key.toLowerCase()) {
        case " ":
            event.preventDefault();
            if (window.myApp) window.myApp.togglePlayback();
            break;
        case "arrowright":
            if (!AppState.singleVideo && window.myApp) window.myApp.doPlaylistNext();
            break;
        case "arrowleft":
            if (!AppState.singleVideo && window.myApp) window.myApp.doPlaylistPrevious();
            break;
        case "x":
            Backgrounds.cycleType();
            break;
        case "i":
            doPopup();
            break;
        case "f":
            doFullscreen();
            break;
    }
});

// ── Click handlers for UI buttons ──
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("background-type")?.addEventListener("click", () => Backgrounds.cycleType());
    document.getElementById("background-auto")?.addEventListener("click", () => Backgrounds.cycleChangeTime());
    document.getElementById("fullscreen-btn")?.addEventListener("click", doFullscreen);
    document.getElementById("info-btn")?.addEventListener("click", doPopup);
    DOM.playlistPrev.addEventListener("click", () => { if (window.myApp) window.myApp.doPlaylistPrevious(); });
    DOM.playlistNext.addEventListener("click", () => { if (window.myApp) window.myApp.doPlaylistNext(); });
    DOM.bgMp4.addEventListener("click", () => { if (window.myApp) window.myApp.togglePlayback(); });
    DOM.bgMp4.addEventListener("dblclick", doFullscreen);
    DOM.bgNone.addEventListener("click", () => { if (window.myApp) window.myApp.togglePlayback(); });
});

// ── Init on load ──
window.onload = function () {
    if (typeof Youtube !== "undefined") {
        window.myApp = new Demo();
    } else {
        console.warn("YouTube library not loaded yet");
    }

    DOM.info.innerHTML = document.lastModified;
    History.renderUI();
    AppState.playing = false;
    Backgrounds.loadAll();

    setTimeout(() => {
        checkAndLoadFromURL();
    }, 100);
};
