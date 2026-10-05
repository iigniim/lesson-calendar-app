/* South Korean public holidays for any year, computed by rule. Display only: never stored in lesson data.
   getHoliday('YYYY-MM-DD') -> holiday name or null. getLunar('YYYY-MM-DD') -> { month, day, isLeap } or null.

   Rules follow the Public Holidays Act / 관공서의 공휴일에 관한 규정 (art. 2-3), as summarised in
   python-holidays' South Korea module and the Ministry of Personnel Management notice that made
   Labor Day and Constitution Day public holidays (with substitutes) from 2026.
   Lunar dates come from Intl's Chinese calendar (getLunar), corrected by LUNAR_LATE for the months where the
   Korean calendar starts a day later (2020-2050 cross-checked in holidays.test.js; years after 2050 are unchecked). */
(function (root) {
  /* Temporary holidays (임시공휴일) and election days cannot be computed.
     Add a line here whenever the government announces one: 'YYYY-MM-DD': 'name'. */
  var EXTRA = {
    '2025-01-27': '임시공휴일',
    '2025-06-03': '대통령선거일',
    '2026-06-03': '지방선거일'
  };

  /* Intl's Chinese calendar runs on China time, Korea on KST: a few lunar months start one day later in Korea.
     These are the ICU month-start dates (solar) that need that shift, found by comparing with the Korean lunar table for 2020-2050. */
  var LUNAR_LATE = {};
  '2020-02-23 2023-05-19 2026-10-10 2028-01-26 2029-07-11 2030-02-02 2031-02-21 2035-01-09 2036-12-17 2040-09-06 2041-03-02 2046-06-04 2048-12-05 2050-02-21'
    .split(' ').forEach(function (d) { LUNAR_LATE[d] = 1; });

  var DAY = 86400000;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var lunarFmt = null;
  try { lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric' }); } catch (e) { /* no Intl chinese calendar: lunar dates are skipped */ }

  function icuLunar(s) {
    var p = {};
    lunarFmt.formatToParts(new Date(s + 'T12:00:00+09:00')).forEach(function (x) { p[x.type] = x.value; });
    return { month: parseInt(p.month, 10), day: parseInt(p.day, 10), isLeap: /bis/.test(p.month) };   // leap month looks like "6bis"
  }

  var lunarCache = {};
  /* getLunar('YYYY-MM-DD') -> { month, day, isLeap } in the Korean lunar calendar, or null */
  function getLunar(s) {
    if (lunarCache[s] !== undefined) return lunarCache[s];
    var out = null;
    if (lunarFmt && /^\d{4}-\d\d-\d\d$/.test(s) && !isNaN(Date.parse(s + 'T12:00:00+09:00'))) {
      var t = Date.parse(s + 'T00:00:00Z'), r = icuLunar(s);
      if (LUNAR_LATE[iso(t - (r.day - 1) * DAY)]) {
        // Korean month starts a day later: ICU day 1 is the 30th of the previous month, every other day is one less
        if (r.day === 1) { var prev = icuLunar(iso(t - DAY)); r = { month: prev.month, day: prev.day + 1, isLeap: prev.isLeap }; }
        else r = { month: r.month, day: r.day - 1, isLeap: r.isLeap };
      }
      out = r;
    }
    return (lunarCache[s] = out);
  }

  /* lunar month/day -> solar time of that Gregorian year (leap months are stored as "4bis" and never match a holiday) */
  function lunarDates(year) {
    var out = {};
    for (var t = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1); t < end; t += DAY) {
      var l = getLunar(iso(t));
      if (l) out[l.month + (l.isLeap ? 'bis' : '') + '/' + l.day] = t;
    }
    return out;
  }

  function build(year) {
    var base = {};      // date -> [names]
    var elig = {};      // date -> 'sun' | 'satsun' (gets a substitute holiday)
    function add(t, name, rule, since) {
      var k = iso(t);
      (base[k] = base[k] || []).push(name);
      if (rule && year >= since && elig[k] !== 'satsun') elig[k] = rule;
    }
    function fixed(m, d, name, rule, since) { add(Date.UTC(year, m - 1, d), name, rule, since); }

    fixed(1, 1, '새해첫날');
    fixed(3, 1, '삼일절', 'satsun', 2022);
    fixed(5, 5, '어린이날', 'satsun', 2015);
    fixed(6, 6, '현충일');
    fixed(8, 15, '광복절', 'satsun', 2021);
    fixed(10, 3, '개천절', 'satsun', 2021);
    if (year >= 2013) fixed(10, 9, '한글날', 'satsun', 2021);
    fixed(12, 25, '크리스마스', 'satsun', 2023);
    if (year >= 2026) { fixed(5, 1, '노동절', 'satsun', 2026); fixed(7, 17, '제헌절', 'satsun', 2026); }

    var lu = lunarDates(year);
    // Seollal / Chuseok: the day before, the day, the day after. Substitute only if one of them is a Sunday (or overlaps another holiday)
    [['1/1', '설날'], ['8/15', '추석']].forEach(function (h) {
      var t = lu[h[0]];
      if (t == null) return;
      [-1, 0, 1].forEach(function (o) { add(t + o * DAY, o === 0 ? h[1] : h[1] + ' 연휴', 'sun', 2014); });
    });
    if (lu['4/8'] != null) add(lu['4/8'], '부처님오신날', 'satsun', 2023);

    Object.keys(EXTRA).forEach(function (k) { if (k.slice(0, 4) === String(year)) (base[k] = base[k] || []).push(EXTRA[k]); });

    var out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k][0]; });
    // substitute holiday = first following day that is neither a weekend nor already a holiday
    Object.keys(elig).sort().forEach(function (k) {
      var t = Date.parse(k + 'T00:00:00Z'), w = new Date(t).getUTCDay();
      var hit = base[k].length > 1 || w === 0 || (w === 6 && elig[k] === 'satsun');
      if (!hit) return;
      do { t += DAY; w = new Date(t).getUTCDay(); } while (w === 0 || w === 6 || out[iso(t)]);
      out[iso(t)] = '대체공휴일';
    });
    return out;
  }

  var cache = {};
  function getHoliday(s) {
    var y = parseInt(String(s).slice(0, 4), 10);
    if (!(y >= 1900 && y <= 2200)) return null;
    return (cache[y] || (cache[y] = build(y)))[s] || null;
  }
  root.getHoliday = getHoliday;
  root.getLunar = getLunar;
  if (typeof module !== 'undefined') module.exports = { getHoliday: getHoliday, getLunar: getLunar };
})(typeof window !== 'undefined' ? window : globalThis);
