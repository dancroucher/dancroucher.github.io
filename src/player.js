
const songName = document.getElementById('song-name'); // element where track name appears
const songAuthor = document.getElementById('song-author'); // element where track artist appears
const songURL = document.getElementById('song-url'); // element where track url appears
// const genre = document.querySelector('.genre-name'); // 
const info = document.querySelector('.info'); // background display type
const backgroundType = document.getElementById('background-type'); // type of background
const backgroundName = document.getElementById('background-name'); // filename of background
const backgroundAuto = document.getElementById('background-auto'); // background auto change or not
const mp4background =  document.getElementById('mp4-background');
const gifbackground =  document.getElementById('gif-background');

const videobox = document.getElementById('videoname');
const song = document.querySelector('#song'); // audio object
const genreName = document.getElementById('genre-name');
const genreNumber = document.getElementById('genre-number');
const genrePlaylist = document.getElementById('genre-playlist');
const startContainer = document.getElementById('start-container');
const start = document.getElementById('start');
const songContainer = document.getElementById('song-container');
const infoContainer = document.getElementById('info-container');
const titleContainer = document.getElementById('title-container');
const soundcloudContainer = document.getElementById('soundcloud-container');
const infoButton = document.querySelector('.info-button'); // background display type
const fullscreen = document.querySelector('.fullscreen');
const title = document.getElementById('title'); // page/site title
const songTitle = document.querySelector('.song-title'); // element where track title appears
const bgTitle = document.querySelector('.bg-title'); // element where track title appears
const controlsImage = document.getElementById('bottom');
const bgmp4 = document.getElementById('bg-mp4');
const bggif = document.getElementById('bg-gif');
const bgyt = document.getElementById('bg-youtube');
const bgsc = document.getElementById('bg-sc');
var totalSoundcloudTracks;
var currentSoundcloudTrack;
var elem = document.documentElement;
var fullscreenbool = false;
var auto = false;
var autoTypeName;
var infoOpen = true;
var cursor = true;
var autoTypeName;
var youtubeList_all = "assets/lists/all.txt";
var soundcloudList = "assets/lists/sc.txt";
var youtubeList_lofi = "assets/lists/lofi.txt";
var youtubeList_synth = "assets/lists/synthwave.txt";
var youtubeList_game = "assets/lists/game.txt";
var youtubeList_tdnb = "assets/lists/tdnb.txt";
var youtubeList_none = "assets/lists/none.txt";
var fauxInput = document.createElement('textarea');
var videoName;
var mp4List = "assets/lists/videos_vid.txt";
var gifList = "assets/lists/videos_gif.txt";
var videoNameClean;
let pPause = document.querySelector('#play-pause'); // element where play and pause image appears
var player;
var youtubes = [];
var soundclouds = [];
var gifbackgrounds = [];
var mp4backgrounds = [];
var backtypes = [0,1,2];
var bgTypeIndex;
var genretypes = [0,1];
var genreIndex;
var fadeTime = 3750;

let playing = false;
let starting = true;

var iframeElement   = document.querySelector('iframe');
var iframeElementID = iframeElement.id;
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
    getGifBackgrounds(); 
    loadBackgroundType();
    loadGenreType();
}

//landing screen
document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function(){
    //mp4background.play();
    start.innerHTML = "Click / tap anywhere to start";
    backgroundAuto.style.display="none";
    }, 0);
}, false);

function playPause() {
    if (playing == false) {
        playing = true;
        if (genreIndex == 0){
            //player.playVideo();
        }
        else if (genreIndex == 1){
            toggleSoundcloud();
        }
        UpdateUI();
        if (starting == false){
            mp4background.play();
        }
    }
    else if (playing == true) {
        playing = false;
        if (genreIndex == 0){
           // player.pauseVideo();
        }
        else if (genreIndex == 1){
            console.log(genreIndex);
            toggleSoundcloud();
        }
        UpdateUI();
        mp4background.pause();
    }
    if (starting == true){
        document.getElementById("start-container").style.display="none";
        document.getElementById("song-container").style.display="block";
        //getYoutubes();
        mp4background.play();
        //loadAuto();
        UpdateUI();
        loadGenreType();
        starting = false;
    }
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
            player.loadVideoById(youtubes[youtubeIndex]);
            UpdateTrackNumber();
            //playPause(); // for some reason this hides the space to start
        }
    }
    xmlhttp.open("GET", youtubeList_synth, true);
    xmlhttp.send();
}

