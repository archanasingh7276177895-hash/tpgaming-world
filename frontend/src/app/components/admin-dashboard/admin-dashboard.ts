import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css'
})
export class AdminDashboardComponent implements OnInit {
  activeSection: 'deposits' | 'withdrawals' | 'users' = 'deposits';
  depositFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'pending';
  withdrawalFilter: 'all' | 'pending' | 'approved' | 'rejected' = 'pending';

  searchTerm: string = '';
  sortBy: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc' = 'date_desc';

  // Pagination
  currentPage: number = 1;
  pageSize: number = 8;

  previewImageUrl: string | null = null;

  stats = {
    totalUsers: 0,
    pendingDeposits: 0,
    pendingWithdrawals: 0,
    totalPlatformBalance: 0,
    todayVolume: 0
  };

  deposits: any[] = [];
  withdrawals: any[] = [];
  users: any[] = [];
  loading: boolean = false;

  private readonly BASE_URL = 'https://tpgaming-world.onrender.com/api/admin';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.fetchStats();
    this.fetchDeposits();
    this.fetchWithdrawals();
    this.fetchUsers();
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({ 'Authorization': `Bearer ${token}` });
  }

  fetchStats(): void {
    this.http.get<any>(`${this.BASE_URL}/stats`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => this.stats = data,
      error: (err) => console.error('Stats error:', err)
    });
  }

  fetchDeposits(): void {
    this.http.get<any[]>(`${this.BASE_URL}/deposits?status=${this.depositFilter}`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.deposits = data || [];
        this.currentPage = 1;
      },
      error: (err) => console.error('Deposits error:', err)
    });
  }

  fetchWithdrawals(): void {
    this.http.get<any[]>(`${this.BASE_URL}/withdrawals?status=${this.withdrawalFilter}`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.withdrawals = data || [];
        this.currentPage = 1;
      },
      error: (err) => console.error('Withdrawals error:', err)
    });
  }

  fetchUsers(): void {
    this.http.get<any[]>(`${this.BASE_URL}/users`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.users = data || [];
        this.currentPage = 1;
      },
      error: (err) => console.error('Users error:', err)
    });
  }

  // --- Filtering and Sorting Getters ---
  private sortList(list: any[]): any[] {
    return [...list].sort((a, b) => {
      if (this.sortBy === 'date_desc') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (this.sortBy === 'date_asc') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (this.sortBy === 'amount_desc') return (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (this.sortBy === 'amount_asc') return (Number(a.amount) || 0) - (Number(b.amount) || 0);
      return 0;
    });
  }

  get filteredDeposits() {
    let list = this.deposits;
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      list = list.filter(d =>
        (d.username && d.username.toLowerCase().includes(term)) ||
        (d.utrNumber && d.utrNumber.toLowerCase().includes(term)) ||
        (d.utr && d.utr.toLowerCase().includes(term))
      );
    }
    return this.sortList(list);
  }

  get paginatedDeposits() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredDeposits.slice(start, start + this.pageSize);
  }

  get filteredWithdrawals() {
    let list = this.withdrawals;
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      list = list.filter(w =>
        (w.username && w.username.toLowerCase().includes(term)) ||
        (w.upiId && w.upiId.toLowerCase().includes(term)) ||
        (w.bankDetails?.accountNumber && w.bankDetails.accountNumber.includes(term))
      );
    }
    return this.sortList(list);
  }

  get paginatedWithdrawals() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredWithdrawals.slice(start, start + this.pageSize);
  }

  get filteredUsers() {
    let list = this.users;
    if (this.searchTerm.trim()) {
      const term = this.searchTerm.toLowerCase();
      list = list.filter(u =>
        (u.username && u.username.toLowerCase().includes(term)) ||
        (u.userId && u.userId.toLowerCase().includes(term)) ||
        (u.mobileNumber && u.mobileNumber.includes(term))
      );
    }
    return list;
  }

  get paginatedUsers() {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get totalPages(): number {
    let count = 0;
    if (this.activeSection === 'deposits') count = this.filteredDeposits.length;
    else if (this.activeSection === 'withdrawals') count = this.filteredWithdrawals.length;
    else if (this.activeSection === 'users') count = this.filteredUsers.length;
    return Math.ceil(count / this.pageSize) || 1;
  }

  setDepositFilter(filter: 'all' | 'pending' | 'approved' | 'rejected') {
    this.depositFilter = filter;
    this.fetchDeposits();
  }

  setWithdrawalFilter(filter: 'all' | 'pending' | 'approved' | 'rejected') {
    this.withdrawalFilter = filter;
    this.fetchWithdrawals();
  }

  // --- Admin Action Handlers ---
  approveDeposit(id: string): void {
    this.http.post<any>(`${this.BASE_URL}/deposits/approve/${id}`, {}, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchDeposits();
        this.fetchStats();
      },
      error: (err) => alert(err.error?.message || 'Error approving deposit.')
    });
  }

  rejectDeposit(id: string): void {
    const remark = prompt('Enter rejection reason:');
    if (remark === null) return;
    this.http.post<any>(`${this.BASE_URL}/deposits/reject/${id}`, { remark }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchDeposits();
        this.fetchStats();
      },
      error: (err) => alert(err.error?.message || 'Error rejecting deposit.')
    });
  }

  approveWithdrawal(id: string): void {
    const payoutRef = prompt('Enter Bank/UPI Reference No (UTR):', `PAY_${Date.now()}`);
    if (payoutRef === null) return;
    this.http.post<any>(`${this.BASE_URL}/withdrawals/approve/${id}`, { payoutRef }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchWithdrawals();
        this.fetchStats();
      },
      error: (err) => alert(err.error?.message || 'Error approving withdrawal.')
    });
  }

  rejectWithdrawal(id: string): void {
    const remark = prompt('Enter rejection reason (User will be refunded):');
    if (remark === null) return;
    this.http.post<any>(`${this.BASE_URL}/withdrawals/reject/${id}`, { remark }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchWithdrawals();
        this.fetchStats();
      },
      error: (err) => alert(err.error?.message || 'Error rejecting withdrawal.')
    });
  }

  adjustBalance(userId: string, username: string): void {
    const amountStr = prompt(`Add (+) or Subtract (-) balance for ${username}: (e.g. 500 or -200)`);
    if (!amountStr) return;
    const amount = Number(amountStr);
    if (isNaN(amount)) return alert('Invalid amount');

    this.http.post<any>(`${this.BASE_URL}/users/${userId}/balance`, { amount, type: 'add' }, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchUsers();
        this.fetchStats();
      },
      error: (err) => alert(err.error?.message || 'Error updating balance.')
    });
  }

  toggleBlockUser(userId: string, username: string): void {
    if (!confirm(`Are you sure you want to change account status for ${username}?`)) return;

    this.http.post<any>(`${this.BASE_URL}/users/${userId}/toggle-block`, {}, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        alert(res.message);
        this.fetchUsers();
      },
      error: (err) => alert(err.error?.message || 'Error updating account status.')
    });
  }

  getImageUrl(imagePath: string | undefined): string {
    if (!imagePath) return '';
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) return imagePath;
    let cleanPath = imagePath.replace(/\\/g, '/');
    if (!cleanPath.startsWith('/uploads/') && !cleanPath.startsWith('uploads/')) cleanPath = `uploads/${cleanPath}`;
    if (!cleanPath.startsWith('/')) cleanPath = `/${cleanPath}`;
    return `https://tpgaming-world.onrender.com${cleanPath}`;
  }

  openImageModal(url: string | undefined): void {
    if (url) this.previewImageUrl = this.getImageUrl(url);
  }

  closeImageModal(): void {
    this.previewImageUrl = null;
  }
}