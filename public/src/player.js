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
var bggif = document.getElementById('bg-gif');
// var bgyt = document.getElementById('bg-youtube');
var changingBackground;
var elem = document.documentElement;
var fullscreenbool = false;
var auto = false;
var autoTypeName;
var playlistName;
var infoOpen = true;
var cursor = true;
// var youtubeList_all = "assets/lists/all.txt";
// var soundcloudList = "assets/lists/sc.txt";
// var youtubeList_lofi = "assets/lists/lofi.txt";
// var youtubeList_synth = "assets/lists/synthwave.txt";
// var youtubeList_game = "assets/lists/game.txt";
// var youtubeList_tdnb = "assets/lists/tdnb.txt";
// var youtubeList_none = "assets/lists/none.txt";
var fauxInput = document.createElement('textarea');

// var videoList = "assets/lists/video/video.txt";
// var animeList = "assets/lists/video/anime.txt";
// var skatingList = "assets/lists/video/skating.txt";
// var gamesList = "assets/lists/video/games.txt";

var pPause = document.querySelector('#play-pause'); // element where play and pause image appears
var player;
var youtubes = [];
var videosInPlaylist = [];
var animebackgrounds = [];
var skatingbackgrounds = [];
var videobackgrounds = [];
var gamesbackgrounds = [];
var backtypes = [0,1,2,3,4,5];
var bgTypeIndex;
var genretypes = [0,1];
var genreIndex;
var youtubeIndex = 1;

var playing = false;
var starting = true;
var playerReady = false;
var widget;

var csv;
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/player_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

window.onload = function() {
    let text = document.lastModified;
    document.getElementById("info").innerHTML = text;
    playing = false;
    getBackgrounds('video');
    getBackgrounds('anime');
    getBackgrounds('skating');
    getBackgrounds('games');
    
    // getVideoBackgrounds();
    // getAnimeBackgrounds(); 
    // getSkatingBackgrounds();
    // getGamesBackgrounds();
}

function doStart(){
        document.getElementById("start-container").style.display="none";
        document.getElementById("song-container").style.display="block";
        loadBackgroundType();
        backgroundTypeCommon();
        UpdateUI();
        starting = false;
        playing = true;
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
            if (folderName === 'skating') { skatingbackgrounds = list; skatingbackgroundsMax = skatingbackgrounds.length-1;}
            if (folderName === 'games') { gamesbackgrounds = list; gamesbackgroundsMax = gamesbackgrounds.length-1;}
        }

    }
    // Call the API with the folder parameter
    xmlhttp.open("GET", `/api/list-files?folder=${folderName}`, true);
    xmlhttp.send();
}
//   function getVideoBackgrounds() {
//     var xmlhttp;
//     if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
//         xmlhttp = new XMLHttpRequest();
//     } else { // code for IE6, IE5
//         xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
//     }
//     xmlhttp.onreadystatechange = function() {
//         if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//             var text = xmlhttp.responseText;
//             // Now convert it into array using regex
//             videobackgrounds = text.split(/\n|\r/g);
//             //max item in list one less than length
//             videobackgroundsMax = videobackgrounds.length-1;
//             //randomise which one starts
//             videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
//         }
//     }
//     xmlhttp.open("GET", "/api/list-files", true);
//     xmlhttp.send();
// }

// function getVideoBackgrounds() {
//     var xmlhttp;
//     if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
//         xmlhttp = new XMLHttpRequest();
//     } else { // code for IE6, IE5
//         xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
//     }
//     xmlhttp.onreadystatechange = function() {
//         if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//             var text = xmlhttp.responseText;
//             // Now convert it into array using regex
//             videobackgrounds = text.split(/\n|\r/g);
//             //max item in list one less than length
//             videobackgroundsMax = videobackgrounds.length-1;
//             //randomise which one starts
//             videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
//         }
//     }
//     xmlhttp.open("GET", videoList, true);
//     xmlhttp.send();
// }

// function getAnimeBackgrounds() {
//     var xmlhttp;
//     if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
//         xmlhttp = new XMLHttpRequest();
//     } else { // code for IE6, IE5
//         xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
//     }
//     xmlhttp.onreadystatechange = function() {
//         if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//             var text = xmlhttp.responseText;
//             // Now convert it into array using regex
//             animebackgrounds = text.split(/\n|\r/g);
//             animebackgroundsMax = animebackgrounds.length-1;
//             animebackgroundIndex = Math.floor(Math.random() * animebackgroundsMax);
//         }
//     }
//     xmlhttp.open("GET", "/api/list-files", true);
//     xmlhttp.send()
// }

