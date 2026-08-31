import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../../../services/socket.service';
import { Subscription, interval } from 'rxjs';

export interface Token {
  id: number;
  stepIndex: number;
  isHome: boolean;
  isFinished: boolean;
}

export interface LudoPlayer {
  userId: string;
  username: string;
  color: 'green' | 'yellow' | 'blue' | 'red';
  colorHex: string;
  isActive: boolean;
  isEliminated: boolean;
  isFinished: boolean;
  rank?: number;
  missedTurns: number;
  tokens: Token[];
}

@Component({
  selector: 'app-ludo-engine',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ludo-engine.html',
  styleUrl: './ludo-engine.css'
})
export class LudoEngineComponent implements OnInit, OnDestroy {
  @Input() room: any = null;
  @Input() currentUser: any = null;
  @Output() finishMatch = new EventEmitter<any>();

  players: LudoPlayer[] = [];
  activePlayerIndices: number[] = [];
  currentTurnIndex: number = 0;
  diceValue: number = 1;
  isRolling: boolean = false;
  hasRolled: boolean = false;
  movableTokenIds: number[] = [];

  isMeEliminated: boolean = false;
  turnTimer: number = 15;
  private turnTimerSub?: Subscription;
  private subscriptions: Subscription = new Subscription();

  readonly PLAYER_CONFIG = [
    { color: 'green' as const, hex: '#00a859', startTile: 0 },
    { color: 'yellow' as const, hex: '#ffcc00', startTile: 13 },
    { color: 'blue' as const, hex: '#0088ff', startTile: 26 },
    { color: 'red' as const, hex: '#e60000', startTile: 39 }
  ];

