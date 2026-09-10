/**
 * Real-time Voice Chat System for Ludo Kingdom / Royale
 * Microphone capture, Opus/WebM audio chunk streaming, volume analysis for speaking animation, and playback.
 */

class VoiceChatManager {
  constructor(socket) {
    this.socket = socket;
    this.audioContext = null;
    this.mediaStream = null;
    this.audioSource = null;
    this.scriptProcessor = null;
    this.silentGain = null;
    this.micEnabled = false;
    this.speakerEnabled = true;
    this.myColor = 'green';
    this.isSpeaking = false;
    this.lastSpeakingEmit = 0;
    this.nextPlayTime = 0;
    this.peerSilenceTimers = {};
  }

  getAudioContext() {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        try {
          this.audioContext = new AudioCtx();
        } catch (e) {
          console.warn('AudioContext creation error:', e);
        }
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  init(myColor) {
    if (myColor) this.myColor = myColor;
    this.getAudioContext();

    // Listen for incoming voice chunks from other players
    this.socket.off('voice_audio_chunk');
    this.socket.on('voice_audio_chunk', (data) => {
      if (!this.speakerEnabled) return;
      this.playIncomingAudio(data);
    });

    // Listen for speaking animations
    this.socket.off('voice_speaking_state');
    this.socket.on('voice_speaking_state', (data) => {
      this.setSpeakingVisual(data.color, data.isSpeaking);
    });
  }

  // Toggle Microphone On/Off
  async toggleMic() {
    if (this.micEnabled) {
      this.stopMic();
      return false;
    } else {
      const success = await this.startMic();
      return success;
    }
  }

  // Start capturing microphone
  async startMic() {
    try {
      const ctx = this.getAudioContext();
      if (!ctx) {
        this.showToast('Web Audio is not supported in this browser.', '⚠️');
        return false;
      }

      // 1. Try to get microphone stream directly across all browsers
      let stream = null;
      const getUM = (constraints) => {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          return navigator.mediaDevices.getUserMedia(constraints);
        }
        const legacyGUM = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
        if (legacyGUM) {
          return new Promise((res, rej) => legacyGUM.call(navigator, constraints, res, rej));
        }
        return Promise.reject(new Error('getUserMedia not available'));
      };

      try {
        stream = await getUM({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
      } catch (e) {
        try {
          stream = await getUM({ audio: true });
        } catch (err) {
          console.warn('Microphone permission or constraint failure:', err);
        }
      }

      // If stream couldn't be obtained, check if it's due to insecure HTTP on remote LAN IP
      if (!stream) {
        const isHttps = location.protocol === 'https:';
        const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
        if (!isHttps && !isLocalhost) {
          this.showHttpsNotice();
          return false;
        } else {
          this.showToast('Microphone blocked. Please allow mic access in your browser address bar.', '🔇');
          return false;
        }
      }

      this.mediaStream = stream;

      // 2. Set up Web Audio PCM processor (Works on 100% of browsers including iOS Safari & Android Chrome)
      this.audioSource = ctx.createMediaStreamSource(this.mediaStream);
      const processor = ctx.createScriptProcessor(2048, 1, 1);
      this.scriptProcessor = processor;

      processor.onaudioprocess = (e) => {
        if (!this.micEnabled) return;

        const input = e.inputBuffer.getChannelData(0);

        // Volume calculation for Voice Activity Detection
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const isSpeakingNow = rms > 0.018;

        const now = Date.now();
        if (isSpeakingNow !== this.isSpeaking && (now - this.lastSpeakingEmit > 180)) {
          this.isSpeaking = isSpeakingNow;
          this.lastSpeakingEmit = now;
          this.socket.emit('voice_speaking_state', { color: this.myColor, isSpeaking: isSpeakingNow });
          this.setSpeakingVisual(this.myColor, isSpeakingNow);
        }

        // Silence suppression: don't transmit dead silence
        if (!isSpeakingNow && rms < 0.006) return;

        // Convert Float32 (-1.0 to 1.0) to compact Int16 PCM
        const pcm16 = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        this.socket.emit('voice_audio_chunk', {
          color: this.myColor,
          sampleRate: ctx.sampleRate,
          pcm: pcm16.buffer
        });
      };

      // Connect source -> processor -> silent destination (required for script processor to tick)
      this.silentGain = ctx.createGain();
      this.silentGain.gain.value = 0;
      this.audioSource.connect(processor);
      processor.connect(this.silentGain);
      this.silentGain.connect(ctx.destination);

      this.micEnabled = true;
      this.showToast('🎙️ Microphone connected! Live voice chat active.', '🎙️');
      return true;
    } catch (err) {
      console.warn('startMic error:', err);
      this.micEnabled = false;
      this.showToast('Could not access microphone.', '🔇');
      return false;
    }
  }

  // Stop capturing microphone
  stopMic() {
    this.micEnabled = false;
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
      } catch (e) {}
      this.scriptProcessor = null;
    }
    if (this.audioSource) {
      try { this.audioSource.disconnect(); } catch (e) {}
      this.audioSource = null;
    }
    if (this.silentGain) {
      try { this.silentGain.disconnect(); } catch (e) {}
      this.silentGain = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.socket.emit('voice_speaking_state', { color: this.myColor, isSpeaking: false });
      this.setSpeakingVisual(this.myColor, false);
    }
    this.showToast('Microphone muted.', '🔇');
  }

