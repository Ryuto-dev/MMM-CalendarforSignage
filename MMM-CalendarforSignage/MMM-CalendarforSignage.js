/*
 * MMM-CalendarforSignage
 *
 * 「家族共有の予定を、リビングの壁掛けカレンダーに書き込む」体験をデジタル化するための
 * MagicMirror² モジュール。iCal (.ics) フィードを解析し、フルスクリーンのカレンダー面と
 * して表示することを想定している（position は fullscreen_above 等のフルスクリーン系
 * のみをサポート）。
 */

Module.register("MMM-CalendarforSignage", {
  defaults: {
    // カレンダー定義: [{ name, url, color }]
    calendars: [],

    // データ更新間隔 (ms)
    updateInterval: 10 * 60 * 1000,

    // 週の始まりを月曜にするか（false = 日曜始まり）
    weekStartsOnMonday: false,

    // サイドパネル（時計・今日の予定・直近の予定）を左右どちらに置くか
    sidebarPosition: "right",

    // 「直近の予定」パネルに表示する日数（今日を除く）
    upcomingDays: 5,

    // 月表示の1マスに表示する最大イベント数（超過分は "+N" バッジ）
    maxEventsPerDay: 4,

    // カレンダーの色分け凡例を表示するか
    showLegend: true,

    // 時計に秒を表示するか
    showSeconds: false,

    // ダーク / ライト
    theme: "dark",

    // タイトル文字列（キーワード）による色の上書きルール
    // [{ keyword: "誕生日", color: "#E91E63" }, ...]
    colorRules: [],

    // 表示ロケール
    locale: "ja-JP",

    // アニメーション速度
    fadeSpeed: 800,

    // デバッグログ
    debug: false,
  },

  events: [],
  calendarStatus: [],
  loaded: false,
  lastUpdatedAt: null,
  _clockTimer: null,
  _midnightTimer: null,

  start() {
    this._compiledColorRules = (this.config.colorRules || []).map((rule) => ({
      ...rule,
      pattern: rule.keyword instanceof RegExp ? rule.keyword : new RegExp(rule.keyword, "i"),
    }));

    // 表示中の月（デフォルトは今月）。将来的な月送り拡張のために保持しておく。
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();

    this.sendSocketNotification("CFS_INIT", this.config);
    this.scheduleMidnightRefresh();
  },

  getStyles() {
    return ["MMM-CalendarforSignage.css"];
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CFS_EVENTS") {
      this.events = payload.events || [];
      this.calendarStatus = payload.calendarStatus || [];
      this.lastUpdatedAt = payload.updatedAt ? new Date(payload.updatedAt) : new Date();
      this.loaded = true;
      this.updateDom(this.config.fadeSpeed);
    }
  },

  // 日付が変わった瞬間に月表示・今日/直近パネルを再構築する
  scheduleMidnightRefresh() {
    if (this._midnightTimer) clearTimeout(this._midnightTimer);
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 5, 0);
    this._midnightTimer = setTimeout(() => {
      const today = new Date();
      this.viewYear = today.getFullYear();
      this.viewMonth = today.getMonth();
      this.updateDom(0);
      this.scheduleMidnightRefresh();
    }, next - now);
  },

  // ── DOM 構築 ──────────────────────────────────────────────

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = `cfs-wrapper cfs-theme-${this.config.theme === "light" ? "light" : "dark"}`;
    wrapper.classList.add(this.config.sidebarPosition === "left" ? "cfs-sidebar-left" : "cfs-sidebar-right");
    wrapper.style.setProperty("--cfs-max-events", String(this.config.maxEventsPerDay ?? 4));

    if (!this.loaded) {
      wrapper.appendChild(this.buildLoading());
      return wrapper;
    }

    const sidebar = this.buildSidebar();
    const main = this.buildMain();

    if (this.config.sidebarPosition === "left") {
      wrapper.appendChild(sidebar);
      wrapper.appendChild(main);
    } else {
      wrapper.appendChild(main);
      wrapper.appendChild(sidebar);
    }

    // 初回描画後に時計を独立して駆動する（全体再描画のちらつきを避けるため）
    this.startClock(sidebar);

    return wrapper;
  },

  buildLoading() {
    const el = document.createElement("div");
    el.className = "cfs-loading";
    el.innerHTML = `
      <div class="cfs-spinner"></div>
      <div class="cfs-loading-text">カレンダーを読み込み中…</div>
    `;
    return el;
  },

  // ── サイドパネル：時計 / 今日の予定 / 直近の予定 / 凡例 ──────

  buildSidebar() {
    const panel = document.createElement("div");
    panel.className = "cfs-sidebar";

    panel.appendChild(this.buildClock());
    panel.appendChild(this.buildTodayPanel());
    panel.appendChild(this.buildUpcomingPanel());

    if (this.config.showLegend && this.config.calendars.length > 0) {
      panel.appendChild(this.buildLegend());
    }

    return panel;
  },

  buildClock() {
    const clock = document.createElement("div");
    clock.className = "cfs-clock";

    const time = document.createElement("div");
    time.className = "cfs-clock-time";
    time.setAttribute("data-cfs-role", "time");

    const date = document.createElement("div");
    date.className = "cfs-clock-date";
    date.setAttribute("data-cfs-role", "date");

    clock.appendChild(time);
    clock.appendChild(date);
    return clock;
  },

  startClock(sidebarEl) {
    if (this._clockTimer) clearInterval(this._clockTimer);

    const timeEl = sidebarEl.querySelector('[data-cfs-role="time"]');
    const dateEl = sidebarEl.querySelector('[data-cfs-role="date"]');
    if (!timeEl || !dateEl) return;

    const render = () => {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const ss = String(now.getSeconds()).padStart(2, "0");
      timeEl.textContent = this.config.showSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
      dateEl.textContent = now.toLocaleDateString(this.config.locale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      });
    };

    render();
    this._clockTimer = setInterval(render, 1000);
  },

  buildTodayPanel() {
    const wrap = document.createElement("div");
    wrap.className = "cfs-panel cfs-today-panel";

    const heading = document.createElement("div");
    heading.className = "cfs-panel-heading";
    heading.textContent = "今日の予定";
    wrap.appendChild(heading);

    const today = new Date();
    const list = this.getEventsForDay(today);

    const body = document.createElement("div");
    body.className = "cfs-panel-body";

    if (list.length === 0) {
      body.appendChild(this.buildEmptyRow("予定はありません"));
    } else {
      list.forEach((ev) => body.appendChild(this.buildScheduleRow(ev)));
    }

    wrap.appendChild(body);
    return wrap;
  },

  buildUpcomingPanel() {
    const wrap = document.createElement("div");
    wrap.className = "cfs-panel cfs-upcoming-panel";

    const heading = document.createElement("div");
    heading.className = "cfs-panel-heading";
    heading.textContent = "直近の予定";
    wrap.appendChild(heading);

    const body = document.createElement("div");
    body.className = "cfs-panel-body";

    const days = Math.max(1, this.config.upcomingDays || 5);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let anyRendered = false;

    for (let i = 1; i <= days; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const list = this.getEventsForDay(date);
      if (list.length === 0) continue;

      anyRendered = true;
      body.appendChild(this.buildUpcomingDateHeader(date));
      list.forEach((ev) => body.appendChild(this.buildScheduleRow(ev, { compact: true })));
    }

    if (!anyRendered) {
      body.appendChild(this.buildEmptyRow("しばらく予定はありません"));
    }

    wrap.appendChild(body);
    return wrap;
  },

  buildUpcomingDateHeader(date) {
    const el = document.createElement("div");
    el.className = "cfs-upcoming-date";
    el.textContent = date.toLocaleDateString(this.config.locale, {
      month: "long",
      day: "numeric",
      weekday: "short",
    });
    return el;
  },

  buildEmptyRow(text) {
    const el = document.createElement("div");
    el.className = "cfs-empty-row";
    el.textContent = text;
    return el;
  },

  buildScheduleRow(ev, opts = {}) {
    const row = document.createElement("div");
    row.className = "cfs-schedule-row" + (opts.compact ? " cfs-schedule-row--compact" : "");

    const color = this.getEventColor(ev);
    row.style.setProperty("--ev-color", color);

    const bar = document.createElement("div");
    bar.className = "cfs-schedule-bar";

    const content = document.createElement("div");
    content.className = "cfs-schedule-content";

    const time = document.createElement("div");
    time.className = "cfs-schedule-time";
    time.textContent = this.formatTimeRange(ev);

    const title = document.createElement("div");
    title.className = "cfs-schedule-title";
    title.textContent = ev.title;

    content.appendChild(time);
    content.appendChild(title);

    if (ev.location && !opts.compact) {
      const loc = document.createElement("div");
      loc.className = "cfs-schedule-loc";
      loc.textContent = ev.location;
      content.appendChild(loc);
    }

    row.appendChild(bar);
    row.appendChild(content);
    return row;
  },

  formatTimeRange(ev) {
    if (ev.allDay) return "終日";
    const start = new Date(ev.start);
    const end = new Date(ev.end);
    const t1 = start.toLocaleTimeString(this.config.locale, { hour: "2-digit", minute: "2-digit" });
    const t2 = end.toLocaleTimeString(this.config.locale, { hour: "2-digit", minute: "2-digit" });
    return `${t1} – ${t2}`;
  },

  buildLegend() {
    const wrap = document.createElement("div");
    wrap.className = "cfs-legend";
    this.config.calendars.forEach((cal) => {
      const item = document.createElement("div");
      item.className = "cfs-legend-item";

      const dot = document.createElement("span");
      dot.className = "cfs-legend-dot";
      dot.style.backgroundColor = cal.color || "#4285F4";

      const label = document.createElement("span");
      label.className = "cfs-legend-label";
      label.textContent = cal.name || "カレンダー";

      item.appendChild(dot);
      item.appendChild(label);
      wrap.appendChild(item);
    });
    return wrap;
  },

  // ── メイン：月表示グリッド（壁掛けカレンダー面） ─────────────

  buildMain() {
    const main = document.createElement("div");
    main.className = "cfs-main";

    main.appendChild(this.buildMonthHeader());
    main.appendChild(this.buildWeekdayHeader());
    main.appendChild(this.buildMonthGrid());

    return main;
  },

  buildMonthHeader() {
    const header = document.createElement("div");
    header.className = "cfs-month-header";

    const title = document.createElement("div");
    title.className = "cfs-month-title";
    const label = new Date(this.viewYear, this.viewMonth, 1).toLocaleDateString(this.config.locale, {
      year: "numeric",
      month: "long",
    });
    title.textContent = label;

    header.appendChild(title);
    return header;
  },

  buildWeekdayHeader() {
    const days = this.config.weekStartsOnMonday
      ? ["月", "火", "水", "木", "金", "土", "日"]
      : ["日", "月", "火", "水", "木", "金", "土"];

    const row = document.createElement("div");
    row.className = "cfs-weekday-header";
    days.forEach((d, i) => {
      const cell = document.createElement("div");
      cell.className = "cfs-weekday-cell";
      if (!this.config.weekStartsOnMonday && i === 0) cell.classList.add("cfs-weekday-sun");
      if (!this.config.weekStartsOnMonday && i === 6) cell.classList.add("cfs-weekday-sat");
      if (this.config.weekStartsOnMonday && i === 5) cell.classList.add("cfs-weekday-sat");
      if (this.config.weekStartsOnMonday && i === 6) cell.classList.add("cfs-weekday-sun");
      cell.textContent = d;
      row.appendChild(cell);
    });
    return row;
  },

  // 月表示に必要な週数（前後の月の日付でグリッドを埋める）分の日付配列を作る
  getMonthGridDates() {
    const firstOfMonth = new Date(this.viewYear, this.viewMonth, 1);
    const dow = firstOfMonth.getDay();
    const leading = this.config.weekStartsOnMonday ? (dow === 0 ? 6 : dow - 1) : dow;

    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - leading);

    const lastOfMonth = new Date(this.viewYear, this.viewMonth + 1, 0);
    const dowEnd = lastOfMonth.getDay();
    const trailing = this.config.weekStartsOnMonday ? (dowEnd === 0 ? 0 : 7 - dowEnd) : 6 - dowEnd;

    const totalDays = leading + lastOfMonth.getDate() + trailing;
    const weeks = Math.ceil(totalDays / 7);

    const dates = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      dates.push(d);
    }
    return { dates, weeks };
  },

  buildMonthGrid() {
    const { dates, weeks } = this.getMonthGridDates();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const grid = document.createElement("div");
    grid.className = "cfs-month-grid";
    grid.style.setProperty("--cfs-weeks", String(weeks));

    dates.forEach((date) => {
      const inMonth = date.getMonth() === this.viewMonth;
      const isToday = date.getTime() === today.getTime();
      const isPast = date < today;
      grid.appendChild(this.buildDayCell(date, { inMonth, isToday, isPast }));
    });

    return grid;
  },

  buildDayCell(date, { inMonth, isToday, isPast }) {
    const cell = document.createElement("div");
    let cls = "cfs-day";
    if (!inMonth) cls += " cfs-day-outside";
    if (isToday) cls += " cfs-day-today";
    if (isPast && inMonth) cls += " cfs-day-past";
    if (date.getDay() === 0) cls += " cfs-day-sun";
    if (date.getDay() === 6) cls += " cfs-day-sat";
    cell.className = cls;

    const num = document.createElement("div");
    num.className = "cfs-day-number";
    num.textContent = date.getDate();
    cell.appendChild(num);

    const eventsForDay = this.getEventsForDay(date);
    const max = this.config.maxEventsPerDay ?? 4;

    const eventsWrap = document.createElement("div");
    eventsWrap.className = "cfs-day-events";

    eventsForDay.slice(0, max).forEach((ev) => {
      eventsWrap.appendChild(this.buildEventChip(ev));
    });

    cell.appendChild(eventsWrap);

    if (eventsForDay.length > max) {
      const badge = document.createElement("div");
      badge.className = "cfs-day-more";
      badge.textContent = `+${eventsForDay.length - max}`;
      cell.appendChild(badge);
    }

    return cell;
  },

  buildEventChip(ev) {
    const chip = document.createElement("div");
    chip.className = "cfs-event-chip";
    chip.style.setProperty("--ev-color", this.getEventColor(ev));
    chip.title = ev.title;

    const label = document.createElement("span");
    label.className = "cfs-event-chip-label";
    label.textContent = ev.title;

    chip.appendChild(label);
    return chip;
  },

  // ── イベント抽出 / 色決定ロジック ─────────────────────────

  getEventsForDay(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const next = new Date(d);
    next.setDate(d.getDate() + 1);

    return this.events
      .filter((ev) => {
        const start = new Date(ev.start);
        const end = new Date(ev.end);

        if (ev.allDay) {
          const s = new Date(start);
          s.setHours(0, 0, 0, 0);
          const e = new Date(end);
          e.setHours(0, 0, 0, 0);
          return d >= s && d < e;
        }

        return start < next && end > d;
      })
      .sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        return new Date(a.start) - new Date(b.start);
      });
  },

  // 色の優先順位: iCal COLOR プロパティ → colorRules（タイトルキーワード） → カレンダー既定色
  getEventColor(ev) {
    if (ev.eventColor) return ev.eventColor;

    if (this._compiledColorRules && this._compiledColorRules.length) {
      for (const rule of this._compiledColorRules) {
        if (!rule.pattern || !rule.color) continue;
        if (rule.pattern.test(ev.title)) return rule.color;
      }
    }

    return ev.calendarColor || "#4285F4";
  },
});
