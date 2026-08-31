import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../../../services/socket.service';
import { Subscription, interval } from 'rxjs';

export interface SnakesPlayer {
  userId: string;
  username: string;
  color: 'green' | 'yellow' | 'blue' | 'red';
  colorHex: string;
  position: number;
  isActive: boolean;
  isEliminated: boolean;
  isFinished: boolean;
  rank?: number;
  missedTurns: number;
}

export interface BoardPathItem {
  from: number;
  to: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx1?: number;
  cy1?: number;
  cx2?: number;
  cy2?: number;
  color?: string;
  rungs?: { x1: number; y1: number; x2: number; y2: number }[];
}

@Component({
  selector: 'app-snakes-engine',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './snakes-engine.html',
  styleUrl: './snakes-engine.css'
})
export class SnakesEngineComponent implements OnInit, OnDestroy {
  @Input() room: any = null;
  @Input() currentUser: any = null;
  @Output() finishMatch = new EventEmitter<any>();

  players: SnakesPlayer[] = [];
  activePlayerIndices: number[] = [];
  currentTurnIndex: number = 0;
  diceValue: number = 1;
  isRolling: boolean = false;
  hasRolled: boolean = false;

  isMeEliminated: boolean = false;
  turnTimer: number = 15;
  private turnTimerSub?: Subscription;
  private subscriptions: Subscription = new Subscription();

  snakeVisuals: BoardPathItem[] = [];
  ladderVisuals: BoardPathItem[] = [];

  readonly PLAYER_CONFIG = [
    { color: 'green' as const, hex: '#00a859' },
    { color: 'yellow' as const, hex: '#ffcc00' },
    { color: 'blue' as const, hex: '#0088ff' },
    { color: 'red' as const, hex: '#e60000' }
  ];

  readonly LADDERS: { [key: number]: number } = {
    5: 26,
    9: 70,
    22: 41,
    28: 67,
    44: 78,
    66: 86,
    72: 91,
    77: 97
  };

  readonly SNAKES: { [key: number]: number } = {
    99: 4,
    14: 7,
    37: 18,
    80: 42,
    87: 55,
    92: 53
  };

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    this.generateBoardVisuals();

    const rawPlayers = this.room?.players || [];
    const is2P = Number(this.room?.playerMode) === 2 || rawPlayers.length === 2;

    this.players = this.PLAYER_CONFIG.map((cfg, idx) => {
      let matchPlayer: any = null;
      if (is2P) {
        if (idx === 0) matchPlayer = rawPlayers[0];
        if (idx === 2) matchPlayer = rawPlayers[1];
      } else {
        matchPlayer = rawPlayers[idx];
      }

      return {
        userId: matchPlayer ? (matchPlayer.userId || matchPlayer._id || '').toString() : '',
        username: matchPlayer ? matchPlayer.username : '',
        color: cfg.color,
        colorHex: cfg.hex,
        position: 0,
        isActive: !!matchPlayer,
        isEliminated: false,
        isFinished: false,
        missedTurns: 0
      };
    });

    this.updateActiveTurnIndices();
    this.currentTurnIndex = this.activePlayerIndices[0] ?? 0;
    this.resetAndStartTurnClock();

