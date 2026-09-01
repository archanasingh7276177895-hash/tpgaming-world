import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';

export interface GameMatchRecord {
  roomId: string;
  gameType: string;
  entryFee: number;
  winnings: number;
  status: 'WON' | 'LOST' | 'REFUNDED';
  date: string;
  description: string;
}

@Component({
  selector: 'app-game-history',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-history.html',
  styleUrl: './game-history.css'
})
export class GameHistoryComponent implements OnInit {
  @Output() navigateBack = new EventEmitter<void>();

  history: GameMatchRecord[] = [];
  isLoading: boolean = true;
  filter: string = 'ALL';
  errorMessage: string = '';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    console.log('🎮 [GameHistoryComponent] Mounted');
    this.fetchGameHistory();
  }

  fetchGameHistory(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.http.get<{ success: boolean; data: GameMatchRecord[] }>(
      'https://tpgaming-world.onrender.com/api/transaction/game-history'
    ).subscribe({
      next: (res) => {
        this.isLoading = false;
        if (res && res.success) {
          this.history = Array.isArray(res.data) ? res.data : [];
        } else {
          this.history = [];
        }
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err.error?.message || 'Failed to load game history.';
        console.error('❌ [GameHistory] API Error:', err);
      }
    });
  }

  get filteredHistory(): GameMatchRecord[] {
    if (this.filter === 'ALL') return this.history;
    return this.history.filter(h => h.status === this.filter);
  }

  getGameIcon(gameType: string): string {
    const type = (gameType || '').toLowerCase();
    if (type.includes('ludo')) return '🎲';
    if (type.includes('snake')) return '🐍';
    if (type.includes('chess')) return '♟️';
    if (type.includes('fruit')) return '🍉';
    return '🎮';
  }

  getNetProfit(match: GameMatchRecord): number {
    return (Number(match.winnings) || 0) - (Number(match.entryFee) || 0);
  }

  backToDashboard(): void {
    this.navigateBack.emit();
  }
}