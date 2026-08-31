import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SocketService } from '../../../../services/socket.service';
import { Chess, Square, PieceSymbol, Color } from 'chess.js';
import { Subscription, interval } from 'rxjs';

export interface ChessPlayer {
  userId: string;
  username: string;
  color: 'w' | 'b';
  colorName: 'White' | 'Black';
  timer: number;
}

export interface BoardSquare {
  square: Square;
  row: number;
  col: number;
  piece: { type: PieceSymbol; color: Color } | null;
  isLight: boolean;
}

@Component({
  selector: 'app-chess-engine',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chess-engine.html',
  styleUrl: './chess-engine.css'
})
export class ChessEngineComponent implements OnInit, OnDestroy {
  @Input() room: any = null;
  @Input() currentUser: any = null;
  @Output() finishMatch = new EventEmitter<any>();

  chess = new Chess();
  boardGrid: BoardSquare[][] = [];
  selectedSquare: Square | null = null;
  validMoves: Square[] = [];
  lastMove: { from: Square; to: Square } | null = null;

  whitePlayer!: ChessPlayer;
  blackPlayer!: ChessPlayer;
  myColor: 'w' | 'b' = 'w';
  turnClockSub?: Subscription;
  private subscriptions = new Subscription();

  readonly PIECE_ICONS: { [key: string]: string } = {
    'w_k': '♔', 'w_q': '♕', 'w_r': '♖', 'w_b': '♗', 'w_n': '♘', 'w_p': '♙',
    'b_k': '♚', 'b_q': '♛', 'b_r': '♜', 'b_b': '♝', 'b_n': '♞', 'b_p': '♟'
  };

  constructor(private socketService: SocketService) {}

  ngOnInit(): void {
    const rawPlayers = this.room?.players || [];
    const p1 = rawPlayers[0];
    const p2 = rawPlayers[1];

    this.whitePlayer = {
      userId: (p1?.userId || p1?._id || '').toString(),
      username: p1?.username || 'Player 1',
      color: 'w',
      colorName: 'White',
      timer: 300
    };

    this.blackPlayer = {
      userId: (p2?.userId || p2?._id || '').toString(),
      username: p2?.username || (this.room?.isBotMatch ? 'AI Computer 🤖' : 'Player 2'),
      color: 'b',
      colorName: 'Black',
      timer: 300
    };

    this.myColor = this.myUserId === this.whitePlayer.userId ? 'w' : 'b';

    this.rebuildBoard();
    this.startTurnClock();

    if (!this.room?.isBotMatch) {
      this.subscriptions.add(
        this.socketService.onGameAction().subscribe((payload: any) => {
          if (payload.action === 'CHESS_MOVE') {
            this.applyMove(payload.data.from, payload.data.to, payload.data.promotion, false);
          } else if (payload.action === 'CHESS_RESIGN') {
            this.handleResignation(payload.data.resignedUserId);
          }
        })
      );
    }
  }

  get myUserId(): string {
    return (this.currentUser?._id || this.currentUser?.id || '').toString();
  }

  get isMyTurn(): boolean {
    return this.chess.turn() === this.myColor && !this.chess.isGameOver();
  }

  get activeTurnPlayer(): ChessPlayer {
    return this.chess.turn() === 'w' ? this.whitePlayer : this.blackPlayer;
  }

  rebuildBoard(): void {
    const boardState = this.chess.board();
    const grid: BoardSquare[][] = [];

    for (let r = 0; r < 8; r++) {
      const rowArr: BoardSquare[] = [];
      for (let c = 0; c < 8; c++) {
        const renderRow = this.myColor === 'w' ? r : 7 - r;
        const renderCol = this.myColor === 'w' ? c : 7 - c;

        const file = String.fromCharCode(97 + renderCol);
        const rank = 8 - renderRow;
        const square = `${file}${rank}` as Square;
        const piece = boardState[renderRow][renderCol];

        rowArr.push({
          square,
          row: renderRow,
          col: renderCol,
          piece,
          isLight: (renderRow + renderCol) % 2 === 0
        });
      }
      grid.push(rowArr);
    }
    this.boardGrid = grid;
  }

  onSquareClick(sq: BoardSquare): void {
    if (!this.isMyTurn) return;

    if (this.selectedSquare && this.validMoves.includes(sq.square)) {
      this.executeMove(this.selectedSquare, sq.square);
      return;
    }

    if (sq.piece && sq.piece.color === this.myColor) {
      this.selectedSquare = sq.square;
      const moves = this.chess.moves({ square: sq.square, verbose: true });
      this.validMoves = moves.map(m => m.to as Square);
    } else {
      this.selectedSquare = null;
      this.validMoves = [];
    }
  }

