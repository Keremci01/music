const songs = [
  {
    title: "Ballade",
    artist: "Nicolas Berthe",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["SI","LA","SI","SOL","SI","LA","SOL","SOL","LA","SI","SOL","SI","LA","SOL"]
  },
  {
    title: "Simple Tune",
    artist: "Unknown",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["SOL","LA","SI","LA","SOL"]
  },
  {
    title: "Melody 1",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["DO","RE","MI","RE","DO","RE","MI","FA","MI"]
  },
  {
    title: "Melody 2",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["MI","FA","SOL","FA","MI","RE","DO"]
  },
  {
    title: "Piano Flow",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["DO","MI","SOL","SI","SOL","MI","DO"]
  },
  {
    title: "Soft Ballad",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["LA","SI","DO","SI","LA","SOL","LA"]
  },
  {
    title: "Dream Notes",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["FA","SOL","LA","SOL","FA","MI","RE"]
  },
  {
    title: "Dark Melody",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["MI","RE","DO","RE","MI","FA","MI"]
  },
  {
    title: "Classic Touch",
    artist: "Toni Gallart",
    image: "https://i.imgur.com/7s4R8wE.png",
    notes: ["DO","DO","SOL","SOL","LA","LA","SOL"]
  }
];

const songList = document.getElementById("songList");
const search = document.getElementById("search");
const artistFilter = document.getElementById("artistFilter");

const player = document.getElementById("player");
const songTitle = document.getElementById("songTitle");
const songArtist = document.getElementById("songArtist");
const notesContainer = document.getElementById("notesContainer");
const playBtn = document.getElementById("playBtn");
const statusText = document.getElementById("statusText");
const sheetWrap = document.getElementById("sheetWrap");
const sheetImage = document.getElementById("sheetImage");

let currentSong = null;
let isPlaying = false;
let currentIndex = 0;
let audioContext = null;
let analyser = null;
let microphoneSource = null;
let mediaStream = null;
let detectionInterval = null;
let wrongLocked = false;

const NOTE_FREQ = {
  "DO": 261.63,
  "RE": 293.66,
  "MI": 329.63,
  "FA": 349.23,
  "SOL": 392.00,
  "LA": 440.00,
  "SI": 493.88
};

function loadArtists() {
  const artists = [...new Set(songs.map(s => s.artist))];
  artists.forEach(artist => {
    const opt = document.createElement("option");
    opt.value = artist;
    opt.textContent = artist;
    artistFilter.appendChild(opt);
  });
}

function renderSongs() {
  songList.innerHTML = "";

  const query = search.value.toLowerCase().trim();
  const artist = artistFilter.value;

  const filteredSongs = songs.filter(song => {
    return song.title.toLowerCase().includes(query) &&
      (artist === "" || song.artist === artist);
  });

  filteredSongs.forEach(song => {
    const div = document.createElement("div");
    div.className = "song";
    div.textContent = `${song.title} - ${song.artist}`;
    div.addEventListener("click", () => openSong(song));
    songList.appendChild(div);
  });
}

function openSong(song) {
  stopDetection();

  currentSong = song;
  isPlaying = false;
  currentIndex = 0;
  wrongLocked = false;

  player.classList.remove("hidden");
  songTitle.textContent = song.title;
  songArtist.textContent = song.artist;
  statusText.textContent = "Hazır";
  playBtn.textContent = "▶ Play";
  playBtn.disabled = false;

  sheetWrap.classList.add("hidden");
  notesContainer.classList.add("hidden");
  notesContainer.innerHTML = "";

  song.notes.forEach(note => {
    const span = document.createElement("span");
    span.className = "note";
    span.textContent = note;
    notesContainer.appendChild(span);
  });
}

async function startSession() {
  if (!currentSong || isPlaying) return;

  try {
    playBtn.disabled = true;
    statusText.textContent = "Mikrofon izni bekleniyor...";

    await setupMicrophone();

    isPlaying = true;
    currentIndex = 0;
    wrongLocked = false;

    playBtn.textContent = "Çalıyor...";
    statusText.textContent = `Şimdi çal: ${currentSong.notes[currentIndex]}`;

    if (currentSong.image) {
      sheetImage.src = currentSong.image;
      sheetWrap.classList.remove("hidden");
    }

    notesContainer.classList.remove("hidden");
    resetAllNoteStates();
    setActiveNote(currentIndex);
    startDetectionLoop();
  } catch (error) {
    console.error(error);
    statusText.textContent = "Mikrofon erişimi verilmedi ya da desteklenmiyor.";
    playBtn.textContent = "▶ Play";
  } finally {
    playBtn.disabled = false;
  }
}

