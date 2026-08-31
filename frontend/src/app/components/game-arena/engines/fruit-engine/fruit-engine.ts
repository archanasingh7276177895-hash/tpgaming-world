import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../../../services/socket.service';
import { Subscription, interval } from 'rxjs';

interface FloatingItem {
  id: number;
  type: 'fruit' | 'bomb';
  name: string;
  emoji: string;
  points: number;
  x: number;
  y: number;
  speedY: number;
  speedX: number;
  sliced: boolean;
  size: number;
}

@Component({
  selector: 'app-fruit-engine',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './fruit-engine.html',
  styleUrl: './fruit-engine.css'
})
export class FruitEngineComponent implements OnInit, OnDestroy {
  @Input() room: any = null;
  @Input() currentUser: any = null;
  @Output() finishMatch = new EventEmitter<any>();

  myScore: number = 0;
  opponentScore: number = 0;
  opponentName: string = 'Opponent';
  gameTimeRemaining: number = 60;

  items: FloatingItem[] = [];
  private itemCounter = 0;
  private animationFrameId: any;
  private spawnSubscription?: Subscription;
  private timerSubscription?: Subscription;
  private botScoreSubscription?: Subscription;
  private subscriptions: Subscription = new Subscription();

  fruitTypes = [
    { name: 'Watermelon', emoji: '🍉', points: 10, size: 70 },
    { name: 'Pineapple', emoji: '🍍', points: 15, size: 60 },
    { name: 'Apple', emoji: '🍎', points: 20, size: 50 },
    { name: 'Banana', emoji: '🍌', points: 25, size: 45 },
    { name: 'Strawberry', emoji: '🍓', points: 35, size: 35 }
  ];

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    const opp = this.room?.players?.find((p: any) => p.userId !== this.currentUser?._id && p.userId !== this.currentUser?.id);
    if (opp) {
      this.opponentName = opp.username;
    } else if (this.room?.isBotMatch) {
      this.opponentName = 'AI Computer 🤖';
    }

    this.startGameLoop();
    this.startClock();

    if (this.room?.isBotMatch) {
      // Periodic simulated bot slicing points
      this.botScoreSubscription = interval(1800).subscribe(() => {
        if (Math.random() > 0.15) {
          const added = Math.floor(Math.random() * 25) + 10;
          this.opponentScore += added;
        }
      });
    } else {
      this.subscriptions.add(
        this.socketService.onGameAction().subscribe((payload) => {
          if (payload.action === 'SCORE_UPDATE') {
            this.opponentScore = payload.data.score;
          } else if (payload.action === 'BOMB_EXPLODED') {
            const myId = (this.currentUser?._id || this.currentUser?.id).toString();
            this.socketService.claimVictory(this.room.roomId, myId);
          }
        })
      );
    }
  }

  startClock(): void {
    this.timerSubscription = interval(1000).subscribe(() => {
      this.gameTimeRemaining--;
      if (this.gameTimeRemaining <= 0) {
        this.concludeMatchByScore();
      }
    });
  }

  startGameLoop(): void {
    this.spawnSubscription = interval(800).subscribe(() => {
      this.spawnItem();
    });

    const updatePhysics = () => {
      this.items.forEach(item => {
        item.y += item.speedY;
        item.x += item.speedX;
        item.speedY += 0.15;
      });

      this.items = this.items.filter(item => item.y < 580);
      this.animationFrameId = requestAnimationFrame(updatePhysics);
    };

    this.animationFrameId = requestAnimationFrame(updatePhysics);
  }

  spawnItem(): void {
    const isBomb = Math.random() < 0.22;
    const randomFruit = this.fruitTypes[Math.floor(Math.random() * this.fruitTypes.length)];

    const newItem: FloatingItem = {
      id: ++this.itemCounter,
      type: isBomb ? 'bomb' : 'fruit',
      name: isBomb ? 'Bomb' : randomFruit.name,
      emoji: isBomb ? '💣' : randomFruit.emoji,
      points: isBomb ? 0 : randomFruit.points,
      x: Math.floor(Math.random() * 70) + 15,
      y: 520,
      speedY: -(Math.random() * 4 + 9),
      speedX: (Math.random() - 0.5) * 2.5,
      sliced: false,
      size: isBomb ? 55 : randomFruit.size
    };

    this.items.push(newItem);
  }

  sliceItem(item: FloatingItem): void {
    if (item.sliced) return;
    item.sliced = true;

    if (item.type === 'bomb') {
      this.cleanup();

      if (this.room?.isBotMatch) {
        this.finishMatch.emit({ won: false, winnerName: this.opponentName });
        return;
      }

      this.socketService.sendGameAction(this.room.roomId, 'BOMB_EXPLODED', {
        userId: this.currentUser?._id || this.currentUser?.id
      });
      const opp = this.room?.players?.find((p: any) => p.userId !== (this.currentUser?._id || this.currentUser?.id));
      if (opp) {
        this.socketService.claimVictory(this.room.roomId, opp.userId);
      }
    } else {
      this.myScore += item.points;
      if (!this.room?.isBotMatch) {
        this.socketService.sendGameAction(this.room.roomId, 'SCORE_UPDATE', { score: this.myScore });
      }
    }
  }

  concludeMatchByScore(): void {
    this.cleanup();
    const isWon = this.myScore >= this.opponentScore;

    if (this.room?.isBotMatch) {
      this.finishMatch.emit({
        won: isWon,
        winnerName: isWon ? (this.currentUser?.username || 'You') : this.opponentName
      });
      return;
    }

    const myId = (this.currentUser?._id || this.currentUser?.id).toString();
    const opp = this.room?.players?.find((p: any) => p.userId.toString() !== myId);
    const winnerId = isWon ? myId : opp?.userId;
    this.socketService.claimVictory(this.room.roomId, winnerId);
  }

  private cleanup(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    this.spawnSubscription?.unsubscribe();
    this.timerSubscription?.unsubscribe();
    this.botScoreSubscription?.unsubscribe();
    this.subscriptions.unsubscribe();
  }

  ngOnDestroy(): void {
    this.cleanup();
  }
}