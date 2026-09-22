import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FieldService } from './field.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  readonly field = inject(FieldService);

  constructor() {
    void this.field.boot();
  }

  onAmount(id: string, event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    void this.field.patch(id, { amount: Number.isFinite(value) ? value : null });
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.field.captureFile(file);
    }
    input.value = '';
  }
}