function getSoundcloud() {
    var xmlhttp;
    if (window.XMLHttpRequest) { // code for IE7+, Firefox, Chrome, Opera, Safari
        xmlhttp = new XMLHttpRequest();
    } else { // code for IE6, IE5
        xmlhttp = new ActiveXObject("Microsoft.XMLHTTP");
    }
    xmlhttp.onreadystatechange = function() {
        if (xmlhttp.readyState == 4 && xmlhttp.status == 200) {
            var text = xmlhttp.responseText;
            //add url stuff
            var textclean = text.replaceAll('soundcloud.com','https://w.soundcloud.com/player/?url=https%3A//soundcloud.com');
            // Now convert it into array using regex
            var soundclouds = textclean.split(", ");
            soundcloudIndex = 1;
            //console.log(soundclouds);
            bgsc.src = soundclouds[soundcloudIndex];
            widget         = SC.Widget(iframeElement);
            if (localStorage.getItem('soundcloudtrack') == null){
                currentSoundcloudTrack = 1;
            }
            else
            {
                currentSoundcloudTrack = localStorage.getItem('soundcloudtrack');
                
            //console.log (currentSoundcloudTrack);
            }
            UpdateTrackNumber();
        }
    }
    xmlhttp.open("GET", soundcloudList, true);
    xmlhttp.send();
}

function skipSoundcloud(){
    widget.toggle();
    widget.skip(currentSoundcloudTrack);
    widget.getCurrentSound(function(currentSound) {
        songName.innerHTML = "<a href='"+currentSound.permalink_url+"'target='_blank'>"+currentSound.title+"</a>";
        songAuthor.innerHTML = currentSound.user.username;
        //genrePlaylist.innerHTML = currentSound.collection.track_count;

    });
}

function toggleSoundcloud(){
    widget.toggle();
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
            //toggleAuto();
        }
        else if(e.keyCode == 70){//f key
            doFullscreen();
        }
        else if(e.keyCode == 73){//i key
            doPopup();
        }
        else if(e.keyCode == 80){//P keypress
            changeGenreType();
        }
        else if(e.keyCode == 187){//= key
            clearData();
        }
    }
}





function checkVideoName(){
    var videoName = document.getElementById("videoname").value;
    
    if (videoName == null){
        videobox.className = 'videobox';
    }
    if (videoName.includes("https://www.youtube.com/watch?v=")){
        videoNameClean = videoName.replaceAll('https://www.youtube.com/watch?v=','');
        console.log("OK!!!!!!");
        videobox.className = 'videobox-ok';
    }
    else if (videoName.includes("https://youtu.be")){
        videoNameClean = videoName.replaceAll('https://youtu.be/','');
        console.log("OK!!!!!!");
        videobox.className = 'videobox-ok';
    }
    else {
        videobox.className = 'videobox-notok';
        console.log("NOT OK");
        // console.log(videoName);
    }
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
            mp4backgrounds = text.split(/\n|\r/g);
            mp4backgroundsMax = mp4backgrounds.length-1;
            mp4backgroundIndex = Math.floor(Math.random() * mp4backgroundsMax);
        }
    }
    xmlhttp.open("GET", mp4List, true);
    xmlhttp.send();
    console.log(mp4backgrounds);
}

function getGifBackgrounds() {
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
            gifbackgrounds = text.split(/\n|\r/g);
            gifbackgroundsMax = gifbackgrounds.length-1;
            gifbackgroundIndex = Math.floor(Math.random() * gifbackgroundsMax);
        }
    }
    xmlhttp.open("GET", gifList, true);
    xmlhttp.send()
}




function infoSlide() {
    if (infoOpen == true){
    //slide away
      setTimeout(function(){
            UpdateUI();
            infoContainer.className = 'info-container-out';
            infoButton.className = 'info-button-out';
            infoButton.innerHTML = "<span class='info-button-out' id='info-button' onclick='infoSlide()'><i class='far fa-question-circle'></i></span>";
            //term.classList.remove('term-focus');
        }, 0);
        setTimeout(function(){ 
            infoContainer.className = 'info-container fadeout';
            infoButton.className = 'info-button';
            infoOpen = false;
        }, 1000);
    }
    else {
    //slide open
      setTimeout(function(){
            UpdateUI();
            infoContainer.className = 'info-container-in';
            infoButton.className = 'info-button-in';
            infoButton.innerHTML = "<span class='info-button-in' id='info-button'onclick='infoSlide()'><i class='far fa-question-circle'></i></span>";
            infoOpen = true;
            //fauxInput.focus();
            //term.classList.add('term-focus');
        }, 0);
    }
}

