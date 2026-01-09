var songName = document.getElementById('song-name'); // element where track name appears
var songAuthor = document.getElementById('song-author'); // element where track artist appears
var songURL = document.getElementById('song-url'); // element where track url appears
var info = document.querySelector('.info'); // background display type
var backgroundType = document.getElementById('background-type'); // type of background
var backgroundName = document.getElementById('background-name'); // current backgrounds name
var backgroundAuto = document.getElementById('background-auto'); // background auto change or not
var mp4background =  document.getElementById('mp4-background');
var mp4altbackground =  document.getElementById('mp4-alt-background');
var song = document.querySelector('#song'); // audio object
var genreNumber = document.getElementById('genre-number');
var startContainer = document.getElementById('start-container');
var start = document.getElementById('start');
var songContainer = document.getElementById('song-container');
var infoContainer = document.getElementById('info-container');
var titleContainer = document.getElementById('title-container');
var infoButton = document.querySelector('.info-button'); // background display type
var fullscreen = document.querySelector('.fullscreen');
var title = document.getElementById('title'); // page/site title
var songTitle = document.querySelector('.song-title'); // element where track title appears
var bgTitle = document.querySelector('.bg-title'); // eleent where track title appears
var controlsImage = document.getElementById('bottom');
var bgmp4 = document.getElementById('bg-mp4');
var bgyoutube = document.getElementById('bg-youtube');
var bgnone = document.getElementById('bg-none');
// var bgyt = document.getElementById('bg-youtube');
var changingBackground;
var elem = document.documentElement;
var fullscreenbool = false;
var auto = false;
var autoTypeName;
var playlistName;
var infoOpen = true;
var cursor = true;
var fauxInput = document.createElement('textarea');
var version ="v0.1";
var pPause = document.querySelector('#play-pause'); // element where play and pause image appears
var player;
var animebackgrounds = [];
var vintagebackgrounds = [];
var videobackgrounds = [];
var backtypes = [0,1,2,3,4];
var changeTimes = [0,1,2];
var changeTimeIndex;
var changeTimeActual;
var bgTypeIndex;
var genretypes = [0,1];
var genreIndex;
var youtubeIndex = 1;

var playing = false;
var starting = true;
var playerReady = false;
var widget;
// var trackName;
//  var authorName;
var csv;
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/player_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onload = function() {
    
    // Now initialize the Demo app safely
    if (typeof Youtube !== 'undefined') {
        window.myApp = new Demo();
        console.log("YouTube Player initialized and assigned to window.myApp");
    } else {
        console.warn("YouTube library not found yet. If you are using a wrapper, ensure it loads before player.js");
    }
    var d = document.lastModified;
    var n = new Date(document.lastModified).toLocaleString();
    document.getElementById("info").innerHTML = n + " " + version;
    loadSavedListUI();
    playing = false;
    getBackgrounds('video');
    getBackgrounds('anime');
    getBackgrounds('vintage');
    
}

function doStart(){
        starting = false;
        playing = true;
        document.getElementById("start-container").style.display="none";
        document.getElementById("song-container").style.display="block";
        document.getElementById("bg-youtube").style.display="block";
        if (singleVideo){
            document.getElementById("playlist-prev").style.display="none";
            document.getElementById("track-number").style.display="none";
            document.getElementById("playlist-next").style.display="none";
        }
        initInactivityFade();
        loadBackgroundType();
        backgroundTypeCommon();
        loadChangeTime();
        changeTimeCommon();
        //UpdateUI();
  
        
         // Trigger the save and set change backgroun time after 2 sec
        setTimeout(() => {

            		//console.log(songTitle,songAuthor);
            if (singleVideo){
                // var type = "single";
                // saveVideoToList(myVideoName, songTitle, songAuthor, type);
                saveVideoToList(myVideoName, songTitle, songAuthor, "single", 0);
            }
            else{
                //var type = "playlist";
                saveVideoToList(myVideoPlaylistName, songTitle, songAuthor, "playlist", playlistIndex);
            }
        }, 3000);
}


