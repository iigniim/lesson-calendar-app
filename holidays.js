/* South Korean public holidays for any year, computed by rule. Display only: never stored in lesson data.
   getHoliday('YYYY-MM-DD') -> holiday name or null.

   Rules follow the Public Holidays Act / 관공서의 공휴일에 관한 규정 (art. 2-3), as summarised in
   python-holidays' South Korea module and the Ministry of Personnel Management notice that made
   Labor Day and Constitution Day public holidays (with substitutes) from 2026.
   Lunar holidays use Intl's Chinese calendar plus LUNAR_FIX for the few years it is a day off from the
   Korean calendar (2020-2050 cross-checked in holidays.test.js; years after 2050 are unchecked). */
(function (root) {
  /* Temporary holidays (임시공휴일) and election days cannot be computed.
     Add a line here whenever the government announces one: 'YYYY-MM-DD': 'name'. */
  var EXTRA = {
    '2025-01-27': '임시공휴일',
    '2025-06-03': '대통령선거일',
    '2026-06-03': '지방선거일'
  };

  /* years where Intl's China-based lunar calendar is one day off the Korean one (found by holidays.test.js for 2020-2050) */
  var LUNAR_FIX = {
    2023: { buddha: '2023-05-27' },
    2028: { seollal: '2028-01-27' },
    2030: { seollal: '2030-02-03' },
    2040: { chuseok: '2040-09-21' }
  };

  var DAY = 86400000;
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (t) { var d = new Date(t); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); };
  var lunarFmt = null;
  try { lunarFmt = new Intl.DateTimeFormat('en-u-ca-chinese', { timeZone: 'UTC', month: 'numeric', day: 'numeric' }); } catch (e) { /* no Intl chinese calendar: lunar holidays are skipped */ }

  /* lunar month/day -> solar date of that Gregorian year ("4bis" = leap month, never a holiday) */
  function lunarDates(year) {
    var out = {};
    if (!lunarFmt) return out;
    var t = Date.UTC(year, 0, 1), end = Date.UTC(year + 1, 0, 1);
    for (; t < end; t += DAY) {
      var p = {};
      lunarFmt.formatToParts(new Date(t + DAY / 2)).forEach(function (x) { p[x.type] = x.value; });
      out[p.month + '/' + p.day] = t;
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
    // Intl's Chinese calendar is China-time; Korea (KST) differs by a day in a few years. Corrections checked against python-holidays' Korean lunar table.
    var fix = LUNAR_FIX[year] || {};
    if (fix.seollal) lu['1/1'] = Date.parse(fix.seollal + 'T00:00:00Z');
    if (fix.chuseok) lu['8/15'] = Date.parse(fix.chuseok + 'T00:00:00Z');
    if (fix.buddha) lu['4/8'] = Date.parse(fix.buddha + 'T00:00:00Z');
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
  if (typeof module !== 'undefined') module.exports = { getHoliday: getHoliday };
})(typeof window !== 'undefined' ? window : globalThis);