function loadBackgroundType() {
    if (localStorage.getItem('backtype') == null){
      bgTypeIndex = 1;  
    }
    else{
        let myBackType = localStorage.getItem('backtype');
        bgTypeIndex = myBackType;
    }
    if (bgTypeIndex == 0){//none
        document.getElementById("bg-gif").style.display="block";
        document.getElementById("bg-mp4").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="none";
    }
    else if (bgTypeIndex == 1){//gif
        document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="inline-block";
        var text = gifbackgrounds[gifbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_gif/');
        mp4background.src = textclean;
    }

    else if (bgTypeIndex == 2){//video
        document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="inline-block";
        var text = mp4backgrounds[mp4backgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_vid/');
        mp4background.src = textclean;

    }
    localStorage.setItem('backtype', bgTypeIndex);
    localStorage.getItem('backtype');
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
    if (bgTypeIndex == 0){//none
        document.getElementById("bg-gif").style.display="block";
        document.getElementById("bg-mp4").style.display="none";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="none";
    }
    else if (bgTypeIndex == 1){//gif
        document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="inline-block";
        var text = gifbackgrounds[gifbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_gif/');
        mp4background.src = textclean;
    }

    else if (bgTypeIndex == 2){//video
        document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-mp4").style.display="block";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-youtube").style.display="none";
        document.getElementById("background-name").style.display="inline-block";
        var text = mp4backgrounds[mp4backgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_vid/');
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
        var str = mp4backgrounds[mp4backgroundIndex];
        // str = str.replace('.mp4','');
        str = str.replace('./assets/video_vid/','');
        str = str.replace('.mp4','');
        backgroundType.innerHTML = "<i class='fas fa-file-video'></i>&nbsp;mp4";
        backgroundName.innerHTML = str;
        backgroundAuto.innerHTML = autoTypeName;
    }
    else if (bgTypeIndex == 1){//gif
        var str = gifbackgrounds[gifbackgroundIndex];
        // str = str.replace('.mp4','');
        str = str.replace('./assets/video_gif/','');
        str = str.replace('.mp4','');
        backgroundType.innerHTML = "<i class='fas fa-file-image'></i>&nbsp;gif";
        backgroundName.innerHTML = str;
        backgroundAuto.innerHTML = autoTypeName;
    }
    // else if (bgTypeIndex == 3){//youtube
    //     backgroundType.innerHTML = "<i class='fas fa-palette'></i>&nbsp;YouTube";
    //     backgroundName.innerHTML = "";
    //     backgroundAuto.innerHTML = "";
    //}
    else if (bgTypeIndex == 0){//none
        backgroundType.innerHTML = "<i class='fas fa-file'></i>&nbsp;None";
        backgroundName.innerHTML = "---";
        backgroundAuto.innerHTML = "";
    }
}

function loadGenreType(){
    if (localStorage.getItem('playlist') == null){
      genreIndex = 0;  
    }
    else{
        let myPlaylist = localStorage.getItem('playlist');
        genreIndex = myPlaylist;
    }
    if (genreIndex == 0){//Youtube
        genreName.innerHTML = "<i class='fab fa-youtube'></i>&nbsp;YouTube";
        genreName.className = 'genre-name youtube';
        genrePlaylist.className = 'genre-playlist youtubep';
        youtubeList = youtubeList_all;
        document.getElementById("soundcloud-container").style.display="none";
        //changeBackground();
        UpdateUI();
        //getYoutubes();
    }
    // else if (genreIndex == 1){//synthwave
    //     youtubeList = youtubeList_synth;
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    // else if (genreIndex == 2){//game
    //     youtubeList = youtubeList_game;
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    // else if (genreIndex == 3){//techno and drum and bass
    //     youtubeList = youtubeList_tdnb;
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    else if (genreIndex == 1){//Soundcloud
        genreName.innerHTML = "<i class='fab fa-soundcloud'></i>&nbsp;Soundcloud";
        //youtubeList = youtubeList_none;
        genreName.className = 'genre-name sc';
        genrePlaylist.className = 'genre-playlist scp';
        // document.getElementById("genre-number").style.display="inline-block";
        document.getElementById("soundcloud-container").style.display="none";
        //changeBackground();
        //skipSoundcloud();
        //player.pauseVideo();
        UpdateUI();
        UpdateTrackNumber();
    }
    
}

function changeGenreType() {
    genreIndex++;
    if (genreIndex > genretypes.length-1) {
        genreIndex = 0;
    };
    if (genreIndex == 0){//Youtube
        genreName.innerHTML = "<i class='fab fa-youtube'></i>&nbsp;YouTube";
        genreName.className = 'genre-name youtube';
        genrePlaylist.className = 'genre-playlist youtubep';
        youtubeList = youtubeList_all;
        document.getElementById("soundcloud-container").style.display="none";
        changeBackground();
        toggleSoundcloud();
        UpdateUI();
        getYoutubes();
    }
    // else if (genreIndex == 1){//synthwave
    //     youtubeList = youtubeList_synth;
    //     console.log(localStorage.getItem('playlist'));
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    // else if (genreIndex == 2){//game
    //     youtubeList = youtubeList_game;
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    // else if (genreIndex == 3){//techno and drum and bass
    //     youtubeList = youtubeList_tdnb;
    //     document.getElementById("videoentry").style.display="none";
    //     document.getElementById("genre-number").style.display="inline-block";
    // }
    else if (genreIndex == 1){//Soundcloud
        genreName.innerHTML = "<i class='fab fa-soundcloud'></i>&nbsp;Soundcloud";
        youtubeList = youtubeList_none;
        genreName.className = 'genre-name sc';
        genrePlaylist.className = 'genre-playlist scp';
        // document.getElementById("genre-number").style.display="inline-block";
        document.getElementById("soundcloud-container").style.display="none";
        changeBackground();
        skipSoundcloud();
        player.pauseVideo();
        UpdateUI();
        UpdateTrackNumber();
    }
    localStorage.setItem('playlist', genreIndex);
    localStorage.getItem('playlist');
}

function UpdateGenreName() {
    // if (genreIndex == 0){//youtube
    //     genreName.innerHTML = "<i class='fab fa-youtube'></i>&nbsp;YouTube";

    // }
    // else if (genreIndex == 1){//soundcloud
    //     genreName.innerHTML = "<i class='fas fa-headphones'></i>&nbsp;Soundcloud";
    // }
    // else if (genreIndex == 2){//game
    //     genreName.innerHTML = "<i class='fas fa-headphones'></i>&nbsp;Videogame";
    // }
    // else if (genreIndex == 3){//hip hop
    //     genreName.innerHTML = "<i class='fas fa-headphones'></i>&nbsp;Techno and DnB";
    // }
    // else if (genreIndex == 4){//techno
    //     genreName.innerHTML = "<i class='fas fa-headphones'></i>&nbsp;Custom";
    // }
}

function UpdateTrackNumber(){
    if (genreIndex == 0){
        var trackNumber = parseInt(youtubeIndex, 10) + 1;
        genreNumber.innerHTML = "<i class='fas fa-list-ol'></i>&nbsp;"+(trackNumber)+"&nbsp;/&nbsp;"+youtubes.length;
    }
    else if (genreIndex == 1){
        widget.getSounds(function(currentSound) {
        totalSoundcloudTracks = currentSound.length;
        genreNumber.innerHTML = "<i class='fas fa-list-ol'></i>&nbsp;"+(parseInt(currentSoundcloudTrack)+1)+"&nbsp;/&nbsp;"+totalSoundcloudTracks;
            });
    }
}


function previousSong() {
    if (genreIndex == 0){
        youtubeIndex--;
        if (youtubeIndex < 0) {
            youtubeIndex = youtubes.length-1;
        }
        player.loadVideoById(youtubes[youtubeIndex]);
        localStorage.setItem('track', youtubeIndex);
        localStorage.getItem('track');
    }
    else if (genreIndex == 1){
        widget.prev();
        widget.seekTo(0);
        widget.getCurrentSound(function(currentSound) {
            //document.getElementById("currentTrack").innerHTML = currentSound.title;
                songName.innerHTML = "<a href='"+currentSound.permalink_url+"'target='_blank'>"+currentSound.title+"</a>";
                songAuthor.innerHTML = currentSound.user.username;
        });
        // if (currentSoundcloudTrack > 1){
        //     currentSoundcloudTrack--;
        // }
        widget.getCurrentSoundIndex(function(currentSoundIndex) {
            //document.getElementById("currentTrack").innerHTML = currentSound.title;
            localStorage.setItem('soundcloudtrack', currentSoundIndex);
            
            currentSoundcloudTrack = localStorage.getItem('soundcloudtrack');
            // console.log(localStorage.getItem('soundcloudtrack'));
        });

    }
    UpdateUI();
    UpdateTrackNumber();
}

function nextSong() {
    if (genreIndex == 0){
        youtubeIndex++;
        if (youtubeIndex > youtubes.length-1) {
            youtubeIndex = 0;
        }
        player.loadVideoById(youtubes[youtubeIndex]);
            localStorage.setItem('track', youtubeIndex);
            localStorage.getItem('track');
        }
    else if (genreIndex == 1){
        widget.next();
        widget.seekTo(0);
        widget.getCurrentSound(function(currentSound) {
            //document.getElementById("currentTrack").innerHTML = currentSound.title;
            songName.innerHTML = "<a href='"+currentSound.permalink_url+"'target='_blank'>"+currentSound.title+"</a>";
            songAuthor.innerHTML = currentSound.user.username;
        });
        // if (currentSoundcloudTrack < totalSoundcloudTracks){
        //      currentSoundcloudTrack++;
        // }
        widget.getCurrentSoundIndex(function(currentSoundIndex) {
            //document.getElementById("currentTrack").innerHTML = currentSound.title;
            localStorage.setItem('soundcloudtrack', currentSoundIndex);
            localStorage.getItem('soundcloudtrack');
            currentSoundcloudTrack = localStorage.getItem('soundcloudtrack');
            // console.log(localStorage.getItem('soundcloudtrack'));
        });
    }
    UpdateUI();
    UpdateTrackNumber();
}

// function randomSong(){
//     var currentIndex = youtubeIndex;
//     youtubeIndexMax = youtubes.length-1;
//     var n = Math.floor(Math.random() * youtubeIndexMax);
//     if (n >= currentIndex) n++;
//     youtubeIndex = n;
//     player.loadVideoById(youtubes[youtubeIndex]);
//     localStorage.setItem('track', youtubeIndex);
//     localStorage.getItem('track');
//     UpdateTrackNumber();
//     changeBackground();
//     UpdateUI(); 
// }

function clearData() {
    localStorage.clear();
}

function newBackground() {
    if ((bgTypeIndex == 2 || 1) && (auto == true)){
        changeBackground();
    }   
}

function loadBackground() {
    if (bgTypeIndex == 2){
        if (localStorage.getItem('background') == null){
            mp4backgroundIndex = 0;  
        }
        else
        {
            let myBackground = localStorage.getItem('background');
            mp4backgroundIndex = myBackground;
        }
        if (mp4backgroundIndex > mp4backgroundsMax) {
            mp4backgroundIndex = 0;
        };
        var text = mp4backgrounds[mp4backgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_vid/');
        mp4background.src = textclean;
    }
    else if (bgTypeIndex == 1){
        if (localStorage.getItem('background') == null){
            gifbackgroundIndex = 0;  
        }
        else
        {
            let myBackground = localStorage.getItem('background');
            gifbackgroundIndex = myBackground;
        }
        if (gifbackgroundIndex > gifbackgroundsMax) {
            gifbackgroundIndex = 0;
        };
        var text = gifbackgrounds[gifbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_gif/');
        mp4background.src = textclean;
    }
    localStorage.setItem('background', mp4backgroundIndex);
    localStorage.getItem('background');
    // UpdateUI();
    UpdateBackgroundName();
}

function changeBackground() {
    if (bgTypeIndex == 2){
        mp4backgroundIndex++;
        if (mp4backgroundIndex > mp4backgroundsMax) {
            mp4backgroundIndex = 0;
        };
        var text = mp4backgrounds[mp4backgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_vid/');
        mp4background.src = textclean;
        localStorage.setItem('background', mp4backgroundIndex);
    }
    else if (bgTypeIndex == 1){
        gifbackgroundIndex++;
        if (gifbackgroundIndex > gifbackgroundsMax) {
            gifbackgroundIndex = 0;
        };
        var text = gifbackgrounds[gifbackgroundIndex];
        var textclean = text.replace(/^/,'./assets/video_gif/');
        mp4background.src = textclean;
        localStorage.setItem('background', gifbackgroundIndex);
    }
    localStorage.getItem('background');
    UpdateBackgroundName();
}


function UpdateUI() {
  setTimeout(function(){
    songContainer.className = 'song-container fadein';
    startContainer.className = 'start-container fadein';
    titleContainer.className = 'title-container fadein';
    soundcloudContainer.className = 'soundcloud-container fadein';
    // if (infoContainer.className == 'info-container fadeout'){
    //     infoContainer.className = 'info-container fadein';
    // }
    }, 0);
    setTimeout(function(){ 
    songContainer.className = 'song-container fadeout';
    startContainer.className = 'start-container fadeout';
    titleContainer.className = 'title-container fadeout';
    soundcloudContainer.className = 'soundcloud-container fadeout';
    // if (infoContainer.className == 'info-container fadein'){
    //     infoContainer.className = 'info-container fadeout';
    // }
    }, 100);
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

//setInterval(updateProgressValue, 500);
//setInterval(newBackground, 5000);

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

    if (localStorage.getItem('auto') != null){
        if (localStorage.getItem('auto') == 1)
        {
            autoTypeName = "Autochange";
            backgroundAuto.style.display="inline-block";
            UpdateUI();
            UpdateBackgroundName();
            auto = true;
        }
    }
}

function toggleAuto() {
if (auto == false){
        autoTypeName = "Autochange";
        backgroundAuto.style.display="inline-block";
        UpdateUI();
        UpdateBackgroundName();
        auto = true;
        localStorage.setItem('auto', '1');
}

else{
        autoTypeName = "&nbsp;";
        backgroundAuto.style.display="none";
        UpdateUI();
        UpdateBackgroundName();
        auto = false;
        localStorage.setItem('auto', '0');
    }
}


// function updateAuto() {
//     if (auto == true) {
//         console.log(auto);
//         setInterval(newBackground, 5000);
//     }
// }

// a = autoDuration;
// function timer() {
//      console.log(a);
//     if (a < 1) {
//         console.log('bg change');
//         newBackground();
//         a = autoDuration;
//         return;
//     }
//     a -= 1;
// }





// setInterval(function() {
//         if (!playing){
//          backgroundIndex++;
//          if (backgroundIndex > backgroundsMax) {
//              backgroundIndex = 0;
//          };
//          background.src = backgrounds[backgroundIndex];
//
// }}, 4000);


// // Load the IFrame Player API code asynchronously.
// var tag = document.createElement('script');
// tag.src = "https://www.youtube.com/player_api";
// var firstScriptTag = document.getElementsByTagName('script')[0];
// firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var player;
function playYoutubeVideo() {
    var myVideoId = youtubes[0];
    var ctrlq = document.getElementById("bg-youtube");
    player = new YT.Player('bg-youtube', {
        height: '1080',
        width: '1920',
        videoId: myVideoId,
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
}

function togglePlayButton(play) {
    // document.getElementById("youtube-icon").src = play ? "https://i.imgur.com/IDzX9gL.png" : "https://i.imgur.com/quyUPXN.png";
}

function doPopup() {
  var popup = document.getElementById("myPopup");
  popup.classList.toggle("show");
}

function onPlayerReady(event) {
    player.setPlaybackQuality("hd1080");
    player.setVolume(100);
// document.getElementById("youtube-audio").style.display = "block";
    event.target.playVideo();
        player.playVideo();
        // console.log("playing");
  // UpdateUI();

    // togglePlayButton(player.getPlayerState() !== 5);
  // player.loadVideoById(youtubes[youtubeIndex]);

}

function onPlayerStateChange(event) {
        if (event.data == YT.PlayerState.BUFFERING) {
        event.target.setPlaybackQuality('hd1080');
    }
    // if (event.data === 0) {
    //     togglePlayButton(false);
    // }
}

function updateProgressValue() {
        var songTitle;
        var songChannel;
        if (genreIndex == 0){
            if (player.getVideoData().title == ""){
                songTitle = "";
                songChannel = "";
                document.getElementById("song-author").className = 'song-author-empty';
            }
            else{
                songTitle = player.getVideoData().title;
                // songURL.innerHTML = "<a href='"+player.getVideoUrl()+"'target='_blank'>"+youtubes[youtubeIndex]+"</a>"; 
                songChannel = player.getVideoData().author;
                document.getElementById("song-author").className = 'song-author';
            }
            songName.innerHTML ="<a href='"+player.getVideoUrl()+"'target='_blank'>"+songTitle+"</a>" ;
            songAuthor.innerHTML = songChannel;
            genrePlaylist.innerHTML = songChannel;

        }
        else if (genreIndex ==1){
            document.getElementById("song-author").className = 'song-author';
        }
        songAuthor.innerHTML ="<a href='"+player.getVideoUrl()+"'target='_blank'>"+player.getVideoData().author+"</a>";

};  

function submitVideoName(){
    videoName = document.getElementById("videoname").value;
    if (videoName.includes("https://www.youtube.com/watch?v=")){
        videoNameClean = videoName.replaceAll('https://www.youtube.com/watch?v=','');
        doVideoName();
    }
    else if (videoName.includes("https://youtu.be")){
        videoNameClean = videoName.replaceAll('https://youtu.be/','');
        doVideoName();
    }
    else {
        document.getElementById("videoname").value = "";
        document.getElementById("videoname").placeholder = "Enter your own Youtube URL...";
        videobox.className = 'videobox';
    }
}

function doVideoName(){
        console.log(videoNameClean);
        player.loadVideoById(videoNameClean);
        //force YT
        bgTypeIndex=3;
        //backType = backtypes[bgTypeIndex];
        // info.innerHTML = "<span class='butt' onclick='changeBackgroundType()'>youtube</span>";
        document.getElementById("bg-start").style.display="none";
        document.getElementById("bg-gif").style.display="none";
        document.getElementById("bg-mp4").style.display="none";
        document.getElementById("bg-youtube").style.display="block";
        UpdateUI();
        playing = true;
        document.getElementById("videoname").value = "";
        document.getElementById("videoname").placeholder = "Enter your own Youtube URL...";
        document.getElementById('videoname').blur();
        UpdateBackgroundName();
        UpdateUI();
        
}

var justHidden = false;
var j;target="_blank";

function hideCursor() {
  document.body.style.cursor = "none";
  justHidden = true;
  // console.log('hide');
  setTimeout(function() {
    justHidden = false;
  }, 500);
}

function showCursor() {
  if (!justHidden) {
    justHidden = false;

    clearTimeout(j);
    document.body.style.cursor = "default";
    j = setTimeout(hideCursor, fadeTime);
  }
};

//terminal code

// function fauxTerm(config) {
  
//   var term = config.el || document.getElementById('term');
//   var termBuffer = config.initialMessage || "      _                       ___        \n     (_)___  ___  __ _  ____ / _/__ _\n    / // -_)/ -_)/  ' \\/___// _//  ' \\\n __/ / \\__/ \\__//_/_/_/    /_/ /_/_/_/\n|___/                                 \n\njeem-fm terminal, type 'help' for a list of commands\n";
//   var lineBuffer = config.initialLine || ''
//   var cwd = config.cwd || "~/";
//   var tags = config.tags || ['red', 'blue', 'white', 'bold'];
//   var processCommand = config.cmd || false;
//   var maxBufferLength = config.maxBufferLength || 8192;
//   var commandHistory = [];
//   var currentCommandIndex = -1;
//   var maxCommandHistory = config.maxCommandHistory || 100;
//   var autoFocus = config.autoFocus || false;
//   var coreCmds = {
//     "clear": clear
//   };
  
  
//   fauxInput.className = "faux-input";
//   document.body.appendChild(fauxInput);
//   if ( autoFocus ) {
//     fauxInput.focus();
//   }


//   function getLeader() {
//     return cwd + "$ ";
//   }

//   function renderTerm() {
//     var bell = '<span class="bell"></span>';
//     var ob = termBuffer + getLeader() + lineBuffer;
//     term.innerHTML = ob;
//     term.innerHTML += bell;
//     term.scrollTop = term.scrollHeight;
//   }
  
//   function writeToBuffer(str) {
//     termBuffer += str;
    
//     //Stop the buffer getting massive.
//     if ( termBuffer.length > maxBufferLength ) {
//       var diff = termBuffer.length - maxBufferLength;
//       termBuffer = termBuffer.substr(diff);
//     }
    
//   }
  
//   function renderStdOut(str) {
//     var i = 0, max = tags.length;
//     for ( i; i<max; i++ ) {
//       var start = new RegExp('{' + tags[i] + '}', 'g');
//       var end = new RegExp('{/' + tags[i] + '}', 'g');
//       str = str.replace(start, '<span class="' + tags[i] + '">');
//       str = str.replace(end, '</span>');
//     }
//     return str;
//   }
  
//   function clear(argv, argc) {
//     termBuffer = "";
//     return "";
//   }
  
//   function isCoreCommand(line) {
//     if ( coreCmds.hasOwnProperty(line) ) {
//       return true;
//     }
//     return false;
//   }
  
//   function coreCommand(argv, argc) {
    
//     var cmd = argv[0];
//     return coreCmds[cmd](argv, argc);
    
//   }

//   function processLine() {
    
//     //Dispatch command
//     var stdout, line = lineBuffer, argv = line.split(" "), argc = argv.length;
    
//     var cmd = argv[0];
    
//     lineBuffer += "\n";
//     writeToBuffer( getLeader() + lineBuffer );
//     lineBuffer = "";
     
//     //If it's not a blank line.
//     if ( cmd !== "" ) {
      
//       //If the command is not registered by the core.
//       if ( !isCoreCommand(cmd) ) {
        
//         //User registered command
//         if ( processCommand ) {
//           stdout = processCommand(argv,argc);
//         } else {
//           stdout = "{white}{bold}" + cmd + "{/bold}{/white}: command not found\n";
//         }
//       } else {
//         //Execute a core command
//         stdout = coreCommand(argv,argc);
//       }

//       //If an actual command happened.
//       if ( stdout === false ) {
//         stdout = "{white}{bold}" + cmd + "{/bold}{/white}: command not found\n";
//       }
    
//       stdout = renderStdOut(stdout);
//       writeToBuffer(stdout);
      
//       addLineToHistory(line);
    
//     }

//     renderTerm();
//   }
  
//   function addLineToHistory(line) {
//     commandHistory.unshift( line );
//     currentCommandIndex = -1;
//     if ( commandHistory.length > maxCommandHistory ) {
//       console.log('reducing command history size');
//       console.log(commandHistory.length);
//       var diff = commandHistory.length - maxCommandHistory;
//       commandHistory.splice(commandHistory.length -1, diff);
//       console.log(commandHistory.length);
//     }
//   }
  
//   function isInputKey(keyCode) {
//     var inputKeyMap = [32,190,192,189,187,220,221,219,222,186,188,191];
//     if ( inputKeyMap.indexOf(keyCode) > -1 ) {
//       return true;
//     }
//     return false;
//   }
  
//   function toggleCommandHistory(direction) {
    
//     var max = commandHistory.length -1;
//     var newIndex = currentCommandIndex + direction;
    
//     if ( newIndex < -1 ) newIndex = -1;
//     if ( newIndex >= commandHistory.length) newIndex = commandHistory.length -1;
    
//     if ( newIndex !== currentCommandIndex ) {
//       currentCommandIndex = newIndex;
//     }
    
//     if ( newIndex > -1 ) {
//       //Change line to something from history.
//       lineBuffer = commandHistory[newIndex];
//     } else {
//       //Blank line...
//       lineBuffer = "";
//     }
    
    
//   }

//   function acceptInput(e) {
//     e.preventDefault();
    
//      fauxInput.value = "";
    
//     if ( e.keyCode >= 48 && e.keyCode <= 90 || isInputKey(e.keyCode) ) {
//       if (! e.ctrlKey ) {
//         //Character input
//         lineBuffer += e.key;
//       } else {
//         //Hot key input? I.e Ctrl+C
//       }
//     } else if ( e.keyCode === 13 ) {
//       processLine();
//     } else if ( e.keyCode === 9 ) {
//       lineBuffer += "\t";
//     } else if ( e.keyCode === 38 ) {
//       toggleCommandHistory(1);
//     } else if ( e.keyCode === 40 ) {
//       toggleCommandHistory(-1);
//     }
//     else if ( e.key === "Backspace" ) {
//       lineBuffer = lineBuffer.substr(0, lineBuffer.length -1);
//     }

//     renderTerm();
//   }

//   term.addEventListener('click', function(e){
//     fauxInput.focus();
//     term.classList.add('term-focus');
//   });
//   fauxInput.addEventListener('keydown', acceptInput);
//   fauxInput.addEventListener('blur', function(e){
//     term.classList.remove('term-focus');
//   });
//   renderTerm();
  
// } 
//     var myTerm = new fauxTerm({
//       el: document.getElementById('term'),
//       autoFocus: false,
//       cwd: "jeem-fm:~ user",
//       tags: ['red', 'green', 'yellow', 'bold'],
//       maxBufferLength: 8192,
//       maxCommandHistory: 50,
//       cmd: function(argv, argc) {
      
//         if (argv[0] == "help"){
//           var buffer = "\n{yellow}keys{/yellow} [show keyboard controls]\n{yellow}play {youtube url}{/yellow} [play any youtube video]\n{yellow}info{/yellow} [show playlists and background types]\n{yellow}credits{/yellow} [show attributions]\n\n"
//         }
//         else if (argv[0] == "keys"){
//           var buffer = "\n{yellow}Space{/yellow} [Play / Pause]\n{yellow}Left/Right{/yellow} [Change Track]\n{yellow}X{/yellow} [Change Background Type]\n{yellow}B{/yellow} [New Background]\n{yellow}P{/yellow} [Change Playlist]\n{yellow}A{/yellow} [Toggle Background Autochange]\n{yellow}F{/yellow} [Fullscreen]\n\n"
//         }
//         else if (argv[0] == "credits"){
//           nextSong();
//           var buffer = "Credits go here\n\n";
//         }
//         else if ((argv[0] == "info")){
//           playPause();
//           var buffer = "Info Goes Here\n\n";
//         }
//         else{
//           var buffer = "{red}Command not found{/red}\n";
//         }


//         // var buffer = "Triggered for command {bold}" + argv[0] + "{/bold}\n";
//         // if ( argc > 1 ) {
//         //   buffer += "Args: ";
//         //   for ( var i=1; i<argc; i++ ) {
//         //     buffer += argv[i] + " ";
//         //   }
//         //   buffer += "\n";
//         // }

//         // buffer += "Here is a nice {red}shiny{/red} string {green}using{/green} tags for styling.\n";
//         // buffer += "Try using the up and down arrows, or typing 'clear' and pressing enter\n";

//         return buffer;
      
//       }
//     });