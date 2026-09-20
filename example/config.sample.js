/*
 * MMM-CalendarforSignage 設定サンプル
 *
 * このモジュールは「フルスクリーン専用」を想定しています。
 * MagicMirror の config.js の modules 配列に、position: "fullscreen_below"
 * (または fullscreen_above) として登録してください。
 * 通常のウィジェット的な position（top_left など）には対応していません。
 */

let config = {
  modules: [
    {
      module: "MMM-CalendarforSignage",
      position: "fullscreen_below",
      config: {
        // 家族で共有している iCal (.ics) の URL を並べる
        // Google カレンダーなら「設定と共有」→「カレンダーの統合」→
        // 「カレンダーの公開URL(iCal形式)」または「非公開URL(iCal形式)」を使用
        calendars: [
          {
            name: "家族共有",
            url: "https://calendar.google.com/calendar/ical/xxxxxxxx%40group.calendar.google.com/private-xxxxxxxxxxxxxxxxxxxxxxxxxxxx/basic.ics",
            color: "#5B9DFF",
          },
          {
            name: "お父さん",
            url: "https://calendar.google.com/calendar/ical/father%40example.com/private-xxxx/basic.ics",
            color: "#33B679",
          },
          {
            name: "お母さん",
            url: "https://calendar.google.com/calendar/ical/mother%40example.com/private-xxxx/basic.ics",
            color: "#F6BF26",
          },
        ],

        // データ更新間隔 (ミリ秒)
        updateInterval: 10 * 60 * 1000,

        // 表示モード: "month"（既定・月表示） / "2weeks"（今日から14日間の大型表示）
        // 旧コンフィグはこの項目なし = 月表示のまま（後方互換あり）
        viewMode: "month", // "2weeks" にするとフルHD 28型を3m先から見る想定の大型2週間表示
        // twoWeekDays: 14, // 2週間モードの日数（既定14）。変えたいときだけ指定
        // maxEventsPerDayTwoWeeks: 6, // 2週間モードだけ1マスの表示件数を増やしたいとき用（null = maxEventsPerDayを使用）

        // 週の始まり（false = 日曜始まり / true = 月曜始まり）
        weekStartsOnMonday: false,

        // 時計・今日の予定・直近の予定パネルの位置
        sidebarPosition: "right", // "left" | "right"

        // 直近の予定パネルに表示する日数
        upcomingDays: 5,

        // 1マスに表示する予定の最大数（超えると "+N" 表示）
        maxEventsPerDay: 4,

        // 凡例（カレンダーごとの色分け表示）
        showLegend: true,

        // 秒表示
        showSeconds: false,

        // "dark" | "light"
        theme: "dark",

        // タイトルのキーワードで色を上書き（誕生日やゴミ出しなど強調したい予定向け）
        colorRules: [
          { keyword: "誕生日", color: "#E91E63" },
          { keyword: "ゴミ|ごみ", color: "#8E24AA" },
          { keyword: "通院|病院", color: "#F4511E" },
        ],

        locale: "ja-JP",
      },
    },
  ],
};

/* eslint-disable-next-line no-undef */
if (typeof module !== "undefined") {
  module.exports = config;
}
