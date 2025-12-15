
const songName = document.getElementById('song-name'); // element where track name appears
const songAuthor = document.getElementById('song-author'); // element where track artist appears
const songURL = document.getElementById('song-url'); // element where track url appears
// const genre = document.querySelector('.genre-name'); // 
const info = document.querySelector('.info'); // background display type
const backgroundType = document.getElementById('background-type'); // type of background
const backgroundName = document.getElementById('background-name'); // filename of background
const backgroundAuto = document.getElementById('background-auto'); // background auto change or not
const mp4background =  document.getElementById('mp4-background');
const mp4altbackground =  document.getElementById('mp4-alt-background');
// const gifbackground =  document.getElementById('gif-background');

const song = document.querySelector('#song'); // audio object
//const playlistName = document.getElementById('genre-name');
const genreNumber = document.getElementById('genre-number');
const genreNumberNext = document.getElementById('genre-number-next');
const genreNumberPrev = document.getElementById('genre-number-prev');
//const genrePlaylist = document.getElementById('genre-playlist');
const startContainer = document.getElementById('start-container');
const start = document.getElementById('start');
const songContainer = document.getElementById('song-container');
const infoContainer = document.getElementById('info-container');
const titleContainer = document.getElementById('title-container');
const infoButton = document.querySelector('.info-button'); // background display type
const fullscreen = document.querySelector('.fullscreen');
const title = document.getElementById('title'); // page/site title
const songTitle = document.querySelector('.song-title'); // element where track title appears
const bgTitle = document.querySelector('.bg-title'); // eleent where track title appears
const controlsImage = document.getElementById('bottom');
const bgmp4 = document.getElementById('bg-mp4');
const bggif = document.getElementById('bg-gif');
// const bgyt = document.getElementById('bg-youtube');

var elem = document.documentElement;
var fullscreenbool = false;
var auto = false;
var autoTypeName;
var playlistName;
var infoOpen = true;
var cursor = true;
var youtubeList_all = "assets/lists/all.txt";
var soundcloudList = "assets/lists/sc.txt";
var youtubeList_lofi = "assets/lists/lofi.txt";
var youtubeList_synth = "assets/lists/synthwave.txt";
var youtubeList_game = "assets/lists/game.txt";
var youtubeList_tdnb = "assets/lists/tdnb.txt";
var youtubeList_none = "assets/lists/none.txt";
var fauxInput = document.createElement('textarea');

var videoList = "assets/lists/video/video.txt";
var animeList = "assets/lists/video/anime.txt";
var skatingList = "assets/lists/video/skating.txt";
var myVideoName;
var videoName;
var videoPlaylistName;
var videoPlaylistNameClean;
var videoNameClean;
let pPause = document.querySelector('#play-pause'); // element where play and pause image appears
var player;
var youtubes = [];
var videosInPlaylist = [];
var animebackgrounds = [];
var skatingbackgrounds = [];
var videobackgrounds = [];
var backtypes = [0,1,2];
var bgTypeIndex;
var genretypes = [0,1];
var genreIndex;
var youtubeIndex = 1;
var fadeTime = 3000;

let singleVideo = false;
let playing = false;
let starting = true;
let playerReady = false;

// var iframeElement   = document.querySelector('iframe');
// var iframeElementID = iframeElement.id;
var widget;

var csv;
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/player_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
window.onload = function() {
    //clearData();

    //getYoutubes();
    //getSoundcloud();    
    //playYoutubeVideo();
    getVideoBackgrounds();
    getAnimeBackgrounds(); 
    getSnesBackgrounds();


}

//landing screen
document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function(){
    //mp4background.play();
    start.innerHTML = "<div class=\"video-submit\">Enter Playlist URL or ID: <br><br><input class='videobox' type=\"text\" id=\"video-playlist-entry\" name=\"video-playlist-entry\">&nbsp;&nbsp;<input type=\"submit\" value=\"Submit\" onclick='submitVideoPlaylistName()'></div>";
    //backgroundAuto.style.display="none";

    }, 0);
}, false);