function resetAllNoteStates() {
  const noteEls = document.querySelectorAll(".note");
  noteEls.forEach(el => {
    el.classList.remove("active", "correct", "wrong");
  });
}

function setActiveNote(index) {
  const noteEls = document.querySelectorAll(".note");
  noteEls.forEach(el => el.classList.remove("active"));
  if (noteEls[index]) {
    noteEls[index].classList.add("active");
  }
}

function markCorrect(index) {
  const noteEls = document.querySelectorAll(".note");
  if (!noteEls[index]) return;
  noteEls[index].classList.remove("active", "wrong");
  noteEls[index].classList.add("correct");
}

function markWrong(index) {
  const noteEls = document.querySelectorAll(".note");
  if (!noteEls[index]) return;
  noteEls[index].classList.remove("correct");
  noteEls[index].classList.add("wrong");
}

function clearWrong(index) {
  const noteEls = document.querySelectorAll(".note");
  if (!noteEls[index]) return;
  noteEls[index].classList.remove("wrong");
  noteEls[index].classList.add("active");
}

async function setupMicrophone() {
  if (mediaStream && audioContext && analyser) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  await audioContext.resume();

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  microphoneSource = audioContext.createMediaStreamSource(mediaStream);
  microphoneSource.connect(analyser);
}

function startDetectionLoop() {
  stopDetection();

  detectionInterval = setInterval(() => {
    if (!isPlaying || !currentSong) return;

    const detectedFreq = detectPitch();
    if (!detectedFreq) return;

    const playedNote = freqToNoteName(detectedFreq);
    const expectedNote = currentSong.notes[currentIndex];

    if (!playedNote || !expectedNote) return;

    if (playedNote === expectedNote) {
      wrongLocked = false;
      markCorrect(currentIndex);
      currentIndex++;

      if (currentIndex >= currentSong.notes.length) {
        finishSong();
        return;
      }

      setActiveNote(currentIndex);
      statusText.textContent = `Doğru. Şimdi çal: ${currentSong.notes[currentIndex]}`;
    } else {
      if (wrongLocked) return;
      wrongLocked = true;

      markWrong(currentIndex);
      statusText.textContent = `Yanlış nota. Beklenen: ${expectedNote}, algılanan: ${playedNote}`;
      playWrongSound();

      setTimeout(() => {
        if (!isPlaying) return;
        clearWrong(currentIndex);
        wrongLocked = false;
      }, 350);
    }
  }, 140);
}

function stopDetection() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
}

function finishSong() {
  isPlaying = false;
  stopDetection();
  playBtn.textContent = "▶ Play";
  statusText.textContent = "Bitti. Tekrar çalabilirsin.";
}

function detectPitch() {
  if (!analyser || !audioContext) return null;

  const bufferLength = analyser.fftSize;
  const buffer = new Float32Array(bufferLength);
  analyser.getFloatTimeDomainData(buffer);

  let rms = 0;
  for (let i = 0; i < buffer.length; i++) {
    rms += buffer[i] * buffer[i];
  }
  rms = Math.sqrt(rms / buffer.length);

  if (rms < 0.01) return null;

  return autoCorrelate(buffer, audioContext.sampleRate);
}

function autoCorrelate(buffer, sampleRate) {
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minSamples = Math.floor(sampleRate / 1000);
  const maxSamples = Math.floor(sampleRate / 80);

  for (let offset = minSamples; offset <= maxSamples; offset++) {
    let correlation = 0;

    for (let i = 0; i < buffer.length - offset; i++) {
      correlation += 1 - Math.abs(buffer[i] - buffer[i + offset]);
    }

    correlation = correlation / (buffer.length - offset);

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestCorrelation > 0.88 && bestOffset !== -1) {
    return sampleRate / bestOffset;
  }

  return null;
}

function freqToNoteName(freq) {
  let closestNote = null;
  let smallestDiff = Infinity;

  for (const [note, targetFreq] of Object.entries(NOTE_FREQ)) {
    const diff = Math.abs(freq - targetFreq);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestNote = note;
    }
  }

  if (smallestDiff <= 18) return closestNote;
  return null;
}

function playWrongSound() {
  if (!audioContext) return;

  const osc = audioContext.createOscillator();
  const gain = audioContext.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(110, audioContext.currentTime);

  gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.35);

  osc.connect(gain);
  gain.connect(audioContext.destination);

  osc.start();
  osc.stop(audioContext.currentTime + 0.36);
}

playBtn.addEventListener("click", startSession);
search.addEventListener("input", renderSongs);
artistFilter.addEventListener("change", renderSongs);

loadArtists();
renderSongs();
