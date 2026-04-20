import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root'
})
export class TranslationService {
  private defaultLang: 'zh' | 'en' = 'zh';

  constructor(private translate: TranslateService) {
    const savedLang = (localStorage.getItem('lang') as 'zh' | 'en') || this.defaultLang;

    this.translate.setDefaultLang(this.defaultLang);
    this.translate.use(savedLang);
  }

  /** 取得目前語言 */
  get currentLang(): 'zh' | 'en' {
    return this.translate.currentLang as 'zh' | 'en';
  }

  /** 切換語言並記錄在 localStorage */
  switchLang(lang: 'zh' | 'en') {
    this.translate.use(lang);
    localStorage.setItem('lang', lang);
  }

  /** 取得翻譯文字（程式中使用） */
  instant(key: string): string {
    return this.translate.instant(key);
  }
}