  // Toggle Speaker On/Off (Mute/Unmute incoming room voices)
  toggleSpeaker() {
    this.speakerEnabled = !this.speakerEnabled;
    this.showToast(this.speakerEnabled ? 'Speaker unmuted.' : 'Speaker muted.', this.speakerEnabled ? '🔊' : '🔈');
    return this.speakerEnabled;
  }

  // Play incoming audio buffer from peer with Web Audio API (Universal cross-browser)
  playIncomingAudio(data) {
    if (!this.speakerEnabled || !data) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const pcmBuffer = data.pcm || data.audioData;
      if (!pcmBuffer) return;

      const pcm16 = new Int16Array(pcmBuffer);
      if (pcm16.length === 0) return;

      // Convert Int16 back to Float32
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF);
      }

      const sampleRate = data.sampleRate || ctx.sampleRate || 44100;
      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.copyToChannel(float32, 0);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      // Jitter buffer scheduling for smooth, continuous voice
      const now = ctx.currentTime;
      if (this.nextPlayTime < now) {
        this.nextPlayTime = now + 0.02;
      }
      source.start(this.nextPlayTime);
      this.nextPlayTime += audioBuffer.duration;

      // Visual speaking glow on the talking player's avatar
      const speakerColor = data.color || 'green';
      this.setSpeakingVisual(speakerColor, true);
      if (this.peerSilenceTimers[speakerColor]) {
        clearTimeout(this.peerSilenceTimers[speakerColor]);
      }
      this.peerSilenceTimers[speakerColor] = setTimeout(() => {
        this.setSpeakingVisual(speakerColor, false);
      }, 450);
    } catch (e) {
      console.warn('PCM audio playback error:', e);
    }
  }

  // Update visual ripple wave animation on player avatar ring
  setSpeakingVisual(color, isSpeaking) {
    const avatarRing = document.getElementById(`avatar-ring-${color}`);
    if (avatarRing) {
      if (isSpeaking) {
        avatarRing.classList.add('is-speaking');
      } else {
        avatarRing.classList.remove('is-speaking');
      }
    }
  }

  // Friendly toast notification
  showToast(text, icon = 'ℹ️') {
    const toast = document.getElementById('game-status-toast');
    const toastText = document.getElementById('toast-text');
    const toastIcon = document.getElementById('toast-icon');
    if (toastText && toastIcon) {
      toastText.textContent = text;
      toastIcon.textContent = icon;
    }
  }

  // Modal banner instructing mobile users to use HTTPS for microphone access
  showHttpsNotice() {
    const existing = document.getElementById('https-voice-notice');
    if (existing) existing.remove();

    const httpsPort = 4001;
    const httpsUrl = `https://${location.hostname}:${httpsPort}${location.pathname}${location.search}`;

    const modal = document.createElement('div');
    modal.id = 'https-voice-notice';
    modal.className = 'voice-notice-backdrop';
    modal.innerHTML = `
      <div class="voice-notice-modal">
        <div class="voice-notice-badge">🎙️ 🔒</div>
        <h2>Microphone Requires HTTPS</h2>
        <p>Mobile browsers (Chrome on Android & Safari on iOS) strictly require a secure <strong>HTTPS</strong> connection to allow microphone access.</p>
        <p class="voice-notice-sub">A secure HTTPS server is running on port <strong>${httpsPort}</strong>.</p>
        <div class="voice-notice-buttons">
          <a href="${httpsUrl}" class="voice-btn-primary">👉 Tap to Open HTTPS (${httpsPort})</a>
          <button class="voice-btn-cancel" id="close-voice-notice-btn">Close</button>
        </div>
        <div class="voice-notice-tip">
          💡 <em>Note: When opening the HTTPS link, tap <strong>"Advanced" ➔ "Proceed to site"</strong> to accept the local certificate and enable voice chat.</em>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('close-voice-notice-btn').addEventListener('click', () => {
      modal.remove();
    });
  }
}

window.VoiceChatManager = VoiceChatManager;