// function getSkatingBackgrounds() {
//     var xmlhttp;
//     if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
//         xmlhttp = new XMLHttpRequest();
//     } else { // code for IE6, IE5
//         xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
//     }
//     xmlhttp.onreadystatechange = function() {
//         if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//             var text = xmlhttp.responseText;
//             // Now convert it into array using regex
//             skatingbackgrounds = text.split(/\n|\r/g);
//             skatingbackgroundsMax = skatingbackgrounds.length-1;
//             skatingbackgroundIndex = Math.floor(Math.random() * skatingbackgroundsMax);
//         }
//     }
//     xmlhttp.open("GET", "/api/list-files", true);
//     xmlhttp.send()
// }

// function getGamesBackgrounds() {
//     var xmlhttp;
//     if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
//         xmlhttp = new XMLHttpRequest();
//     } else { // code for IE6, IE5
//         xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
//     }
//     xmlhttp.onreadystatechange = function() {
//         if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
//             var text = xmlhttp.responseText;
//             // Now convert it into array using regex
//             gamesbackgrounds = text.split(/\n|\r/g);
//             gamesbackgroundsMax = gamesbackgrounds.length-1;
//             gamesbackgroundIndex = Math.floor(Math.random() * gamesbackgroundsMax);
//         }
//     }
//     xmlhttp.open("GET", "/api/list-files", true);
//     xmlhttp.send()
// }