fetch('api/list-files')
  .then(response => response.text())
  .then(fileList => {
    //console.log(fileList);
  });
  
function getBackgrounds(folderName) {
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            var list = text.split(/\n|\r/g).filter(line => line.trim() !== '');
            
            // Assign to your global arrays
            if (folderName === 'video'){ videobackgrounds = list; videobackgroundsMax = videobackgrounds.length-1;}
            if (folderName === 'anime') { animebackgrounds = list; animebackgroundsMax = animebackgrounds.length-1;}
            if (folderName === 'vintage') { vintagebackgrounds = list; vintagebackgroundsMax = vintagebackgrounds.length-1;}
        }

    }
    // Call the API with the folder parameter
    xmlhttp.open("GET", `/api/list-files?folder=${folderName}`, true);
    xmlhttp.send();
}

function loadChangeTime() {
    if (localStorage.getItem('changeTime') == null){
      changeTimeIndex = 0;
    }
    else{
        let myChangeTime = localStorage.getItem('changeTime');
        changeTimeIndex = myChangeTime;
    }
}

function changeChangeTime() {
    //increment change time index
    changeTimeIndex++;
    //loop round
    if (changeTimeIndex > changeTimes.length-1) {
        changeTimeIndex = 0;
    };
    changeTimeCommon();
}

function changeTimeCommon() {

    if (changeTimeIndex == 0){
        backgroundAuto.innerHTML = "bg change: off";
        stopRepeating();
        //console.log("NOT changing background");
    }
    else if (changeTimeIndex == 1){
        changeTimeActual = 30;
        backgroundAuto.innerHTML = "bg change: 30s";
        startRepeating(() => {
        if (playing){
            changeBackground();
        //console.log("changing background every " + changeTimeActual + "s");
        }
    }, changeTimeActual);
        // console.log("index is: " + changeTimeIndex + " , actual is: " + changeTimeActual + "s");
    }
    else if (changeTimeIndex == 2){
        changeTimeActual = 10;
        backgroundAuto.innerHTML = "bg change: 10s";
        startRepeating(() => {
        if (playing){
            changeBackground();
        //console.log("changing background every " + changeTimeActual + "s");
        }
    }, changeTimeActual);
    }
    localStorage.setItem('changeTime', changeTimeIndex);
    localStorage.getItem('changeTime');
}

function loadBackgroundType() {
    if (localStorage.getItem('backtype') == null){
      bgTypeIndex = 0;
    }
    else{
        let myBackType = localStorage.getItem('backtype');
        bgTypeIndex = myBackType;
    }
}

function changeBackgroundType() {
    //increment background type
    bgTypeIndex++;
    //loop round
    if (bgTypeIndex > backtypes.length-1) {
        bgTypeIndex = 0;
    };
    backgroundTypeCommon();
    
}

function backgroundTypeCommon(){
    if (bgTypeIndex == 0){//vintage
        var typeName = "vintage";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        vintagebackgroundIndex = Math.floor(Math.random() * vintagebackgroundsMax);
        var text = vintagebackgrounds[vintagebackgroundIndex];
        var textclean = `./vintage/${text}`; // Point directly to the folder next to index.html
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgnone.style.background="#000000";
        bgyoutube.style.display="block";
    }
    else if (bgTypeIndex == 1){//anime
        var typeName = "anime";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        animebackgroundIndex = Math.floor(Math.random() * animebackgroundsMax);
        var text = animebackgrounds[animebackgroundIndex];
        var textclean = `./anime/${text}`; // Point directly to the folder next to index.html
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgnone.style.background="#000000";
        bgyoutube.style.display="block";
    }
    else if (bgTypeIndex == 2){//video
        var typeName = "video";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
        var text = videobackgrounds[videobackgroundIndex];
        var textclean = `./video/${text}`; // Point directly to the folder next to index.html
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgnone.style.background="#000000";
        bgyoutube.style.display="block";
    }
    else if (bgTypeIndex == 3){//original youtube
        var typeName = "original";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        mp4background.src = "";
        bgmp4.style.display="none";
        bgnone.style.background="#00000000";
        bgyoutube.style.display="block";
    }
    else if (bgTypeIndex == 4){//none
        var typeName = "none";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        mp4background.src = "";
        bgmp4.style.display="none";
        bgnone.style.background="#000000";
        bgyoutube.style.display="block";
    }
    localStorage.setItem('backtype', bgTypeIndex);
    localStorage.getItem('backtype');

    if(playing == false){
        mp4background.pause();
    }
    //UpdateUI();
}