    if (!this.room?.isBotMatch) {
      this.subscriptions.add(
        this.socketService.onGameAction().subscribe((payload: any) => {
          if (payload.action === 'SNAKES_DICE_ROLLED') {
            this.currentTurnIndex = payload.data.playerIndex;
            this.diceValue = payload.data.diceValue;
            this.hasRolled = true;
            this.isRolling = false;
            this.stopTurnClock();
          } else if (payload.action === 'SNAKES_TOKEN_MOVED') {
            this.applyRemoteMove(payload.data);
          } else if (payload.action === 'SNAKES_TURN_TRANSITION') {
            this.handleTurnTransition(payload.data);
          }
        })
      );

      this.subscriptions.add(
        this.socketService.onPlayerRank().subscribe((data: any) => {
          const p = this.players.find(x => x.userId === data.userId);
          if (p) {
            p.isFinished = true;
            p.rank = data.rank;
          }
          this.updateActiveTurnIndices();
        })
      );

      this.subscriptions.add(
        this.socketService.onPlayerEliminated().subscribe((data: any) => {
          const p = this.players.find(x => x.userId === data.userId);
          if (p) {
            p.isEliminated = true;
            p.isActive = false;
            p.position = -1;
          }
          this.updateActiveTurnIndices();
          if (data.userId === this.myUserId) {
            this.isMeEliminated = true;
            this.stopTurnClock();
          }
        })
      );
    }
  }

  getTileCenterPercent(tileNum: number): { x: number; y: number } {
    const rowIdx = Math.floor((tileNum - 1) / 10);
    let colIdx = (tileNum - 1) % 10;
    if (rowIdx % 2 !== 0) {
      colIdx = 9 - colIdx;
    }
    const y = (9 - rowIdx) * 10 + 5;
    const x = colIdx * 10 + 5;
    return { x, y };
  }

  generateBoardVisuals(): void {
    const snakeColors: { [key: number]: string } = {
      14: '#f43f5e',
      37: '#06b6d4',
      80: '#cbd5e1',
      87: '#3b82f6',
      92: '#d946ef',
      99: '#22c55e'
    };

    this.snakeVisuals = Object.keys(this.SNAKES).map(headStr => {
      const head = Number(headStr);
      const tail = this.SNAKES[head];
      const start = this.getTileCenterPercent(head);
      const end = this.getTileCenterPercent(tail);

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      return {
        from: head,
        to: tail,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        cx1: start.x + dx * 0.3 - (dy > 0 ? 10 : -10),
        cy1: start.y + dy * 0.3,
        cx2: start.x + dx * 0.7 + (dy > 0 ? 10 : -10),
        cy2: start.y + dy * 0.7,
        color: snakeColors[head] || '#10b981'
      };
    });

    this.ladderVisuals = Object.keys(this.LADDERS).map(baseStr => {
      const base = Number(baseStr);
      const top = this.LADDERS[base];
      const start = this.getTileCenterPercent(base);
      const end = this.getTileCenterPercent(top);

      const numRungs = 6;
      const rungs = [];
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.hypot(dx, dy);
      const perpX = -(dy / len) * 2.2;
      const perpY = (dx / len) * 2.2;

      for (let i = 1; i <= numRungs; i++) {
        const t = i / (numRungs + 1);
        const rx = start.x + dx * t;
        const ry = start.y + dy * t;
        rungs.push({
          x1: rx - perpX,
          y1: ry - perpY,
          x2: rx + perpX,
          y2: ry + perpY
        });
      }

      return {
        from: base,
        to: top,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
        rungs
      };
    });
  }

  get myUserId(): string {
    return (this.currentUser?._id || this.currentUser?.id || '').toString();
  }

  get currentPlayer(): SnakesPlayer {
    return this.players[this.currentTurnIndex] || this.players[0];
  }

  get isMyTurn(): boolean {
    if (this.isMeEliminated) return false;
    return this.currentPlayer.isActive && !this.currentPlayer.isEliminated && !this.currentPlayer.isFinished && this.currentPlayer.userId === this.myUserId;
  }

  updateActiveTurnIndices(): void {
    this.activePlayerIndices = this.players
      .map((p, idx) => (p.isActive && !p.isEliminated && !p.isFinished ? idx : -1))
      .filter(idx => idx !== -1);
  }

  rollDice(playerIndex: number): void {
    if (playerIndex !== this.currentTurnIndex || !this.isMyTurn || this.hasRolled || this.isRolling) {
      return;
    }

    this.isRolling = true;
    this.stopTurnClock();

    let ticks = 0;
    const rollAnim = setInterval(() => {
      this.diceValue = Math.floor(Math.random() * 6) + 1;
      ticks++;
      if (ticks >= 6) {
        clearInterval(rollAnim);
        this.isRolling = false;
        this.hasRolled = true;

        if (!this.room?.isBotMatch) {
          this.socketService.sendGameAction(this.room.roomId, 'SNAKES_DICE_ROLLED', {
            diceValue: this.diceValue,
            playerIndex: this.currentTurnIndex
          });
        }

        setTimeout(() => this.executePlayerMove(), 400);
      }
    }, 60);
  }

  triggerBotTurn(): void {
    if (!this.room?.isBotMatch || this.isMyTurn) return;

    this.isRolling = true;
    this.stopTurnClock();

    setTimeout(() => {
      this.diceValue = Math.floor(Math.random() * 6) + 1;
      this.isRolling = false;
      this.hasRolled = true;
      setTimeout(() => this.executePlayerMove(), 400);
    }, 700);
  }

  executePlayerMove(): void {
    let targetPos = this.currentPlayer.position;
    let earnedBonus = false;

    if (targetPos === 0) {
      if (this.diceValue === 1) {
        targetPos = 1;
      }
    } else {
      if (targetPos + this.diceValue <= 100) {
        targetPos += this.diceValue;

        if (this.LADDERS[targetPos]) {
          targetPos = this.LADDERS[targetPos];
          earnedBonus = true;
        } else if (this.SNAKES[targetPos]) {
          targetPos = this.SNAKES[targetPos];
        }
      }
    }

    this.currentPlayer.position = targetPos;
    const isWinner = targetPos === 100;

    if (!this.room?.isBotMatch) {
      this.socketService.sendGameAction(this.room.roomId, 'SNAKES_TOKEN_MOVED', {
        playerIndex: this.currentTurnIndex,
        newPosition: targetPos,
        earnedBonus
      });
    }

    if (isWinner) {
      this.currentPlayer.isFinished = true;
      if (this.room?.isBotMatch) {
        this.finishMatch.emit({ won: this.currentPlayer.userId === this.myUserId, winnerName: this.currentPlayer.username });
      } else {
        this.socketService.claimRank(this.room.roomId, this.currentPlayer.userId);
      }
      this.updateActiveTurnIndices();

      if (this.activePlayerIndices.length > 0) {
        this.passTurn(false);
      }
      return;
    }

    if (this.diceValue === 6 || earnedBonus) {
      if (!this.room?.isBotMatch) {
        this.socketService.sendGameAction(this.room.roomId, 'SNAKES_TURN_TRANSITION', {
          nextTurnIndex: this.currentTurnIndex,
          isBonus: true,
          missedPlayerIndex: null
        });
      }

      this.hasRolled = false;
      this.isRolling = false;
      this.resetAndStartTurnClock();

      if (this.room?.isBotMatch && !this.isMyTurn) {
        setTimeout(() => this.triggerBotTurn(), 800);
      }
    } else {
      this.passTurn(false);
    }
  }

  applyRemoteMove(data: any): void {
    const player = this.players[data.playerIndex];
    if (player) {
      player.position = data.newPosition;
    }
  }

  passTurn(isMissed: boolean = false): void {
    this.stopTurnClock();

    if (isMissed) {
      this.currentPlayer.missedTurns++;
      if (this.currentPlayer.missedTurns >= 3) {
        this.currentPlayer.isEliminated = true;
        this.currentPlayer.position = -1;
        if (!this.room?.isBotMatch) {
          this.socketService.eliminatePlayer(this.room.roomId, this.currentPlayer.userId, this.currentPlayer.username);
        }
        if (this.currentPlayer.userId === this.myUserId) {
          this.isMeEliminated = true;
        }
      }
    }

    this.updateActiveTurnIndices();
    if (this.activePlayerIndices.length === 0) return;

    const currentPos = this.activePlayerIndices.indexOf(this.currentTurnIndex);
    const nextPos = (currentPos + 1) % this.activePlayerIndices.length;
    const nextTurnIndex = this.activePlayerIndices[nextPos];

    if (!this.room?.isBotMatch) {
      this.socketService.sendGameAction(this.room.roomId, 'SNAKES_TURN_TRANSITION', {
        nextTurnIndex,
        isBonus: false,
        missedPlayerIndex: isMissed ? this.currentTurnIndex : null
      });
    }

    this.currentTurnIndex = nextTurnIndex;
    this.hasRolled = false;
    this.isRolling = false;
    this.resetAndStartTurnClock();

    if (this.room?.isBotMatch && !this.isMyTurn) {
      setTimeout(() => this.triggerBotTurn(), 800);
    }
  }

  handleTurnTransition(data: any): void {
    this.stopTurnClock();

    if (data.missedPlayerIndex !== null && data.missedPlayerIndex !== undefined) {
      const p = this.players[data.missedPlayerIndex];
      if (p) {
        p.missedTurns++;
        if (p.missedTurns >= 3) {
          p.isEliminated = true;
          p.position = -1;
          this.updateActiveTurnIndices();
        }
      }
    }

    this.currentTurnIndex = data.nextTurnIndex;
    this.hasRolled = false;
    this.isRolling = false;
    this.resetAndStartTurnClock();
  }

  resetAndStartTurnClock(): void {
    this.stopTurnClock();
    if (this.isMeEliminated) return;

    this.turnTimer = 15;
    this.turnTimerSub = interval(1000).subscribe(() => {
      this.turnTimer--;
      if (this.turnTimer <= 0) {
        this.stopTurnClock();
        this.passTurn(true);
      }
    });
  }

  stopTurnClock(): void {
    this.turnTimerSub?.unsubscribe();
  }

  leaveRoomToDashboard(): void {
    this.finishMatch.emit();
  }

  getTileNumber(row: number, col: number): number {
    const adjustedRow = 9 - row;
    if (adjustedRow % 2 === 0) {
      return adjustedRow * 10 + (col + 1);
    } else {
      return adjustedRow * 10 + (10 - col);
    }
  }

  getPlayersAtTile(tileNum: number): SnakesPlayer[] {
    return this.players.filter(p => p.isActive && !p.isEliminated && p.position === tileNum);
  }

  getOffBoardPlayers(): SnakesPlayer[] {
    return this.players.filter(p => p.isActive && !p.isEliminated && p.position === 0);
  }

  ngOnDestroy(): void {
    this.stopTurnClock();
    this.subscriptions.unsubscribe();
  }
}