setInterval(updateProgressValue, 100);
setInterval(newBackground, 16000);

function playPause() {
    if (starting == false){
        if (playing == false) {
            playing = true;
            player.playVideo();
            //if (starting == false){
                mp4background.play();
            //}
        }
        else if (playing == true) {
            playing = false;
            player.pauseVideo();
            //UpdateUI();
            mp4background.pause();
        }
    }
    // else if (starting == true){
        
    //     document.getElementById("start-container").style.display="none";
    //     backgroundName.style.display="none";
    //     document.getElementById("song-container").style.display="block";
    //     loadBackgroundType();
    //     loadAuto();
    //     //loadGenreType();
    //     //playYoutubeVideo();
    //     changeBackground();
    //     playYoutubePlaylist();
    //     starting = false;
    // }
}
function getYoutubes() {
    var xmlhttp;
    if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
        xmlhttp = new XMLHttpRequest();
    } else { // code for IE6, IE5
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            // Now convert it into array using regex
            var textclean = text.replaceAll('https://www.youtube.com/watch?v=','');
            //youtubes = textclean.split(/\n|\r/g);
            youtubes = textclean.split(", ");
            //youtubes = textclean.split('\n'); 
            if (localStorage.getItem('track') == null){
                youtubeIndex = 0;
            }
            else
            {
                let myTrack = localStorage.getItem('track');
                youtubeIndex = myTrack;
            }
            //player.loadVideoById(youtubes[youtubeIndex]);
            console.log(textclean);
            player.loadVideoById(textclean);
            UpdateTrackNumber();
            //playPause(); // for some reason this hides the space to start
        }
    }
    xmlhttp.open("GET", youtubeList_synth, true);
    xmlhttp.send();
}



    window.addEventListener('click', mouse, false);
    window.addEventListener('mousemove', mouse, false);
    
    //check bg elemets for mouse move
    function mouse (event) {
      UpdateUI();
      showCursor();
}

//hide video context menu
mp4background.addEventListener('contextmenu', e => {
  e.preventDefault();
});


document.body.onkeyup = function(e){
        if (!/^(?:input|textarea|select|button)$/i.test(e.target.tagName)) {
        if(e.keyCode == 32){//space
            playPause();
        }
        else if(e.keyCode == 37){//left arrow
            previousSong();
        }
        else if(e.keyCode == 39){//right arrow
            nextSong();
        }
        else if(e.keyCode == 88){//x key
            changeBackgroundType();
        }
        else if(e.keyCode == 66){//B key
            changeBackground();
        }
        else if(e.keyCode == 65){//A key
            toggleAuto();
        }
        else if(e.keyCode == 70){//f key
            doFullscreen();
        }
        else if(e.keyCode == 73){//i key
            doPopup();
        }
        else if(e.keyCode == 80){//P keypress
            changePlaylist();
        }
        else if(e.keyCode == 187){//= key
            clearData();
        }
    }
}





function checkVideoName(){
    // videoName = document.getElementById("videoname").value;
    
    // if (videoName == null){
    //     videobox.className = 'videobox';
    // }
    // if (videoName.includes("https://www.youtube.com/watch?v=")){
    //     videoNameClean = videoName.replaceAll('https://www.youtube.com/watch?v=','');
    //     console.log("OK!!!!!!");
    //     videobox.className = 'videobox-ok';
    // }
    // else if (videoName.includes("https://youtu.be")){
    //     videoNameClean = videoName.replaceAll('https://youtu.be/','');
    //     console.log("OK!!!!!!");
    //     videobox.className = 'videobox-ok';
    // }
    // else {
    //     videobox.className = 'videobox-notok';
    //     console.log("NOT OK");
    //     // console.log(videoName);
    // }
}


function getVideoBackgrounds() {
    var xmlhttp;
    if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
        xmlhttp = new XMLHttpRequest();
    } else { // code for IE6, IE5
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            // Now convert it into array using regex
            videobackgrounds = text.split(/\n|\r/g);
            videobackgroundsMax = videobackgrounds.length-1;
            videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
        }
    }
    xmlhttp.open("GET", videoList, true);
    xmlhttp.send();
}

