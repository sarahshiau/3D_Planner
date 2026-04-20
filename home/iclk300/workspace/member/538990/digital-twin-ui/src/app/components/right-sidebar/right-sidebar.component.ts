import { computed, signal } from '@angular/core';

export class YourComponent {
  bsRows = signal<any[]>([]); // Assuming bsRows is an array of objects
  currentFilter = signal<'all' | 'passed' | 'failed'>('all');
  currentPage = signal<number>(1);
  readonly pageSize = 10;
  readonly BS_POWER_THRESHOLD = 20;

  allFilteredRows = computed(() => {
    const rows = this.bsRows();
    const filter = this.currentFilter();
    if (filter === 'all') return rows;
    return rows.filter(bs => {
      const isPassed = bs.txPower >= this.BS_POWER_THRESHOLD;
      return filter === 'passed' ? isPassed : !isPassed;
    });
  });

  pagedBsRows = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.allFilteredRows().slice(start, start + this.pageSize);
  });

  totalPages = computed(() => Math.ceil(this.allFilteredRows().length / this.pageSize) || 1);

  setFilter(status: 'all' | 'passed' | 'failed') {
    this.currentFilter.set(status);
    this.currentPage.set(1);
  }

  changePage(delta: number) {
    const next = this.currentPage() + delta;
    if (next >= 1 && next <= this.totalPages()) {
      this.currentPage.set(next);
    }
  }
}