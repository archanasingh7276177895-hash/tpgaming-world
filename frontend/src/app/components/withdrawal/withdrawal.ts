import { Component, OnInit, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-withdrawal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './withdrawal.html',
  styleUrl: './withdrawal.css'
})
export class WithdrawalComponent implements OnInit, OnChanges {
  @Input() walletBalance: number = 0;
  @Output() navigateBack = new EventEmitter<void>();
  @Output() balanceUpdated = new EventEmitter<number>();

  // Form State
  payoutMethod: 'UPI' | 'BANK' = 'UPI';
  amount: number | null = null;
  upiId: string = '';
  bankDetails = {
    accountHolderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    ifsc: ''
  };

  // UI Helpers
  quickAmounts: number[] = [100, 200, 500, 1000, 2000];
  userBalance: number = 0;
  history: any[] = [];
  loading: boolean = false;
  historyLoading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  private readonly API_URL = 'https://tpgaming-world.onrender.com/api/withdraw';

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    if (this.walletBalance > 0) {
      this.userBalance = this.walletBalance;
    } else {
      this.loadUserBalance();
    }
    this.fetchWithdrawalHistory();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['walletBalance'] && changes['walletBalance'].currentValue !== undefined) {
      this.userBalance = Number(changes['walletBalance'].currentValue);
    }
  }

  private getAuthHeaders(): HttpHeaders {
    const token = localStorage.getItem('token') || '';
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  loadUserBalance(): void {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        this.userBalance = user.balance ?? user.walletBalance ?? 0;
      } catch (e) {
        this.userBalance = 0;
      }
    }
  }

  setPayoutMethod(method: 'UPI' | 'BANK'): void {
    this.payoutMethod = method;
    this.errorMessage = '';
  }

  setAmount(value: number): void {
    this.amount = value;
  }

  setMaxAmount(): void {
    this.amount = this.userBalance;
  }

  goHome(): void {
    this.navigateBack.emit();
  }

  // ==========================================
  // FETCH WITHDRAWAL HISTORY
  // ==========================================
  fetchWithdrawalHistory(): void {
    const token = localStorage.getItem('token');
    if (!token) return;

    this.historyLoading = true;
    this.http.get<any[]>(`${this.API_URL}/my-history`, { headers: this.getAuthHeaders() }).subscribe({
      next: (data) => {
        this.historyLoading = false;
        this.history = data || [];
      },
      error: (err) => {
        this.historyLoading = false;
        console.error('Failed to load history:', err);
      }
    });
  }

  // ==========================================
  // SUBMIT WITHDRAWAL REQUEST
  // ==========================================
  onSubmitWithdrawal(): void {
    this.errorMessage = '';
    this.successMessage = '';

    const numAmount = Number(this.amount);

    if (!numAmount || numAmount < 10) {
      this.errorMessage = 'Minimum withdrawal amount is ₹10.';
      return;
    }

    if (numAmount > this.userBalance) {
      this.errorMessage = `Insufficient funds. Your available balance is ₹${this.userBalance}.`;
      return;
    }

    // Validation based on method
    if (this.payoutMethod === 'UPI') {
      if (!this.upiId || !this.upiId.includes('@')) {
        this.errorMessage = 'Please enter a valid UPI ID (e.g. username@upi).';
        return;
      }
    } else {
      if (!this.bankDetails.accountHolderName.trim()) {
        this.errorMessage = 'Please enter Account Holder Name.';
        return;
      }
      if (!this.bankDetails.accountNumber.trim()) {
        this.errorMessage = 'Please enter Account Number.';
        return;
      }
      if (this.bankDetails.accountNumber !== this.bankDetails.confirmAccountNumber) {
        this.errorMessage = 'Bank Account Numbers do not match.';
        return;
      }
      if (!this.bankDetails.ifsc || this.bankDetails.ifsc.trim().length < 5) {
        this.errorMessage = 'Please enter a valid IFSC Code.';
        return;
      }
    }

    const payload = {
      amount: numAmount,
      payoutMethod: this.payoutMethod === 'UPI' ? 'UPI' : 'BANK_TRANSFER',
      upiId: this.payoutMethod === 'UPI' ? this.upiId.trim() : '',
      bankDetails: this.payoutMethod === 'BANK' ? {
        accountHolderName: this.bankDetails.accountHolderName.trim(),
        accountNumber: this.bankDetails.accountNumber.trim(),
        ifsc: this.bankDetails.ifsc.trim().toUpperCase()
      } : {}
    };

    this.loading = true;

    this.http.post<any>(`${this.API_URL}/request`, payload, { headers: this.getAuthHeaders() }).subscribe({
      next: (res) => {
        this.loading = false;
        this.successMessage = res.message || 'Withdrawal request submitted successfully!';

        if (res.newBalance !== undefined) {
          const freshBalance = Number(res.newBalance);
          this.userBalance = freshBalance;

          const userStr = localStorage.getItem('user');
          if (userStr) {
            const user = JSON.parse(userStr);
            user.balance = freshBalance;
            user.walletBalance = freshBalance;
            localStorage.setItem('user', JSON.stringify(user));
          }

          // Emit to parent so app header updates immediately
          this.balanceUpdated.emit(freshBalance);
        }

        // Reset inputs
        this.amount = null;
        this.upiId = '';
        this.bankDetails = { accountHolderName: '', accountNumber: '', confirmAccountNumber: '', ifsc: '' };

        // Refresh History List
        this.fetchWithdrawalHistory();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to submit withdrawal request.';
      }
    });
  }
}