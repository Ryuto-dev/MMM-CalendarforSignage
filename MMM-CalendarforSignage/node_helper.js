/*
 * MMM-CalendarforSignage / node_helper.js
 *
 * リビングの壁掛けカレンダーをデジタル化するコンセプトのモジュール。
 * 家族で共有している iCal (.ics) フィードを定期的に取得・解析し、
 * フロントエンド (MMM-CalendarforSignage.js) へイベント一覧を送る。
 */

const NodeHelper = require("node_helper");
const ical = require("node-ical");

module.exports = NodeHelper.create({
  start() {
    console.log(`[${this.name}] node helper started`);
    this.config = null;
    this.updateTimer = null;
  },

  stop() {
    if (this.updateTimer) clearInterval(this.updateTimer);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CFS_INIT") {
      this.config = payload;
      this.fetchAll();
      this.scheduleUpdate();
    } else if (notification === "CFS_FORCE_UPDATE") {
      this.fetchAll();
    }
  },

  scheduleUpdate() {
    if (this.updateTimer) clearInterval(this.updateTimer);
    const interval = this.config.updateInterval || 10 * 60 * 1000;
    this.updateTimer = setInterval(() => this.fetchAll(), interval);
  },

  // 取得ウィンドウ：今月の前後の余白 + 直近の予定表示に必要な分を広めに確保する。
  // (前後1ヶ月分ぐらい余裕を持たせておけば、月表示グリッドと「もうすぐの予定」
  //  パネルのどちらの計算にもフロント側でそのまま使い回せる)
  getFetchWindow() {
    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const upcomingPad = Math.max(this.config.upcomingDays || 7, 7) + 7;
    const windowEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    windowEnd.setDate(windowEnd.getDate() + upcomingPad);
    return { windowStart, windowEnd };
  },

  async fetchAll() {
    const { windowStart, windowEnd } = this.getFetchWindow();
    const allEvents = [];
    const calendarStatus = [];

    for (const cal of this.config.calendars || []) {
      try {
        const events = await this.fetchCalendar(cal, windowStart, windowEnd);
        allEvents.push(...events);
        calendarStatus.push({ name: cal.name, ok: true, count: events.length });
      } catch (err) {
        console.error(`[${this.name}] "${cal.name || cal.url}" の取得に失敗:`, err.message);
        calendarStatus.push({ name: cal.name, ok: false, error: err.message });
      }
    }

    allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

    this.sendSocketNotification("CFS_EVENTS", {
      events: allEvents,
      calendarStatus,
      updatedAt: new Date().toISOString(),
    });
  },

  async fetchCalendar(cal, windowStart, windowEnd) {
    const data = await ical.async.fromURL(cal.url, {});
    const events = [];

    for (const key in data) {
      const item = data[key];
      if (item.type !== "VEVENT") continue;

      if (item.rrule) {
        this.expandRecurring(item, cal, windowStart, windowEnd, events);
      } else {
        const start = this.toDate(item.start);
        const end = item.end ? this.toDate(item.end) : start;

        if (start <= windowEnd && end >= windowStart) {
          events.push(this.buildEvent(item, start, end, cal));
        }
      }
    }

    return events;
  },

  expandRecurring(item, cal, windowStart, windowEnd, events) {
    let occurrences;
    try {
      occurrences = item.rrule.between(windowStart, windowEnd, true);
    } catch (e) {
      return;
    }

    const duration = item.end
      ? this.toDate(item.end) - this.toDate(item.start)
      : 0;

    for (const date of occurrences) {
      // EXDATE (除外日) をスキップ
      if (item.exdate) {
        const dateStr = date.toDateString();
        const isException = Object.values(item.exdate).some(
          (ex) => new Date(ex).toDateString() === dateStr
        );
        if (isException) continue;
      }

      // 個別に変更された回 (RECURRENCE-ID) があれば差し替え
      let src = item;
      if (item.recurrences) {
        const dateStr = date.toDateString();
        const match = Object.entries(item.recurrences).find(
          ([k]) => new Date(k).toDateString() === dateStr
        );
        if (match) src = match[1];
      }

      const occStart = new Date(date);
      const occEnd = new Date(occStart.getTime() + duration);
      events.push(this.buildEvent(src, occStart, occEnd, cal));
    }
  },

  buildEvent(item, start, end, cal) {
    const allDay =
      item.datetype === "date" ||
      (item.start && typeof item.start.toISOString !== "function" && item.start.val);

    // node-ical は COLOR プロパティを文字列 or {val, params} の形で保持する
    let eventColor = item.color || null;
    if (eventColor && typeof eventColor === "object") {
      eventColor = eventColor.val || null;
    }
    if (eventColor) eventColor = String(eventColor).trim();

    return {
      id: `${item.uid || item.summary}_${start.getTime()}`,
      title: (item.summary || "(タイトルなし)").trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: !!allDay,
      location: item.location ? String(item.location).trim() : "",
      description: item.description ? String(item.description).trim() : "",
      calendarName: cal.name || "カレンダー",
      calendarColor: cal.color || "#4285F4",
      eventColor,
    };
  },

  toDate(val) {
    if (val instanceof Date) return val;
    if (val && val.toJSDate) return val.toJSDate();
    return new Date(val);
  },
});
