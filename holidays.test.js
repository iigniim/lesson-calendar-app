// Run: node holidays.test.js   (prints holidays for a few years, asserts known official dates)
const assert = require('assert');
const { getHoliday, getLunar } = require('./holidays.js');

function list(y) {
  const out = [];
  for (let t = Date.UTC(y, 0, 1); t < Date.UTC(y + 1, 0, 1); t += 864e5) {
    const k = new Date(t).toISOString().slice(0, 10), n = getHoliday(k);
    if (n) out.push(k + ' ' + n);
  }
  return out;
}
[2025, 2026, 2027, 2030, 2040].forEach((y) => console.log(y + '\n  ' + list(y).join('\n  ')));

const is = (d, n) => assert.strictEqual(getHoliday(d), n, d);
// Seollal / Chuseok / Buddha 2025-2027 (official calendars)
is('2025-01-29', '설날'); is('2025-10-06', '추석'); is('2025-05-05', '어린이날'); is('2025-05-06', '대체공휴일'); is('2025-10-08', '대체공휴일');
is('2026-02-17', '설날'); is('2026-09-25', '추석'); is('2026-05-24', '부처님오신날'); is('2026-05-25', '대체공휴일');
is('2026-03-02', '대체공휴일'); is('2026-08-17', '대체공휴일'); is('2026-10-05', '대체공휴일'); is('2026-07-17', '제헌절');
is('2027-02-07', '설날'); is('2027-02-09', '대체공휴일'); is('2027-09-15', '추석'); is('2027-05-13', '부처님오신날'); is('2027-12-27', '대체공휴일');
// no substitute: Saturday Seollal/Chuseok days, ordinary days, Memorial Day
is('2026-09-26', '추석 연휴'); is('2026-09-28', null); is('2025-06-06', '현충일'); is('2025-06-09', null);
// far years never throw
['1900-01-01', '2040-02-30', '2099-12-31', 'abc', '', null, undefined].forEach((d) => getHoliday(d));
// lunar dates: Seollal / Chuseok 2026, a leap month (윤6월 2025), the KST-late month starting 2026-10-11
const lu = (d, m, day, leap) => assert.deepStrictEqual(getLunar(d), { month: m, day: day, isLeap: !!leap }, d);
lu('2026-02-17', 1, 1); lu('2026-09-25', 8, 15); lu('2025-07-25', 6, 1, true); lu('2025-06-25', 6, 1);
lu('2026-10-10', 8, 30); lu('2026-10-11', 9, 1); lu('2023-05-27', 4, 8);
['2099-12-31', '1900-01-01', '2040-02-30', 'abc', '', null, undefined].forEach((d) => getLunar(d));
console.log('OK');