function changeBackground() {
    changingBackground = true;
    if (playing){
        if (bgTypeIndex == 0){//vintage
            vintagebackgroundIndex++;
            if (vintagebackgroundIndex > vintagebackgroundsMax) {
                vintagebackgroundIndex = 0;
            };
            var text = vintagebackgrounds[vintagebackgroundIndex];
            var textclean = text.replace(/^/,'./vintage/');
            mp4background.src = textclean;
        }
        else if (bgTypeIndex == 1){//anime
            animebackgroundIndex++;
            if (animebackgroundIndex > animebackgroundsMax) {
                animebackgroundIndex = 0;
            };
            var text = animebackgrounds[animebackgroundIndex];
            var textclean = text.replace(/^/,'./anime/');
            mp4background.src = textclean;
        }
        else if (bgTypeIndex == 2){//video
            videobackgroundIndex++;
            if (videobackgroundIndex > videobackgroundsMax) {
                videobackgroundIndex = 0;
            };
            var text = videobackgrounds[videobackgroundIndex];
            var textclean = text.replace(/^/,'./video/');
            mp4background.src = textclean;
        }
        else if (bgTypeIndex == 3 || bgTypeIndex == 4){//original or none
            mp4background.src = "";
        }

        var changingBackground = false;
        //localStorage.getItem('background');
        //UpdateBackgroundName();
    }
}




function UpdateUI() {
  setTimeout(function(){
    // songContainer.className = 'song-container fadein';
    // startContainer.className = 'start-container fadein';
    // titleContainer.className = 'title-container fadein';
    // if (infoContainer.className == 'info-container fadeout'){
    //     infoContainer.className = 'info-container fadein';
    // }
    }, 0);
    setTimeout(function(){ 

    // if (infoContainer.className == 'info-container fadein'){
    //     infoContainer.className = 'info-container fadeout';
    // }
    }, 500);
}

// convert song.currentTime and song.duration into MM:SS format
function formatTime(seconds) {
    let min = Math.floor((seconds / 60));
    let sec = Math.floor(seconds - (min * 60));
    if (sec < 10){
        sec  = `0${sec}`;
    };
    return `${min}:${sec}`;
};

function doFullscreen() {
if (fullscreenbool == false){
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
      else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
      }
      else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
      }
      fullscreenbool = true;
}

else{
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
      else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      }
      else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
      fullscreenbool = false;
    }
}

// function loadAuto () {
//     if (localStorage.getItem('auto') == null){
//       auto = true;
//       autoTypeName = "(auto)";
//     }
//     else if (localStorage.getItem('auto') == 1)
//         {
//             autoTypeName = "(auto)";
//             // backgroundAuto.style.display="inline-block";
//             UpdateUI();
//             //UpdateBackgroundName();
//             auto = true;
//     }
//     else if (localStorage.getItem('auto') == 1)
//         {
//             autoTypeName = "(auto)";
//             // backgroundAuto.style.display="inline-block";
//             UpdateUI();
//             //UpdateBackgroundName();
//             auto = true;
//         }
// }

