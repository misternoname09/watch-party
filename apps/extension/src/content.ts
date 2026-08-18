let isSyncing = false;
let attachedVideo: HTMLVideoElement | null = null;

const LOG_PREFIX = '[WatchParty]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args: unknown[]) {
  console.warn(LOG_PREFIX, ...args);
}

// Function to find the Netflix video element
function getVideoElement(): HTMLVideoElement | null {
  return document.querySelector('video');
}

function detachListeners() {
  if (attachedVideo) {
    log('Detaching listeners from previous video element.');
    attachedVideo.removeEventListener('play', onPlay);
    attachedVideo.removeEventListener('pause', onPause);
    attachedVideo.removeEventListener('seeked', onSeeked);
    attachedVideo = null;
  }
}

function onPlay() {
  if (isSyncing || !attachedVideo) return;
  log('play event — currentTime:', attachedVideo.currentTime);
  chrome.runtime.sendMessage({
    type: 'LOCAL_PLAYER_UPDATE',
    state: { isPlaying: true, currentTime: attachedVideo.currentTime }
  });
}

function onPause() {
  if (isSyncing || !attachedVideo) return;
  log('pause event — currentTime:', attachedVideo.currentTime);
  chrome.runtime.sendMessage({
    type: 'LOCAL_PLAYER_UPDATE',
    state: { isPlaying: false, currentTime: attachedVideo.currentTime }
  });
}

function onSeeked() {
  if (isSyncing || !attachedVideo) return;
  log('seeked event — currentTime:', attachedVideo.currentTime);
  chrome.runtime.sendMessage({
    type: 'LOCAL_PLAYER_UPDATE',
    state: { isPlaying: !attachedVideo.paused, currentTime: attachedVideo.currentTime }
  });
}

function attachListeners() {
  const video = getVideoElement();
  if (!video) return;

  // Already attached to this exact element
  if (video === attachedVideo) return;

  // Detach from old video if Netflix recreated the element
  detachListeners();

  attachedVideo = video;
  log('Found Netflix video element, attaching listeners.', {
    duration: video.duration,
    currentTime: video.currentTime,
    paused: video.paused,
    readyState: video.readyState,
  });

  video.addEventListener('play', onPlay);
  video.addEventListener('pause', onPause);
  video.addEventListener('seeked', onSeeked);
}

// Try to attach immediately, then observe for dynamic loading
function tryAttach() {
  const video = getVideoElement();
  if (video) {
    attachListeners();
  }
}

// Observe DOM for video element (Netflix loads it dynamically)
function startObserver() {
  const target = document.body || document.documentElement;

  const observer = new MutationObserver(() => {
    const video = getVideoElement();
    if (video && video !== attachedVideo) {
      attachListeners();
    }
    // Handle video being removed (Netflix navigation)
    if (!video && attachedVideo) {
      warn('Video element removed from DOM (Netflix navigation?).');
      detachListeners();
    }
  });

  observer.observe(target, { childList: true, subtree: true });
  log('MutationObserver started on', target.tagName);
}

// Wait for document.body to exist, then start
function init() {
  log('Content script loaded on:', window.location.href);

  if (document.body) {
    tryAttach();
    startObserver();
  } else {
    // body not ready yet — wait for it
    log('document.body not ready, waiting...');
    const bodyWaiter = new MutationObserver(() => {
      if (document.body) {
        bodyWaiter.disconnect();
        log('document.body now available.');
        tryAttach();
        startObserver();
      }
    });
    bodyWaiter.observe(document.documentElement, { childList: true });
  }
}

// Listen for sync commands from background
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'SYNC_PLAYER') {
    const video = getVideoElement();
    if (!video) {
      warn('Received SYNC_PLAYER but no video element found.');
      return;
    }

    const state = request.state;
    log('Received SYNC_PLAYER:', state);
    isSyncing = true;

    if (state.isPlaying) {
      const drift = (Date.now() - state.timestamp) / 1000;
      const targetTime = state.currentTime + drift;

      if (Math.abs(video.currentTime - targetTime) > 1.5) {
        log(`Seeking to ${targetTime} (drift: ${drift.toFixed(2)}s)`);
        video.currentTime = targetTime;
      }
      video.play().catch(e => warn('Play prevented:', e));
    } else {
      video.pause();
      video.currentTime = state.currentTime;
    }

    setTimeout(() => {
      isSyncing = false;
    }, 500);
  }
});

// Also respond to ping from popup/background for debugging
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type === 'PING_CONTENT') {
    sendResponse({
      alive: true,
      hasVideo: !!getVideoElement(),
      isAttached: !!attachedVideo,
      url: window.location.href,
    });
    return true;
  }
});

init();
