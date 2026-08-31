import { Component, Input, Output, EventEmitter, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css'
})
export class NavbarComponent {
  @Input() isLoggedIn: boolean = false;
  @Input() walletBalance: number = 0;
  @Input() userId: string = '';
  @Input() userRole: string = 'user';

  @Output() navigate = new EventEmitter<string>();
  @Output() logout = new EventEmitter<void>();

  isDropdownOpen: boolean = false;

  constructor(private elementRef: ElementRef) {}

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  onNavigate(page: string): void {
    this.isDropdownOpen = false;
    this.navigate.emit(page);
  }

  onLogout(): void {
    this.isDropdownOpen = false;
    this.logout.emit();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isDropdownOpen = false;
    }
  }
}