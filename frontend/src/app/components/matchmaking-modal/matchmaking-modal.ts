import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-matchmaking-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './matchmaking-modal.html',
  styleUrl: './matchmaking-modal.css'
})
export class MatchmakingModalComponent implements OnInit, OnDestroy {
  @Input() gameConfig: { gameType: string; playerMode: number; entryFee: number } | null = null;
  @Input() user: any = null;
  @Output() matchReady = new EventEmitter<any>();
  @Output() cancel = new EventEmitter<void>();

  searchStatus: string = 'Connecting to server...';
  matchedRoom: any = null;
  countdown: number = 3;

  private subscriptions: Subscription = new Subscription();

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    this.socketService.connect();

    this.subscriptions.add(
      this.socketService.onMatchmakingStatus().subscribe((res) => {
        this.searchStatus = res.message || 'Searching for opponents...';
      })
    );

    this.subscriptions.add(
      this.socketService.onMatchmakingError().subscribe((err) => {
        alert(err.message);
        this.onCancel();
      })
    );

    this.subscriptions.add(
      this.socketService.onMatchFound().subscribe((roomData) => {
        this.matchedRoom = roomData;
        this.searchStatus = 'Match Found! Launching match...';
        this.startLaunchCountdown();
      })
    );

    // Trigger queue join
    if (this.gameConfig && this.user) {
      this.socketService.joinMatchmaking({
        userId: this.user._id || this.user.id,
        username: this.user.username,
        gameType: this.gameConfig.gameType,
        playerMode: this.gameConfig.playerMode,
        entryFee: this.gameConfig.entryFee
      });
    }
  }

  startLaunchCountdown(): void {
    const interval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(interval);
        this.matchReady.emit(this.matchedRoom);
      }
    }, 1000);
  }

  onCancel(): void {
    this.socketService.cancelMatchmaking();
    this.cancel.emit();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}