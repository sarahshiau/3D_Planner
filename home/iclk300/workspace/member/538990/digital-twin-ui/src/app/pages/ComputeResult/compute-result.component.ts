import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ResultDataService } from 'src/app/services/result-data.service';

@Component({
  selector: 'app-compute-result',
  templateUrl: './compute-result.component.html',
  styleUrls: ['./compute-result.component.scss'],
})
export class ComputeResultComponent implements OnInit {
  resultData: any = null;
  loading = false;

  constructor(
    private router: Router,
    private resultDataService: ResultDataService
  ) {}

  ngOnInit(): void {
    // 訂閱結果數據
    const mvpData = this.resultDataService.resultMvp();
    if (mvpData) {
      this.resultData = mvpData;
    }
  }

  onBackClick(): void {
    this.router.navigate(['/editscene']);
  }
}