function getAnimeBackgrounds() {
    var xmlhttp;
    if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
        xmlhttp = new XMLHttpRequest();
    } else { // code for IE6, IE5
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            // Now convert it into array using regex
            animebackgrounds = text.split(/\n|\r/g);
            animebackgroundsMax = animebackgrounds.length-1;
            animebackgroundIndex = Math.floor(Math.random() * animebackgroundsMax);
        }
    }
    xmlhttp.open("GET", animeList, true);
    xmlhttp.send()
}

function getSnesBackgrounds() {
    var xmlhttp;
    if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
        xmlhttp = new XMLHttpRequest();
    } else { // code for IE6, IE5
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            // Now convert it into array using regex
            skatingbackgrounds = text.split(/\n|\r/g);
            skatingbackgroundsMax = skatingbackgrounds.length-1;
            skatingbackgroundIndex = Math.floor(Math.random() * skatingbackgroundsMax);
        }
    }
    xmlhttp.open("GET", skatingList, true);
    xmlhttp.send()
}


function infoSlide() {
    // if (infoOpen == true){
    // //slide away
    //   setTimeout(function(){
    //         UpdateUI();
    //         infoContainer.className = 'info-container-out';
    //         infoButton.className = 'info-button-out';
    //         infoButton.innerHTML = "<span class='info-button-out' id='info-button' onclick='infoSlide()'><i class='far fa-question-circle'></i></span>";
    //         //term.classList.remove('term-focus');
    //     }, 0);
    //     setTimeout(function(){ 
    //         infoContainer.className = 'info-container fadeout';
    //         infoButton.className = 'info-button';
    //         infoOpen = false;
    //     }, 1000);
    // }
    // else {
    // //slide open
    //   setTimeout(function(){
    //         UpdateUI();
    //         infoContainer.className = 'info-container-in';
    //         infoButton.className = 'info-button-in';
    //         infoButton.innerHTML = "<span class='info-button-in' id='info-button'onclick='infoSlide()'><i class='far fa-question-circle'></i></span>";
    //         infoOpen = true;
    //         //fauxInput.focus();
    //         //term.classList.add('term-focus');
    //     }, 0);
    // }
}

