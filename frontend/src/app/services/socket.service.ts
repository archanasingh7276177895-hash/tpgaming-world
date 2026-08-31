import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private readonly SOCKET_URL = 'http://localhost:5000';

  connect(): void {
    if (!this.socket) {
      this.socket = io(this.SOCKET_URL, {
        transports: ['websocket', 'polling']
      });
    }
  }

  joinMatchmaking(payload: { userId: string; username: string; gameType: string; playerMode: number | string; entryFee: number }): void {
    this.socket?.emit('join_matchmaking', payload);
  }

  cancelMatchmaking(): void {
    this.socket?.emit('cancel_matchmaking');
  }

  sendGameAction(roomId: string, action: string, data: any): void {
    this.socket?.emit('game_action', { roomId, action, data });
  }

  claimVictory(roomId: string, winnerUserId: string, reason: string = 'Victory Achieved'): void {
    this.socket?.emit('player_rank_achieved', { roomId, userId: winnerUserId, reason });
  }

  claimRank(roomId: string, userId: string, reason?: string): void {
    this.socket?.emit('player_rank_achieved', { roomId, userId, reason });
  }

  eliminatePlayer(roomId: string, userId: string, username: string): void {
    this.socket?.emit('player_eliminated', { roomId, userId, username });
  }

  forfeitMatch(roomId: string, forfeitUserId: string): void {
    this.socket?.emit('forfeit_match', { roomId, forfeitUserId });
  }

  onMatchmakingStatus(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('matchmaking_status', (data) => observer.next(data));
    });
  }

  onMatchFound(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('match_found', (data) => observer.next(data));
    });
  }

  onMatchmakingError(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('matchmaking_error', (data) => observer.next(data));
    });
  }

  onMatchmakingCancelled(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('matchmaking_cancelled', (data) => observer.next(data));
    });
  }

  onGameAction(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('game_action_received', (data) => observer.next(data));
    });
  }

  onPlayerRank(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('player_finished_rank', (data) => observer.next(data));
    });
  }

  onPlayerEliminated(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('player_eliminated_sync', (data) => observer.next(data));
    });
  }

  onGameEnded(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('game_ended', (data) => observer.next(data));
    });
  }

  onBalanceUpdated(): Observable<any> {
    return new Observable((observer) => {
      this.socket?.on('balance_updated', (data) => observer.next(data));
    });
  }
}