import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './change-password.html',
  styleUrl: './change-password.css'
})
export class ChangePasswordComponent {
  @Output() navigateBack = new EventEmitter<void>();

  currentPassword: string = '';
  newPassword: string = '';
  confirmPassword: string = '';

  loading: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';

  private readonly API_URL = 'https://tpgaming-world.onrender.com/api/auth/change-password';

  constructor(private http: HttpClient) {}

  onSubmit(): void {
    this.errorMessage = '';
    this.successMessage = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.errorMessage = 'Please fill in all password fields.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMessage = 'New password and confirmation do not match.';
      return;
    }

    if (this.newPassword.length < 6) {
      this.errorMessage = 'New password must be at least 6 characters.';
      return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
      this.errorMessage = 'Authentication expired. Please log in again.';
      return;
    }

    this.loading = true;
    const headers = new HttpHeaders({ 'Authorization': `Bearer ${token}` });

    const payload = {
      currentPassword: this.currentPassword,
      newPassword: this.newPassword,
      confirmPassword: this.confirmPassword
    };

    this.http.post<any>(this.API_URL, payload, { headers }).subscribe({
      next: (res) => {
        this.loading = false;
        this.successMessage = res.message || 'Password changed successfully!';
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = err.error?.message || 'Failed to update password. Please check your current password.';
      }
    });
  }

  goBack(): void {
    this.navigateBack.emit();
  }
}