  executeMove(from: Square, to: Square): void {
    const piece = this.chess.get(from);
    let promotion: PieceSymbol | undefined = undefined;
    if (piece?.type === 'p' && ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'))) {
      promotion = 'q';
    }

    this.applyMove(from, to, promotion, true);
  }

  applyMove(from: Square, to: Square, promotion?: PieceSymbol, isLocal: boolean = true): void {
    try {
      const move = this.chess.move({ from, to, promotion });
      if (move) {
        this.lastMove = { from, to };
        this.selectedSquare = null;
        this.validMoves = [];
        this.rebuildBoard();

        if (isLocal && !this.room?.isBotMatch) {
          this.socketService.sendGameAction(this.room.roomId, 'CHESS_MOVE', { from, to, promotion });
        }

        this.checkGameStatus();

        // Trigger Bot move if practicing against Computer
        if (this.room?.isBotMatch && !this.chess.isGameOver() && this.chess.turn() !== this.myColor) {
          setTimeout(() => this.triggerBotMove(), 750);
        }
      }
    } catch {
      this.selectedSquare = null;
      this.validMoves = [];
    }
  }

  triggerBotMove(): void {
    if (this.chess.isGameOver()) return;

    const possibleMoves = this.chess.moves({ verbose: true });
    if (possibleMoves.length === 0) return;

    // Pick capturing move if available, otherwise random legal move
    const captureMoves = possibleMoves.filter(m => m.captured);
    const chosenMove = captureMoves.length > 0
      ? captureMoves[Math.floor(Math.random() * captureMoves.length)]
      : possibleMoves[Math.floor(Math.random() * possibleMoves.length)];

    this.applyMove(chosenMove.from as Square, chosenMove.to as Square, chosenMove.promotion as PieceSymbol, false);
  }

  checkGameStatus(): void {
    if (this.chess.isCheckmate()) {
      this.stopTurnClock();
      const winningColor = this.chess.turn() === 'w' ? 'b' : 'w';
      const winner = winningColor === 'w' ? this.whitePlayer : this.blackPlayer;

      if (this.room?.isBotMatch) {
        this.finishMatch.emit({ won: winner.color === this.myColor, winnerName: winner.username });
      } else if (this.myUserId === winner.userId) {
        this.socketService.claimRank(this.room.roomId, winner.userId);
      }
    } else if (this.chess.isDraw() || this.chess.isStalemate() || this.chess.isThreefoldRepetition()) {
      this.stopTurnClock();
      if (this.room?.isBotMatch) {
        this.finishMatch.emit({ won: false, winnerName: 'Draw Match' });
      } else {
        this.socketService.forfeitMatch(this.room.roomId, 'DRAW');
      }
    }
  }

  handleResignation(resignedUserId: string): void {
    this.stopTurnClock();
    const winnerId = resignedUserId === this.whitePlayer.userId ? this.blackPlayer.userId : this.whitePlayer.userId;

    if (this.room?.isBotMatch) {
      this.finishMatch.emit({ won: false, winnerName: this.blackPlayer.username });
    } else if (this.myUserId === winnerId) {
      this.socketService.claimRank(this.room.roomId, winnerId);
    }
  }

  resignGame(): void {
    if (confirm('Are you sure you want to resign the game?')) {
      if (this.room?.isBotMatch) {
        this.handleResignation(this.myUserId);
      } else {
        this.socketService.sendGameAction(this.room.roomId, 'CHESS_RESIGN', { resignedUserId: this.myUserId });
        this.handleResignation(this.myUserId);
      }
    }
  }

  startTurnClock(): void {
    this.stopTurnClock();
    this.turnClockSub = interval(1000).subscribe(() => {
      const current = this.activeTurnPlayer;
      if (current.timer > 0) {
        current.timer--;
      } else {
        this.stopTurnClock();
        const winner = current.color === 'w' ? this.blackPlayer : this.whitePlayer;

        if (this.room?.isBotMatch) {
          this.finishMatch.emit({ won: winner.color === this.myColor, winnerName: winner.username });
        } else if (this.myUserId === winner.userId) {
          this.socketService.claimRank(this.room.roomId, winner.userId);
        }
      }
    });
  }

  stopTurnClock(): void {
    this.turnClockSub?.unsubscribe();
  }

  formatTime(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  getPieceGlyph(piece: { type: PieceSymbol; color: Color } | null): string {
    if (!piece) return '';
    return this.PIECE_ICONS[`${piece.color}_${piece.type}`] || '';
  }

  ngOnDestroy(): void {
    this.stopTurnClock();
    this.subscriptions.unsubscribe();
  }
}