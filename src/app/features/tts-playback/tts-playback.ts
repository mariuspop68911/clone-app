import { Component, OnDestroy, signal } from '@angular/core';
import { ChunkedTtsPlayerService } from '../../core/audio/chunked-tts-player.service';

@Component({
  selector: 'app-tts-playback',
  templateUrl: './tts-playback.html',
  styleUrl: './tts-playback.scss'
})
export class TtsPlaybackComponent implements OnDestroy {
  private static readonly SAMPLE_TEXT =
    'Welcome, young explorers, to a wonderful story about a huge galaxy filled with shining stars, mysterious worlds, brave heroes, and secrets waiting to be discovered. This tale takes us on an exciting journey with friends who ask big questions, face dangers, and seek the truth about their universe and themselves. Let us travel together through space and time to meet them and learn their story!';

  loading = signal(false);
  playing = signal(false);
  message = signal('');
  currentChunk = signal(0);
  totalChunks = signal(0);

  constructor(private readonly ttsPlayer: ChunkedTtsPlayerService) {}

  ngOnDestroy(): void {
    this.stop();
  }

  async playSample(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.currentChunk.set(0);
    this.totalChunks.set(0);

    await this.ttsPlayer.play(TtsPlaybackComponent.SAMPLE_TEXT, {
      onLoading: (loading) => this.loading.set(loading),
      onPlaying: (playing) => this.playing.set(playing),
      onMessage: (message) => this.message.set(message),
      onProgress: (current, total) => {
        this.currentChunk.set(current);
        this.totalChunks.set(total);
      }
    });
  }

  stop(): void {
    this.ttsPlayer.stop();
    this.playing.set(false);
  }
}
