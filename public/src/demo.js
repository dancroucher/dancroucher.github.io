"use strict";

var Demo = (function () {
    const PLAYER_EVENTS = [
        "ready", "yt_state_change", "yt_playback_quality_change",
        "yt_playback_rate_change", "yt_api_change", "yt_error",
        "state_change", "volume_change", "time_change", "duration_change",
        "progress", "playback_quality_change", "playback_rate_change",
        "playback_qualities_available_change", "playback_rates_available_change",
        "playlist_change", "playlist_index_change", "api_change",
    ];

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
        this._progressInterval = null;

        this._attachIframe();
        this._attachEventListeners();
        this.init_date = new Date();
    }

    Demo.prototype = {
        constructor: Demo,

        _attachIframe: function () {
            const iframe = this.player.get_iframe();
            iframe.className = "demo_iframe";
            iframe.id = "demo_iframe";
            iframe.setAttribute("allow", "autoplay; encrypted-media; clipboard-write; microphone; fullscreen");
            this._iframeContainer.appendChild(iframe);
        },

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
                if (!data || !data.title) return;

                AppState.songTitle = data.title;
                AppState.songAuthor = data.author;

                const videoId = AppState.singleVideo ? AppState.myVideoName : data.video_id;
                DOM.songName.innerHTML = `<a href='https://www.youtube.com/watch?v=${videoId}' target='_blank'>${data.title}</a>`;
                DOM.songAuthor.innerHTML = data.author;

                const playlist = this.player.get_playlist();
                if (playlist) {
                    AppState.playlistIndex = this.player.get_playlist_index();
                    DOM.trackNumber.innerHTML = `${AppState.playlistIndex + 1}&nbsp;/&nbsp;${playlist.length}`;
                }

                const state = this.player.get_player_state();
                if (state === 2) {
                    this._showOverlay("pause-overlay");
                } else {
                    this._hideOverlay("pause-overlay");
                }
            });
        },

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
                this.player.play();
                if (Backgrounds._isMediaType() && bgVideo) bgVideo.play();
                AppState.playing = true;
                this._hideOverlay("pause-overlay");
            } else if (state === 1) {
                this.player.pause();
                if (Backgrounds._isMediaType() && bgVideo) bgVideo.pause();
                AppState.playing = false;
                this._showOverlay("pause-overlay");
                // Save progress on pause
                this._saveProgress();
            }
        },

        doPlaylistPrevious: function () {
            this.player.goto_previous();
        },

        doPlaylistNext: function () {
            this.player.goto_next();
        },

        // ── Progress tracking ──
        _getProgress: function () {
            const current = this.player.get_current_time();
            const duration = this.player.get_duration();
            if (!duration || duration <= 0) return 0;
            return Math.min(current / duration, 1);
        },

        _saveProgress: function () {
            const videoID = AppState.singleVideo ? AppState.myVideoName : AppState.myVideoPlaylistName;
            if (!videoID || !AppState.songTitle) return;

            const videoType = AppState.singleVideo ? "single" : "playlist";
            const trackIndex = AppState.singleVideo ? 0 : AppState.playlistIndex;
            History.add(videoID, AppState.songTitle, AppState.songAuthor, videoType, trackIndex, this._getProgress());
        },

        _startProgressSaving: function () {
            this._stopProgressSaving();
            // Save progress every 30 seconds while playing
            this._progressInterval = setInterval(() => {
                if (AppState.playing) {
                    this._saveProgress();
                }
            }, 30000);
        },

        _stopProgressSaving: function () {
            if (this._progressInterval) {
                clearInterval(this._progressInterval);
                this._progressInterval = null;
            }
        },

        // ── Start app ──
        startApp: function (trackIndex = 0) {
            this._showOverlay("loading-overlay");
            DOM.startContainer.style.display = "none";

            if (!this.player || !AppState.starting) return;

            this._stopProgressSaving();
            this.player.destroy();

            const config = playerConfig(AppState.singleVideo ? AppState.myVideoName : "");
            config.params.autoplay = 1;
            this.player = new Youtube.Player(config);

            this._attachIframe();
            this.player.get_iframe().setAttribute(
                "sandbox",
                "allow-forms allow-scripts allow-same-origin allow-presentation allow-popups"
            );

            this._attachEventListeners();
            this._attachPlayingListeners();

            this.player.on("ready", () => {
                if (AppState.singleVideo) {
                    this.player.load_video(AppState.myVideoName, true);
                } else {
                    this.player.load_playlist(AppState.myVideoPlaylistName, "playlist", trackIndex, true);
                }

                this.player.set_volume(100);
                doStart();
                this._startProgressSaving();

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

            // Fetch metadata via oEmbed before starting (like Tapes does)
            const type = parsed.type;
            const id = parsed.id;
            const endpoint =
                type === "playlist"
                    ? `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${id}&format=json`
                    : `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;

            fetch(endpoint)
                .then((r) => r.ok ? r.json() : null)
                .then((data) => {
                    if (data) {
                        AppState.songTitle = data.title || "";
                        AppState.songAuthor = data.author_name || "";
                        History.add(id, data.title || "", data.author_name || "", type === "video" ? "single" : "playlist", trackIndex);
                    }
                })
                .catch(() => {});

            setTimeout(() => this.startApp(trackIndex), 100);
        },

        // ── Event handlers ──

        // Called when video metadata is confirmed available from the player
        _onVideoDataChange: function () {
            const data = this.player.get_video_data();
            if (!data || !data.title) return;

            AppState.songTitle = data.title;
            AppState.songAuthor = data.author;

            // Now we have confirmed metadata — update the history entry
            const videoID = AppState.singleVideo ? AppState.myVideoName : AppState.myVideoPlaylistName;
            if (videoID) {
                const videoType = AppState.singleVideo ? "single" : "playlist";
                const trackIndex = AppState.singleVideo ? 0 : AppState.playlistIndex;
                History.add(videoID, data.title, data.author, videoType, trackIndex, this._getProgress());
            }
        },

        _onPlaylistChange: function () {
            const playlist = this.player.get_playlist();
            if (!playlist) return;
            // Don't save here — wait for video_data_change which has the correct metadata
        },

        _onPlaylistIndexChange: function () {
            const currentIndex = this.player.get_playlist_index() || 0;
            AppState.playlistIndex = currentIndex;
            // Don't save here — video_data_change will fire next with the correct title/author
        },
    };

    return Demo;
})();
