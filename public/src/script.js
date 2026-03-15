"use strict";

// ── Shared state (single source of truth) ──
const AppState = {
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

    // Try to parse as a URL
    let url;
    try {
        // Handle youtu.be and other short forms
        if (input.startsWith("http://") || input.startsWith("https://")) {
            url = new URL(input);
        }
    } catch (e) {
        // Not a valid URL, treat as raw ID below
    }

    if (url) {
        const hostname = url.hostname.replace("www.", "");

        // youtube.com/playlist?list=XXXX
        if (url.searchParams.has("list") && url.pathname.includes("/playlist")) {
            return { id: url.searchParams.get("list"), type: "playlist" };
        }

        // youtube.com/watch?v=XXXX (may also have &list=)
        // If it has both v= and list= with start_radio, treat as playlist mix
        if (url.searchParams.has("v")) {
            if (url.searchParams.has("list") && url.searchParams.has("start_radio")) {
                return { id: url.searchParams.get("list"), type: "playlist" };
            }
            return { id: url.searchParams.get("v"), type: "video" };
        }

        // youtu.be/XXXX
        if (hostname === "youtu.be" && url.pathname.length > 1) {
            return { id: url.pathname.slice(1).split("/")[0], type: "video" };
        }

        // youtube.com/live/XXXX
        if (url.pathname.startsWith("/live/")) {
            const liveId = url.pathname.replace("/live/", "").split("/")[0];
            return { id: liveId, type: "video" };
        }
    }

    // Raw ID fallback — determine type by character count
    // YouTube video IDs are 11 chars, playlist IDs are typically 24-34 chars
    if (/^[a-zA-Z0-9_-]+$/.test(input)) {
        if (input.length <= 11) {
            return { id: input, type: "video" };
        }
        return { id: input, type: "playlist" };
    }

    return null;
}

// ── YouTube validation via oEmbed ──
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
            return true;
        }

        videoBox.className = "videobox videobox-notok";
        videoBox.placeholder = `Invalid ${type} - please try again`;
        setTimeout(() => {
            videoBox.placeholder = "";
            videoBox.className = "videobox";
            videoBox.value = "";
        }, 1500);
        return false;
    } catch (error) {
        console.error("Validation error:", error);
        videoBox.className = "videobox videobox-notok";
        videoBox.placeholder = "Connection error - please try again";
        setTimeout(() => {
            videoBox.placeholder = "";
            videoBox.className = "videobox";
            videoBox.value = "";
        }, 1500);
        return false;
    }
}

// ── Submit handler ──
async function submitVideoName() {
    const input = document.getElementById("idEntry").value;
    const parsed = parseYouTubeInput(input);

    if (!parsed) return;

    const isValid = await validateYouTubeContent(parsed.id, parsed.type);
    if (!isValid) return;

    if (parsed.type === "video") {
        AppState.singleVideo = true;
        AppState.myVideoName = parsed.id;
    } else {
        AppState.singleVideo = false;
        AppState.myVideoPlaylistName = parsed.id;
    }

    setTimeout(() => {
        window.myApp.startApp();
    }, 100);
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

    document.getElementById("start-container").style.display = "block";
    return false;
}

// ── Form submit binding ──
document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("video-form");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            await submitVideoName();
        });
    }
});