function loadBackgroundType() {
    if (localStorage.getItem('backtype') == null){
      bgTypeIndex = 1;
    }
    else{
        let myBackType = localStorage.getItem('backtype');
        bgTypeIndex = myBackType;
    }
    if (bgTypeIndex == 0){//skating
       //document.getElementById("bg-gif").style.display="block";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        var text = skatingbackgrounds[skatingbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/skating/');
        mp4background.src = textclean;
    }
    else if (bgTypeIndex == 1){//anime
        //document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        var text = animebackgrounds[animebackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/anime/');
        mp4background.src = textclean;
    }

    else if (bgTypeIndex == 2){//video
        //document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        var text = videobackgrounds[videobackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/video/');
        mp4background.src = textclean;

    }
    localStorage.setItem('backtype', bgTypeIndex);
    localStorage.getItem('backtype');
    mp4background.play();
    UpdateUI();
    UpdateBackgroundName();
}
function changeBackgroundType() {
    //increment background type
    bgTypeIndex++;
    //loop round
    if (bgTypeIndex > backtypes.length-1) {
        bgTypeIndex = 0;
    };
    if (bgTypeIndex == 0){//skating
        //document.getElementById("bg-gif").style.display="block";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        skatingbackgroundIndex = Math.floor(Math.random() * skatingbackgroundsMax);
        var text = skatingbackgrounds[skatingbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/skating/');
        mp4background.src = textclean;
    }
    else if (bgTypeIndex == 1){//anime
        //document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        animebackgroundIndex = Math.floor(Math.random() * animebackgroundsMax);
        var text = animebackgrounds[animebackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/anime/');
        mp4background.src = textclean;
    }

    else if (bgTypeIndex == 2){//video
        //document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        // document.getElementById("bg-youtube").style.display="none";
        // document.getElementById("background-name").style.display="none";
        videobackgroundIndex = Math.floor(Math.random() * videobackgroundsMax);
        var text = videobackgrounds[videobackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/video/');
        mp4background.src = textclean;
    }
    // else if (bgTypeIndex == 3){//youtube
    //     // info.innerHTML = "<span class='butt' onclick='changeBackgroundType()'>youtube</span>";
    //     document.getElementById("bg-gif").style.display="none";
    //     document.getElementById("bg-mp4").style.display="none";
    //     document.getElementById("bg-start").style.display="none";
    //     document.getElementById("bg-youtube").style.display="block";
    //     document.getElementById("background-name").style.display="none";

    // }
    localStorage.setItem('backtype', bgTypeIndex);
    localStorage.getItem('backtype');
    UpdateUI();
    UpdateBackgroundName();
}

function UpdateBackgroundName (){
    if (bgTypeIndex == 2){//video
        var str = videobackgrounds[videobackgroundIndex];
        var typeName = "video";
        // str = str.replace('.mp4','');
        str = str.replace('./assets/video/video/','');
        str = str.replace('.mp4','');
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        backgroundName.innerHTML = str;
        backgroundAuto.innerHTML = autoTypeName;
    }
    else if (bgTypeIndex == 1){//gif
        var str = animebackgrounds[animebackgroundIndex];
        var typeName = "anime";
        str = str.replace('./assets/video/amime/','');
        str = str.replace('.mp4','');
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        backgroundName.innerHTML = str;
        backgroundAuto.innerHTML = autoTypeName;
    }
    else if (bgTypeIndex == 0){//none
        var str = skatingbackgrounds[skatingbackgroundIndex];
        var typeName = "skating";
        str = str.replace('./assets/video/skating/','');
        str = str.replace('.mp4','');
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;"+typeName;
        backgroundName.innerHTML = str;
        backgroundAuto.innerHTML = autoTypeName;
    }
}

function changePlaylist(){

}

function UpdateTrackNumber(){
        //var trackNumber = parseInt(youtubeIndex, 10);
        var trackNumber = youtubeIndex;
        genreNumberPrev.innerHTML = "<<";
        // genreNumberPrev.innerHTML = "<i class='fas fa-file-image'></i>";
        genreNumber.innerHTML = (trackNumber)+"&nbsp;/&nbsp;"+(videosInPlaylist.length);
        genreNumberNext.innerHTML = ">>";
        var songTitle = player.getVideoData().title;
        var songChannel = player.getVideoData().author;
        //var playlistName = player.title;
        //console.log(player.getVideoData().playlist)
        document.getElementById("song-author").className = 'song-author';
        songName.innerHTML = "<a href='"+player.getVideoUrl()+"'target='_blank'>"+songTitle+"</a>";
        songAuthor.innerHTML = "<a href='"+player.getVideoUrl()+"'target='_blank'>"+songChannel+"</a>";
       //playlistName.innerHTML = "<i class='fab fa-youtube'></i>&nbsp;"+(songChannel);
        localStorage.setItem('track', youtubeIndex);
        localStorage.getItem('track');
}

function previousSong() {
    if (!singleVideo && youtubeIndex > 1) {
        youtubeIndex--;
        if (playing == false){
            mp4background.play();
        }
        player.previousVideo();
        playing = true;
        // player.loadVideoById(youtubes[youtubeIndex]);
        localStorage.setItem('track', youtubeIndex);
        localStorage.getItem('track');
    }
    UpdateTrackNumber();
    UpdateUI();
}

function nextSong() {
    if (!singleVideo && youtubeIndex < videosInPlaylist.length){
        youtubeIndex++;
        if (playing == false){
            mp4background.play();
        }
        player.nextVideo();
        playing = true;
        localStorage.setItem('track', youtubeIndex);
        localStorage.getItem('track');
    }
    UpdateTrackNumber();
    UpdateUI();
}





function clearData() {
    localStorage.clear();
}

function newBackground() {
    if (auto == true && playing == true){
        changeBackground();
    }   
}

function changeBackground() {
    if (bgTypeIndex == 2){
        videobackgroundIndex++;
        if (videobackgroundIndex > videobackgroundsMax) {
            videobackgroundIndex = 0;
        };
        var text = videobackgrounds[videobackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/video/');

        mp4background.src = textclean;
        localStorage.setItem('background', videobackgroundIndex);
    }
    else if (bgTypeIndex == 1){
        animebackgroundIndex++;
        if (animebackgroundIndex > animebackgroundsMax) {
            animebackgroundIndex = 0;
        };
        var text = animebackgrounds[animebackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/anime/');
        mp4background.src = textclean;
        localStorage.setItem('background', animebackgroundIndex);
    }
    else if (bgTypeIndex == 0){
        skatingbackgroundIndex++;
        if (skatingbackgroundIndex > skatingbackgroundsMax) {
            skatingbackgroundIndex = 0;
        };
        var text = skatingbackgrounds[skatingbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video/skating/');
        mp4background.src = textclean;
        localStorage.setItem('background', skatingbackgroundIndex);
    }
    localStorage.getItem('background');
    UpdateBackgroundName();
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
      } else if (elem.webkitRequestFullscreen) { /* Safari */
        elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) { /* IE11 */
        elem.msRequestFullscreen();
      }
      fullscreenbool = true;
      // fullscreen.innerHTML = "<span class='butt' >&nbsp;&nbsp;on&nbsp;&nbsp;</span>";
}

else{
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
      fullscreenbool = false;
      // fullscreen.innerHTML = "<span class='butt' >&nbsp;&nbsp;off&nbsp;&nbsp;</span>";

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
        UpdateBackgroundName();
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




var player;

function playYoutubePlaylist() {
        //window.alert(videoPlaylistName);

        //playlistName = "My Playlist";
        //title.innerHTML ="// jeem-fm&nbsp;";
        //title.innerHTML = "<a href='"+location.reload();+"'target='_blank'>// jeem-fm</a>";
        //console.log(videoPlaylistName);
        player = new YT.Player('bg-youtube', {
          height: '360',
          width: '640',
          playerVars: 
          {
            autoplay: 1,
            controls: 0,
            loop: 1,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
            listType:'playlist',
            list: playlistName,
            // list: 'PLnNfLjvDzk1CTMebS0ADSyK91Fby8vFgf', oow
            // list: 'PLZAH1CMN7BNTQfor1FzJ018CRE2DBLSVp',//blogwave
            index: youtubeIndex
          },
                  events: {
            'onReady': onPlayerReadyPlaylist,
            'onStateChange': onPlayerStateChange
        }
        });
}

function playYoutubeVideo() {
    // var myVideoId = youtubes[0];
    //var myVideoId = "UL98fEff8yY";
    //myVideoName = "PLZAH1CMN7BNTQfor1FzJ018CRE2DBLSVp";
    var ctrlq = document.getElementById("bg-youtube");
        console.log(playlistName);

    player = new YT.Player('bg-youtube', {
        height: '360',
        width: '640',
        videoId: playlistName,
        playerVars: {
            autoplay: 1,
            controls: 0,
            loop: 1,
            disablekb: 1,
            fs: 0,
            iv_load_policy: 3,
            modestbranding: 1,
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
    // UpdateTrackNumber();
    // UpdateUI();
}


function doPopup() {
  var popup = document.getElementById("myPopup");
  popup.classList.toggle("show");
}

function onPlayerReadyPlaylist(event) {

    player.setPlaybackQuality("hd1080");
    player.setVolume(100);
    event.target.playVideo();
    player.playVideo();
    videosInPlaylist = player.getPlaylist();
    //console.log(videosInPlaylist);
    if (videosInPlaylist != null){
        playerReady = true;
        if (starting == true){
            doStart();
        }
    }
    else{
        singleVideo = true;
        playYoutubeVideo();
        console.log("switching to youtube");

    }
    // else{
    //     console.log("invalid ID");
    //     start.innerHTML = "<div class=\"video-submit\">Enter Playlist URL or ID: <br><br>Invalid ID!</div>";
    //     location.reload();
    //     //alert("invalid ID");
    // }
}//PLZAH1CMN7BNTA0BOgOJLOHIFIAitFYYy0

function onPlayerReady(event) {
    console.log (playlistName);
    player.setPlaybackQuality("hd1080");
    player.setVolume(100);
    event.target.playVideo();
    player.playVideo();
    if (player.getVideoUrl() != null){
                console.log("youtube");

        playerReady = true;
        if (starting == true){
            doStart();
        }
    }
    else{
        console.log("invalid ID");
        // document.getElementById('video-playlist-entry').value = "Invalid ID";
        start.innerHTML = "<div class=\"video-submit\">Enter Playlist URL or ID: <br><br>Invalid ID!</div>";
        location.reload();
        //alert("invalid ID");
    }
}

function onPlayerStateChange(event) {
        if (event.data == YT.PlayerState.BUFFERING) {
        event.target.setPlaybackQuality('hd1080');
    }
}

function updateProgressValue() {
    if (starting == false && playerReady == true){
        UpdateTrackNumber();
        UpdateUI();
    }

    
};  

function submitVideoPlaylistName(){
    videoPlaylistName = document.getElementById('video-playlist-entry').value;
    //start.innerHTML = "<div class=\"video-submit\">Enter Playlist URL or ID: <br><br><i class=\"fas fa-spinner fa-pulse\"></div>";
    start.innerHTML = "<div class=\"start\" id=\"start\">Enter Playlist URL or ID: <br><br><i class=\"fas fa-spinner fa-pulse\"></i></div>";
    if (videoPlaylistName.includes("https://www.youtube.com/playlist?list=")){
        videoPlaylistNameClean = videoPlaylistName.replaceAll('https://www.youtube.com/playlist?list=','');
    }
    else if (videoPlaylistName.includes("https://youtu.be")){
        videoPlaylistNameClean = videoPlaylistName.replaceAll('https://youtu.be/','');
    }
    else {
        videoPlaylistNameClean = videoPlaylistName;
    }
    doVideoPlaylistName();
}



function submitVideoName(){
    videoName = document.getElementById('video-entry').value;
    //window.alert(videoName);
    if (videoName.includes("https://www.youtube.com/watch?v=")){
        videoNameClean = videoName.replaceAll('https://www.youtube.com/watch?v=','');
    }
    else if (videoName.includes("https://youtu.be")){
        videoNameClean = videoName.replaceAll('https://youtu.be/','');
    }
    else {
        videoNameClean = videoName;
        // document.getElementById("videoname").value = "";
        // document.getElementById("videoname").placeholder = "Enter your own Youtube URL...";
        // videobox.className = 'videobox';
    }
    doVideoName();
}


function doVideoPlaylistName(){
        playlistName = videoPlaylistNameClean;
        playYoutubePlaylist();
}

function doVideoName(){
        myVideoName = videoNameClean;
        singleVideo = true;
        playYoutubeVideo();
}
 
function doStart(){
        document.getElementById("start-container").style.display="none";
        backgroundName.style.display="none";
        document.getElementById("song-container").style.display="block";
        if (singleVideo == true)
        {
            genreNumberPrev.style.display="none";
            genreNumber.style.display="none";
            genreNumberNext.style.display="none";
        }
        loadBackgroundType();
        loadAuto();
        //changeBackground();
        UpdateBackgroundName();
        UpdateUI();
        starting = false;
}

var justHidden = false;
var j;target="_blank";

function hideCursor() {
  document.body.style.cursor = "none";
    songContainer.className = 'song-container fadeout';
    startContainer.className = 'start-container fadeout';
    titleContainer.className = 'title-container fadeout';
  justHidden = true;
  setTimeout(function() {
    justHidden = false;
  }, 500);
}

function showCursor() {
  if (!justHidden) {
    justHidden = false;

    clearTimeout(j);
    document.body.style.cursor = "default";
        songContainer.className = 'song-container fadein';
    startContainer.className = 'start-container fadein';
    titleContainer.className = 'title-container fadein';
    j = setTimeout(hideCursor, fadeTime);
  }
};
