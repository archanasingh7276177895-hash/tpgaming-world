import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Withdrawal } from './withdrawal';

describe('Withdrawal', () => {
  let component: Withdrawal;
  let fixture: ComponentFixture<Withdrawal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Withdrawal],
    }).compileComponents();

    fixture = TestBed.createComponent(Withdrawal);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
