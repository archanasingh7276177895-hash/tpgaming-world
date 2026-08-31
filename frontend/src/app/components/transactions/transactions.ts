import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-transactions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css'
})
export class TransactionsComponent implements OnInit {
  @Output() navigateBack = new EventEmitter<void>();

  transactions: any[] = [];
  loading: boolean = false;
  selectedFilter: 'ALL' | 'CREDIT' | 'DEBIT' = 'ALL';
  selectedType: string = 'ALL';
  searchTerm: string = '';

  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;

  userBalance: number = 0;
  totalCredits: number = 0;
  totalDebits: number = 0;

  private readonly API_URL = 'http://localhost:5000/api/transactions/my-transactions';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadUserData();
    this.fetchTransactions();
  }

  loadUserData(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      this.userBalance = user.balance ?? user.walletBalance ?? 0;
    }
  }

  fetchTransactions(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    this.loading = true;
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    this.http.get<any[]>(this.API_URL, { headers }).subscribe({
      next: (data) => {
        this.loading = false;
        this.transactions = data || [];
        this.calculateMetrics();
      },
      error: (err) => {
        this.loading = false;
        console.error('Failed to load passbook:', err);
      }
    });
  }

  calculateMetrics(): void {
    this.totalCredits = this.transactions
      .filter(t => t.category === 'CREDIT' && t.status === 'SUCCESS')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    this.totalDebits = this.transactions
      .filter(t => t.category === 'DEBIT' && (t.status === 'SUCCESS' || t.status === 'PENDING'))
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  }

  get filteredTransactions() {
    return this.transactions.filter(t => {
      // Category tab match
      const categoryMatch = this.selectedFilter === 'ALL' || t.category === this.selectedFilter;

      // Type dropdown match
      const typeMatch = this.selectedType === 'ALL' || t.type === this.selectedType;

      // Search match
      const search = this.searchTerm.toLowerCase().trim();
      const searchMatch = !search ||
        (t.description && t.description.toLowerCase().includes(search)) ||
        (t.referenceId && t.referenceId.toLowerCase().includes(search)) ||
        (t.type && t.type.toLowerCase().includes(search));

      return categoryMatch && typeMatch && searchMatch;
    });
  }

  get paginatedTransactions() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredTransactions.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    return Math.ceil(this.filteredTransactions.length / this.pageSize) || 1;
  }

  setFilter(filter: 'ALL' | 'CREDIT' | 'DEBIT'): void {
    this.selectedFilter = filter;
    this.currentPage = 1;
  }

  goHome(): void {
    this.navigateBack.emit();
  }
}