// function toggleAuto() {
// if (auto == false){
//         autoTypeName = "(auto)";
//         // backgroundAuto.style.display="inline-block";
//         UpdateUI();
//         //UpdateBackgroundName();
//         auto = true;
//         localStorage.setItem('auto', '1');
//         localStorage.getItem('auto');
  
// }

// else if (auto == true){
//         autoTypeName = "(manual)";
//         // backgroundAuto.style.display="inline-block";
//         UpdateUI();
//         UpdateBackgroundName();
//         auto = false;
//         localStorage.setItem('auto', '0');
//         localStorage.getItem('auto');
//     }
// }

// function UpdateTrackNumber(){
//         localStorage.setItem('track', youtubeIndex);
//         localStorage.getItem('track');
// }

function clearData() {
    localStorage.clear();
}

function doPopup() {
  var popup = document.getElementById("myPopup");
  popup.classList.toggle("show");
}
 


var interval = null;

function startRepeating(func, seconds) {

        // Clear any existing interval
        if (interval) {
            clearInterval(interval);
        }
    
  // Start new interval
  interval = setInterval(func, seconds * 1000);
  
  // Optionally run once immediately
//   func();
}

function stopRepeating() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
//SAVE VIDEO HISTORY STUFF
function saveVideoToList(videoID, videoName, videoAuthor, videoType, trackIndex = 0) {

        let savedVideos = JSON.parse(localStorage.getItem('userVideoHistory')) || [];

        // Find the index of the video if it already exists in our saved list
        const existingIndex = savedVideos.findIndex(v => v.id === videoID);

        if (existingIndex !== -1) {
            // UPDATE EXISTING: If it exists, update the track number and move to top
            savedVideos[existingIndex].track = trackIndex;
            savedVideos[existingIndex].timestamp = new Date().getTime();
            
            //update name and author amyway
            savedVideos[existingIndex].name = videoName;
            savedVideos[existingIndex].author = videoAuthor;
            // Move the updated item to the front of the list
            const updatedItem = savedVideos.splice(existingIndex, 1)[0];
            savedVideos.unshift(updatedItem);
            
            console.log("Updated playlist track:", videoName, "to index:", trackIndex);
        } else {
            // ADD NEW: Create a new entry
            savedVideos.unshift({
                id: videoID,
                name: videoName,
                author: videoAuthor,
                type: videoType,
                track: trackIndex, // Store the track number (0 for single videos)
                timestamp: new Date().getTime()
            });

            if (savedVideos.length > 50) savedVideos.pop();
            console.log("Saved new entry:", videoName);
        }

        localStorage.setItem('userVideoHistory', JSON.stringify(savedVideos));
    
}

function removeVideoFromHistory(videoID) {
    // Get the current list from storage
    let savedVideos = JSON.parse(localStorage.getItem('userVideoHistory')) || [];

    //Filter out the video that matches the provided ID
    // We keep every video EXCEPT the one we want to delete
    savedVideos = savedVideos.filter(video => video.id !== videoID);

    // 3. Save the new filtered list back to localStorage
    localStorage.setItem('userVideoHistory', JSON.stringify(savedVideos));

    // 4. Refresh the UI so the button disappears immediately
    loadSavedListUI(); 
    
    console.log("Removed video ID:", videoID);
}