  readonly PATH_COORDINATES: [number, number][] = [
    [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
    [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
    [0, 7],
    [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
    [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
    [7, 14],
    [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
    [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
    [14, 7],
    [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
    [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
    [7, 0], [6, 0]
  ];

  readonly HOME_RUNS = {
    green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    yellow: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
    red: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]]
  };

  readonly SAFE_CELLS = ['6,1', '2,6', '1,8', '6,12', '8,13', '12,8', '13,6', '8,2'];

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
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
        isActive: !!matchPlayer,
        isEliminated: false,
        isFinished: false,
        missedTurns: 0,
        tokens: [
          { id: 0, stepIndex: -1, isHome: true, isFinished: false },
          { id: 1, stepIndex: -1, isHome: true, isFinished: false },
          { id: 2, stepIndex: -1, isHome: true, isFinished: false },
          { id: 3, stepIndex: -1, isHome: true, isFinished: false }
        ]
      };
    });

    this.updateActiveTurnIndices();
    this.currentTurnIndex = this.activePlayerIndices[0] ?? 0;
    this.resetAndStartTurnClock();

    if (!this.room?.isBotMatch) {
      this.subscriptions.add(
        this.socketService.onGameAction().subscribe((payload: any) => {
          if (payload.action === 'LUDO_DICE_ROLLED') {
            this.currentTurnIndex = payload.data.playerIndex;
            this.diceValue = payload.data.diceValue;
            this.hasRolled = true;
            this.isRolling = false;
            this.stopTurnClock();
            this.evaluateMovableTokens();
          } else if (payload.action === 'LUDO_TOKEN_MOVED') {
            this.applyRemoteMove(payload.data);
          } else if (payload.action === 'LUDO_TURN_TRANSITION') {
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
            p.tokens = [];
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

  get myUserId(): string {
    return (this.currentUser?._id || this.currentUser?.id || '').toString();
  }

  get currentPlayer(): LudoPlayer {
    return this.players[this.currentTurnIndex] || this.players[0];
  }

  get isMyTurn(): boolean {
    if (this.isMeEliminated) return false;
    return this.currentPlayer.isActive && !this.currentPlayer.isEliminated && !this.currentPlayer.isFinished && this.currentPlayer.userId === this.myUserId;
  }

  getHomeTokensCount(player: LudoPlayer): number {
    if (!player || !player.tokens) return 0;
    return player.tokens.filter(t => t.isFinished).length;
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
          this.socketService.sendGameAction(this.room.roomId, 'LUDO_DICE_ROLLED', {
            diceValue: this.diceValue,
            playerIndex: this.currentTurnIndex
          });
        }

        this.evaluateMovableTokens();
      }
    }, 60);
  }

  evaluateMovableTokens(): void {
    const activeTokens = this.currentPlayer.tokens;
    this.movableTokenIds = [];

    activeTokens.forEach(t => {
      if (t.isFinished) return;
      if (t.isHome) {
        if (this.diceValue === 6) this.movableTokenIds.push(t.id);
      } else {
        if (t.stepIndex + this.diceValue <= 56) {
          this.movableTokenIds.push(t.id);
        }
      }
    });

    if (this.movableTokenIds.length === 0) {
      setTimeout(() => this.passTurn(false), 900);
    } else if (this.movableTokenIds.length === 1 && this.isMyTurn) {
      setTimeout(() => this.moveToken(this.currentPlayer, this.movableTokenIds[0]), 350);
    } else if (!this.isMyTurn && this.room?.isBotMatch) {
      setTimeout(() => this.executeBotTokenMove(), 450);
    } else {
      this.resetAndStartTurnClock();
    }
  }

  executeBotTokenMove(): void {
    if (this.movableTokenIds.length === 0) {
      this.passTurn(false);
      return;
    }
    const chosenTokenId = this.movableTokenIds[0];
    this.moveToken(this.currentPlayer, chosenTokenId);
  }

  triggerBotTurn(): void {
    if (!this.room?.isBotMatch || this.isMyTurn) return;

    this.isRolling = true;
    this.stopTurnClock();

    setTimeout(() => {
      this.diceValue = Math.floor(Math.random() * 6) + 1;
      this.isRolling = false;
      this.hasRolled = true;
      this.evaluateMovableTokens();
    }, 700);
  }

  moveToken(player: LudoPlayer, tokenId: number): void {
    if (player.color !== this.currentPlayer.color || !this.hasRolled || !this.movableTokenIds.includes(tokenId)) {
      return;
    }

    const token = player.tokens.find(t => t.id === tokenId);
    if (!token) return;

    this.stopTurnClock();
    this.movableTokenIds = [];
    let earnedBonus = false;

    if (token.isHome && this.diceValue === 6) {
      token.isHome = false;
      token.stepIndex = 0;
      earnedBonus = true;
    } else {
      token.stepIndex += this.diceValue;
      if (token.stepIndex === 56) {
        token.isFinished = true;
        earnedBonus = true;
      }
    }

    const killedVictim = this.checkAndPerformCapture(player, token);
    if (killedVictim) {
      earnedBonus = true;
    }

    const hasFinishedAll = player.tokens.every(t => t.isFinished);

    if (!this.room?.isBotMatch) {
      this.socketService.sendGameAction(this.room.roomId, 'LUDO_TOKEN_MOVED', {
        playerIndex: this.currentTurnIndex,
        tokenId: token.id,
        newStepIndex: token.stepIndex,
        isHome: token.isHome,
        isFinished: token.isFinished,
        killedVictim,
        earnedBonus
      });
    }

    if (hasFinishedAll) {
      player.isFinished = true;
      if (this.room?.isBotMatch) {
        this.finishMatch.emit({ won: player.userId === this.myUserId, winnerName: player.username });
      } else {
        this.socketService.claimRank(this.room.roomId, player.userId);
      }
      this.updateActiveTurnIndices();
      if (this.activePlayerIndices.length > 0) {
        this.passTurn(false);
      }
      return;
    }

    if (this.diceValue === 6 || earnedBonus) {
      if (!this.room?.isBotMatch) {
        this.socketService.sendGameAction(this.room.roomId, 'LUDO_TURN_TRANSITION', {
          nextTurnIndex: this.currentTurnIndex,
          isBonus: true,
          missedPlayerIndex: null
        });
      }

      this.hasRolled = false;
      this.isRolling = false;
      this.movableTokenIds = [];
      this.resetAndStartTurnClock();

      if (this.room?.isBotMatch && !this.isMyTurn) {
        setTimeout(() => this.triggerBotTurn(), 800);
      }
    } else {
      this.passTurn(false);
    }
  }

  checkAndPerformCapture(attacker: LudoPlayer, attackerToken: Token): { victimPlayerIndex: number; victimTokenId: number } | null {
    if (attackerToken.isHome || attackerToken.isFinished || attackerToken.stepIndex > 50) return null;

    const attackerPos = this.getTokenPosition(attacker, attackerToken);
    if (!attackerPos) return null;

    const cellKey = `${attackerPos.row},${attackerPos.col}`;
    if (this.SAFE_CELLS.includes(cellKey)) return null;

    for (let pIdx = 0; pIdx < this.players.length; pIdx++) {
      const p = this.players[pIdx];
      if (p.color === attacker.color || !p.isActive || p.isEliminated || p.isFinished) continue;

      for (const t of p.tokens) {
        if (!t.isHome && !t.isFinished && t.stepIndex <= 50) {
          const victimPos = this.getTokenPosition(p, t);
          if (victimPos && victimPos.row === attackerPos.row && victimPos.col === attackerPos.col) {
            t.isHome = true;
            t.stepIndex = -1;
            return { victimPlayerIndex: pIdx, victimTokenId: t.id };
          }
        }
      }
    }
    return null;
  }

  applyRemoteMove(data: any): void {
    const player = this.players[data.playerIndex];
    if (!player) return;

    const token = player.tokens.find(t => t.id === data.tokenId);
    if (token) {
      token.stepIndex = data.newStepIndex;
      token.isHome = data.isHome;
      token.isFinished = data.isFinished;
    }

    if (data.killedVictim) {
      const victimP = this.players[data.killedVictim.victimPlayerIndex];
      if (victimP) {
        const vt = victimP.tokens.find(t => t.id === data.killedVictim.victimTokenId);
        if (vt) {
          vt.isHome = true;
          vt.stepIndex = -1;
        }
      }
    }
  }

  passTurn(isMissed: boolean = false): void {
    this.stopTurnClock();

    if (isMissed) {
      this.currentPlayer.missedTurns++;
      if (this.currentPlayer.missedTurns >= 3) {
        this.currentPlayer.isEliminated = true;
        this.currentPlayer.tokens = [];
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
      this.socketService.sendGameAction(this.room.roomId, 'LUDO_TURN_TRANSITION', {
        nextTurnIndex,
        isBonus: false,
        missedPlayerIndex: isMissed ? this.currentTurnIndex : null
      });
    }

    this.currentTurnIndex = nextTurnIndex;
    this.hasRolled = false;
    this.isRolling = false;
    this.movableTokenIds = [];
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
          p.tokens = [];
          this.updateActiveTurnIndices();
        }
      }
    }

    this.currentTurnIndex = data.nextTurnIndex;
    this.hasRolled = false;
    this.isRolling = false;
    this.movableTokenIds = [];
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

  getTokenPosition(player: LudoPlayer, token: Token): { row: number; col: number } | null {
    if (token.isHome || token.isFinished) return null;

    if (token.stepIndex <= 50) {
      const cfg = this.PLAYER_CONFIG.find(c => c.color === player.color)!;
      const globalIdx = (cfg.startTile + token.stepIndex) % 52;
      const coords = this.PATH_COORDINATES[globalIdx];
      return { row: coords[0], col: coords[1] };
    } else {
      const homeStep = token.stepIndex - 51;
      const coords = this.HOME_RUNS[player.color][homeStep];
      return { row: coords[0], col: coords[1] };
    }
  }

  getTokensAtCell(r: number, c: number): { player: LudoPlayer; token: Token }[] {
    const list: { player: LudoPlayer; token: Token }[] = [];
    this.players.forEach(p => {
      if (p.isEliminated) return;
      p.tokens.forEach(t => {
        const pos = this.getTokenPosition(p, t);
        if (pos && pos.row === r && pos.col === c) {
          list.push({ player: p, token: t });
        }
      });
    });
    return list;
  }

  ngOnDestroy(): void {
    this.stopTurnClock();
    this.subscriptions.unsubscribe();
  }
}