function loadBackgroundType() {
    if (localStorage.getItem('backtype') == null){
      bgTypeIndex = 2;
    }
    else{
        let myBackType = localStorage.getItem('backtype');
        //bgTypeIndex = myBackType;
        bgTypeIndex = 2;
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
    if (bgTypeIndex == 0){//skating
        var typeName = "skating";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        skatingbackgroundIndex = Math.floor(Math.random() * skatingbackgroundsMax);
        var text = skatingbackgrounds[skatingbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/skating/');
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgyoutube.style.display="none";
    }
    else if (bgTypeIndex == 1){//anime
        var typeName = "anime";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        animebackgroundIndex = Math.floor(Math.random() * animebackgroundsMax);
        var text = animebackgrounds[animebackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/anime/');
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgyoutube.style.display="none";
    }
    else if (bgTypeIndex == 2){//video
        var typeName = "video";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
        // var text = videobackgrounds[videobackgroundIndex];
        // var textclean = text.replace(/^/,'./public/video/');
        var text = videobackgrounds[videobackgroundIndex];
        var textclean = `./video/${text}`; // Point directly to the folder next to index.html
        mp4background.src = textclean;
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgyoutube.style.display="none";
    }
    else if (bgTypeIndex == 3){//games
        var typeName = "games";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        gamesbackgroundIndex = Math.floor(Math.random() * gamesbackgroundsMax);
        var text = gamesbackgrounds[gamesbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/games/');
        mp4background.src = textclean;
        bgmp4.style.display="block";
        bgyoutube.style.display="none";
    }
    else if (bgTypeIndex == 4){//original
        var typeName = "original";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        // gamesbackgroundIndex = Math.floor(Math.random() * gamesbackgroundsMax);
        // var text = gamesbackgrounds[gamesbackgroundIndex];
        // var textclean = text.replace(/^/,'./assets/video/games/');
        mp4background.src = "";
        bgmp4.style.display="block";
        bgyoutube.style.display="block";
    }
    else if (bgTypeIndex == 5){//none
        var typeName = "none";
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        // videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
        // var text = videobackgrounds[videobackgroundIndex];
        // var textclean = text.replace(/^/,'./assets/video/video/');
        mp4background.src = "";
        bgmp4.style.display="block";
        bgyoutube.style.display="none";
    }
    localStorage.setItem('backtype', bgTypeIndex);
    localStorage.getItem('backtype');
    mp4background.play();
    UpdateUI();
}

// function UpdateBackgroundName (){
//     if (bgTypeIndex == 0){//skating
//         var str = skatingbackgrounds[skatingbackgroundIndex];
//         var typeName = "skating";
//         str = str.replace('./assets/video/skating/','');
//         str = str.replace('.mp4','');
//         backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
//         backgroundName.innerHTML = str;
//         backgroundAuto.innerHTML = autoTypeName;
//     }
//     else if (bgTypeIndex == 1){//anime
//         var str = animebackgrounds[animebackgroundIndex];
//         var typeName = "anime";
//         str = str.replace('./assets/video/amime/','');
//         str = str.replace('.mp4','');
//         backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
//         backgroundName.innerHTML = str;
//         backgroundAuto.innerHTML = autoTypeName;
//     }
//     else if (bgTypeIndex == 2){//video
//         var str = videobackgrounds[videobackgroundIndex];
//         var typeName = "video";
//         str = str.replace('./assets/video/video/','');
//         str = str.replace('.mp4','');
//         backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
//         backgroundName.innerHTML = str;
//         backgroundAuto.innerHTML = autoTypeName;
//     }
// }

function UpdateTrackNumber(){
        localStorage.setItem('track', youtubeIndex);
        localStorage.getItem('track');
}

function clearData() {
    localStorage.clear();
}

function changeBackground() {
    changingBackground = true;
    if (playing){
        if (bgTypeIndex == 0){//skating
            skatingbackgroundIndex++;
            if (skatingbackgroundIndex > skatingbackgroundsMax) {
                skatingbackgroundIndex = 0;
            };
            var text = skatingbackgrounds[skatingbackgroundIndex];
            var textclean = text.replace(/^/,'./skating/');
            mp4background.src = textclean;
            localStorage.setItem('background', skatingbackgroundIndex);
        }
        else if (bgTypeIndex == 1){//anime
            animebackgroundIndex++;
            if (animebackgroundIndex > animebackgroundsMax) {
                animebackgroundIndex = 0;
            };
            var text = animebackgrounds[animebackgroundIndex];
            var textclean = text.replace(/^/,'./anime/');
            mp4background.src = textclean;
            localStorage.setItem('background', animebackgroundIndex);
        }
        else if (bgTypeIndex == 2){//video
            videobackgroundIndex++;
            if (videobackgroundIndex > videobackgroundsMax) {
                videobackgroundIndex = 0;
            };
            var text = videobackgrounds[videobackgroundIndex];
            var textclean = text.replace(/^/,'./video/');
            mp4background.src = textclean;
            localStorage.setItem('background', videobackgroundIndex);
        }
        else if (bgTypeIndex == 3){//games
            gamesbackgroundIndex++;
            if (gamesbackgroundIndex > gamesbackgroundsMax) {
                gamesbackgroundIndex = 0;
            };
            var text = gamesbackgrounds[gamesbackgroundIndex];
            var textclean = text.replace(/^/,'./games/');
            mp4background.src = textclean;
            localStorage.setItem('background', gamesbackgroundIndex);
        }
        else if (bgTypeIndex == 4 || bgTypeIndex == 5){//original or none
            mp4background.src = "";
        }

        var changingBackground = false;
        localStorage.getItem('background');
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

function loadAuto () {
    if (localStorage.getItem('auto') == null){
      auto = true;
      autoTypeName = "(auto)";
    }
    else if (localStorage.getItem('auto') == 1)
        {
            autoTypeName = "(auto)";
            // backgroundAuto.style.display="inline-block";
            UpdateUI();
            //UpdateBackgroundName();
            auto = true;
    }
    else if (localStorage.getItem('auto') == 1)
        {
            autoTypeName = "(auto)";
            // backgroundAuto.style.display="inline-block";
            UpdateUI();
            //UpdateBackgroundName();
            auto = true;
        }
}

function toggleAuto() {
if (auto == false){
        autoTypeName = "(auto)";
        // backgroundAuto.style.display="inline-block";
        UpdateUI();
        //UpdateBackgroundName();
        auto = true;
        localStorage.setItem('auto', '1');
        localStorage.getItem('auto');
  
}

else if (auto == true){
        autoTypeName = "(manual)";
        // backgroundAuto.style.display="inline-block";
        UpdateUI();
        UpdateBackgroundName();
        auto = false;
        localStorage.setItem('auto', '0');
        localStorage.getItem('auto');
    }
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
    startRepeating(() => {
  
        if (playing){
            changeBackground();
        console.log("changing background " + bgTypeIndex + " to " + mp4background.src);
            console.log(playing);
        }
            

    }, 5);

// Stop it when needed:
// stopRepeating();