function loadSavedListUI() {
    const savedVideos = JSON.parse(localStorage.getItem('userVideoHistory')) || [];
    const container = document.getElementById('saved-videos-container');
    
    container.innerHTML = ''; 

    savedVideos.forEach(video => {
        const btn = document.createElement('button');
        const removeBtn = document.createElement('button');
        const row = document.createElement('div');
        
        row.className = 'history-row';

        // 1. Create the Display Label
        let trackInfo = "";
        if (video.type !== "single" && video.track !== undefined) {
            // Adding 1 to the index so it displays as "Track 1" instead of "Track 0"
            trackInfo = " // Playlist // Track " + (video.track + 1);
        }
        else
        {
           trackInfo = " // Single video"; 
        }

        // 2. Set Button Styles and Icons
        if (video.type == "single") {
            btn.className = 'history-item';
            btn.innerHTML = "<i class=\"fa fa-file-video-o\" aria-hidden=\"true\"></i> " + 
                            video.name + " // " + video.author + trackInfo;
        } else {
            btn.className = 'history-item playlist';
            btn.innerHTML = "<i class=\"fa fa-list-alt\" aria-hidden=\"true\"></i> " + 
                            video.name + " // " + video.author + trackInfo;    
        }

        removeBtn.className = "history-remove";
        removeBtn.innerHTML = "<i class=\"fa fa-trash\" aria-hidden=\"true\"></i>";

        // 3. Updated Click Logic
        btn.onclick = () => {
            if (window.myApp) {
                // Pass both the ID and the saved track index
                // Note: You'll need to update submitVideoNameFromSaved to accept the second parameter
                window.myApp.submitVideoNameFromSaved(video.id, video.track || 0);
            }
        };

        removeBtn.onclick = (e) => {
            e.stopPropagation(); 
            removeVideoFromHistory(video.id);
        };

        container.appendChild(row);
        row.appendChild(btn);
        btn.appendChild(removeBtn);
    });
}

// Inactivity fade functionality
let inactivityTimer;
let songContainerVisible = true;
const FADE_DELAY = 5000; // 5 seconds of inactivity

function hideSongContainer() {
    const songContainer = document.getElementById('song-container');
    if (songContainer && songContainerVisible && playing) {
        songContainer.style.transition = 'opacity 1s ease';
        songContainer.style.opacity = '0';
        songContainerVisible = false;
         // Hide mouse cursor
        document.body.style.cursor = 'none';
    }
}

function showSongContainer() {
    const songContainer = document.getElementById('song-container');
    if (songContainer && !songContainerVisible) {
        songContainer.style.opacity = '1';
        songContainerVisible = true;
        // Show mouse cursor
        document.body.style.cursor = 'default';
    }
}

function resetInactivityTimer() {
    // Show the container immediately
    showSongContainer();
    
    // Clear existing timer
    clearTimeout(inactivityTimer);
    
    // Set new timer to hide after delay
    inactivityTimer = setTimeout(hideSongContainer, FADE_DELAY);
}

// Initialize when page loads
function initInactivityFade() {
    const songContainer = document.getElementById('song-container');
    if (songContainer) {
        // Make sure transition is set
        songContainer.style.transition = 'opacity 1s ease';
        
        // Start the initial timer
        resetInactivityTimer();
        
        // Listen for user activity
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('mousedown', resetInactivityTimer);
        document.addEventListener('keydown', resetInactivityTimer);
        document.addEventListener('touchstart', resetInactivityTimer);
        document.addEventListener('touchmove', resetInactivityTimer);
        document.addEventListener('scroll', resetInactivityTimer);
        
        console.log('Inactivity fade initialized');
    }
}



// KEYBOARD CONTROLS
window.addEventListener('keydown', function(event) {
    //const video = document.getElementById("mp4background");
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return;
    }
    
    // 2. Handle the inputs
    switch (event.key.toLowerCase()) {
        case " ": // Spacebar
            event.preventDefault(); // Stop page from scrolling
            if (window.myApp && typeof window.myApp.togglePlayback === 'function') {
                        window.myApp.togglePlayback();
                    }
            break;

        case "arrowright": // Skip forward 5 seconds
        if (!singleVideo)
            window.myApp.doPlaylistNext();
            break;

        case "arrowleft": // Skip back 5 seconds
        if (!singleVideo)
            window.myApp.doPlaylistPrevious();
            break;

        case "x": // Next background type(custom function)
            changeBackgroundType();
            break;
        
        case "i": // Do info popup
            doPopup();
            break;

        case "f": // Do info popup
            doFullscreen();
            break;

    }

});