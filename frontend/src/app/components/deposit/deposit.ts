import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-deposit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './deposit.html',
  styleUrl: './deposit.css'
})
export class DepositComponent implements OnInit {
  upiId: string = '7276177895@slc';
  accountHolder: string = 'MISS ARCHANA ARVIND PRATAP';
  qrCodeUrl: string = 'assets/upi-qr.jpg';

  amount: number = 100;
  utrNumber: string = '';
  selectedFile: File | null = null;

  quickAmounts: number[] = [100, 200, 500, 1000, 2000];
  
  loading: boolean = false;
  message: string = '';
  isError: boolean = false;
  history: any[] = [];

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchHistory();
  }

  selectAmount(val: number) {
    this.amount = val;
  }

  onFileSelected(event: any) {
    if (event.target.files.length > 0) {
      this.selectedFile = event.target.files[0];
    }
  }

  copyUpi() {
    navigator.clipboard.writeText(this.upiId);
    alert('UPI ID copied to clipboard!');
  }

  submitDeposit() {
    if (!this.amount || this.amount < 10) {
      this.isError = true;
      this.message = 'Minimum deposit amount is ₹10.';
      return;
    }

    if (!this.utrNumber || this.utrNumber.length < 6) {
      this.isError = true;
      this.message = 'Please enter a valid 12-digit UTR / Reference Number.';
      return;
    }

    this.loading = true;
    this.message = '';

    const formData = new FormData();
    formData.append('amount', this.amount.toString());
    formData.append('utrNumber', this.utrNumber.trim());
    if (this.selectedFile) {
      formData.append('screenshot', this.selectedFile);
    }

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    this.http.post('http://localhost:5000/deposit/request', formData, { headers }).subscribe({
      next: (res: any) => {
        this.loading = false;
        this.isError = false;
        this.message = res.message;
        this.utrNumber = '';
        this.selectedFile = null;
        this.fetchHistory();
      },
      error: (err) => {
        this.loading = false;
        this.isError = true;
        this.message = err.error?.message || 'Failed to submit deposit request.';
      }
    });
  }

  fetchHistory() {
    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    this.http.get('http://localhost:5000/deposit/my-history', { headers }).subscribe({
      next: (res: any) => {
        this.history = res;
      },
      error: (err) => console.error('Error fetching deposit history:', err)
    });
  }
}