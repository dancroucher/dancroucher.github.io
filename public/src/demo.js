"use strict";

var Demo = (function () {
    // All player events we listen to
    const PLAYER_EVENTS = [
        "ready", "yt_state_change", "yt_playback_quality_change",
        "yt_playback_rate_change", "yt_api_change", "yt_error",
        "state_change", "volume_change", "time_change", "duration_change",
        "progress", "playback_quality_change", "playback_rate_change",
        "playback_qualities_available_change", "playback_rates_available_change",
        "playlist_change", "playlist_index_change", "api_change",
    ];

    // Default player config
    function playerConfig(videoId) {
        return {
            video_id: videoId || "",
            params: {
                autoplay: 0,
                controls: 0,
                loop: 1,
                mute: 0,
                disablekb: 1,
                rel: 0,
                fs: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                enablejsapi: 1,
                origin: window.location.origin,
            },
            on: {},
        };
    }

    function Demo() {
        const Player = Youtube.Player;
        this.player = new Player(playerConfig(""));
        this._iframeContainer = document.querySelector(".bg-youtube");

        this._attachIframe();
        this._attachEventListeners();
        this.init_date = new Date();
    }

    Demo.prototype = {
        constructor: Demo,

        // ── Iframe management ──
        _attachIframe: function () {
            const iframe = this.player.get_iframe();
            iframe.className = "demo_iframe";
            iframe.id = "demo_iframe";
            iframe.setAttribute("allow", "autoplay; encrypted-media; clipboard-write; microphone; fullscreen");
            this._iframeContainer.appendChild(iframe);
        },

        // ── Event listener management ──
        _attachEventListeners: function () {
            PLAYER_EVENTS.forEach((evt) => {
                this.player.on(evt, () => {});
            });

            this.player.on("playlist_change", () => this._onPlaylistChange());
            this.player.on("playlist_index_change", () => this._onPlaylistIndexChange());
            this.player.on("video_data_change", () => this._onVideoDataChange());
        },

        _attachPlayingListeners: function () {
            this.player.on("state_change", () => {
                const data = this.player.get_video_data();
                AppState.songTitle = data.title;
                AppState.songAuthor = data.author;

                const videoId = AppState.singleVideo ? AppState.myVideoName : data.video_id;
                DOM.songName.innerHTML = `<a href='https://www.youtube.com/watch?v=${videoId}' target='_blank'>${data.title}</a>`;
                DOM.songAuthor.innerHTML = data.author;

                // Update track number for playlists
                const playlist = this.player.get_playlist();
                if (playlist) {
                    AppState.playlistIndex = this.player.get_playlist_index();
                    DOM.trackNumber.innerHTML = `${AppState.playlistIndex + 1}&nbsp;/&nbsp;${playlist.length}`;
                }

                // Sync pause overlay
                const state = this.player.get_player_state();
                if (state === 2) {
                    this._showOverlay("pause-overlay");
                } else {
                    this._hideOverlay("pause-overlay");
                }
            });
        },

        // ── Overlays ──
        _showOverlay: function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.add("visible");
        },

        _hideOverlay: function (id) {
            const el = document.getElementById(id);
            if (el) el.classList.remove("visible");
        },

        // ── Playback controls ──
        togglePlayback: function () {
            const state = this.player.get_player_state();
            const bgVideo = Backgrounds.getActiveVideo();
            if (state === 2) {
                // Paused → Play
                this.player.play();
                if (Backgrounds._isMediaType() && bgVideo) bgVideo.play();
                AppState.playing = true;
                this._hideOverlay("pause-overlay");
            } else if (state === 1) {
                // Playing → Pause
                this.player.pause();
                if (Backgrounds._isMediaType() && bgVideo) bgVideo.pause();
                AppState.playing = false;
                this._showOverlay("pause-overlay");
            }
        },

        doPlaylistPrevious: function () {
            this.player.goto_previous();
        },

        doPlaylistNext: function () {
            this.player.goto_next();
        },

        // ── Start app (destroy muted player, create unmuted one) ──
        startApp: function (trackIndex = 0) {
            this._showOverlay("loading-overlay");
            DOM.startContainer.style.display = "none";

            if (!this.player || !AppState.starting) return;

            // Destroy old player
            this.player.destroy();

            // Create new unmuted player
            const config = playerConfig(AppState.singleVideo ? AppState.myVideoName : "");
            config.params.autoplay = 1;
            this.player = new Youtube.Player(config);

            // Attach iframe
            this._attachIframe();
            this.player.get_iframe().setAttribute(
                "sandbox",
                "allow-forms allow-scripts allow-same-origin allow-presentation allow-popups"
            );

            // Attach listeners
            this._attachEventListeners();
            this._attachPlayingListeners();

            // On ready → load content
            this.player.on("ready", () => {
                if (AppState.singleVideo) {
                    this.player.load_video(AppState.myVideoName, true);
                    History.add(AppState.myVideoName, AppState.songTitle, AppState.songAuthor, "single", 0);
                } else {
                    this.player.load_playlist(AppState.myVideoPlaylistName, "playlist", trackIndex, true);
                    History.add(AppState.myVideoPlaylistName, AppState.songTitle, AppState.songAuthor, "playlist", AppState.playlistIndex);
                }

                this.player.set_volume(100);
                doStart();

                setTimeout(() => this._hideOverlay("loading-overlay"), 1000);
            });
        },

        // ── Load from saved history ──
        submitVideoNameFromSaved: function (videoName, trackIndex = 0) {
            if (!videoName || videoName.length === 0) return;

            const parsed = parseYouTubeInput(videoName);
            if (!parsed) return;

            if (parsed.type === "video") {
                AppState.myVideoName = parsed.id;
                AppState.singleVideo = true;
                const newURL = createShareableURL(parsed.id, 0);
                window.history.pushState({}, "", newURL);
            } else {
                AppState.myVideoPlaylistName = parsed.id;
                AppState.singleVideo = false;
                const newURL = createShareableURL(parsed.id, trackIndex);
                window.history.pushState({}, "", newURL);
            }

            setTimeout(() => this.startApp(trackIndex), 100);
        },

        // ── Playlist event handlers ──
        _onPlaylistChange: function () {
            const playlist = this.player.get_playlist();
            if (!playlist) return;
            this._onPlaylistIndexChange();
        },

        _onPlaylistIndexChange: function () {
            const currentIndex = this.player.get_playlist_index() || 0;
            AppState.playlistIndex = currentIndex;
            if (AppState.myVideoPlaylistName) {
                History.add(AppState.myVideoPlaylistName, AppState.songTitle, AppState.songAuthor, "playlist", currentIndex);
            }
        },

        _onVideoDataChange: function () {
            // Update metadata display when video data changes
            const data = this.player.get_video_data();
            if (data && data.title) {
                AppState.songTitle = data.title;
                AppState.songAuthor = data.author;
            }
        },
    };

    return Demo;
})();
