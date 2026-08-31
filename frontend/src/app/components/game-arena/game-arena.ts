import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../services/socket.service';
import { Subscription } from 'rxjs';

import { FruitEngineComponent } from './engines/fruit-engine/fruit-engine';
import { LudoEngineComponent } from './engines/ludo-engine/ludo-engine';
import { SnakesEngineComponent } from './engines/snakes-engine/snakes-engine';
import { ChessEngineComponent } from './engines/chess-engine/chess-engine';

@Component({
  selector: 'app-game-arena',
  standalone: true,
  imports: [
    CommonModule, 
    FruitEngineComponent, 
    LudoEngineComponent, 
    SnakesEngineComponent, 
    ChessEngineComponent
  ],
  templateUrl: './game-arena.html',
  styleUrl: './game-arena.css'
})
export class GameArenaComponent implements OnInit, OnDestroy {
  @Input() room: any = null;
  @Input() currentUser: any = null;
  @Output() exitGame = new EventEmitter<void>();

  isGameOver: boolean = false;
  winnerData: { username: string; prize: number; isMe: boolean; reason?: string } | null = null;
  private subscriptions: Subscription = new Subscription();

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    if (!this.room?.isBotMatch) {
      this.subscriptions.add(
        this.socketService.onGameEnded().subscribe((data: any) => {
          this.isGameOver = true;
          const myId = (this.currentUser?._id || this.currentUser?.id || '').toString();
          this.winnerData = {
            username: data.winnerUsername || 'Player',
            prize: data.prizePool,
            isMe: (data.winnerUserId || '').toString() === myId || (data.winners && data.winners.includes(myId)),
            reason: data.reason
          };
        })
      );
    }
  }

  forfeitMatch(): void {
    if (this.room?.isBotMatch) {
      if (confirm('Quit practice match against Computer?')) {
        this.onFinish();
      }
      return;
    }

    if (confirm('Are you sure you want to forfeit this match? Your opponent will be awarded the win.')) {
      const myId = (this.currentUser?._id || this.currentUser?.id || '').toString();
      this.socketService.forfeitMatch(this.room.roomId, myId);
    }
  }

  handleBotMatchFinish(result: { won: boolean; winnerName?: string }): void {
    this.isGameOver = true;
    this.winnerData = {
      username: result.won ? (this.currentUser?.username || 'You') : (result.winnerName || 'AI Computer 🤖'),
      prize: 0,
      isMe: result.won,
      reason: 'Practice match concluded.'
    };
  }

  onFinish(): void {
    this.exitGame.emit();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }
}