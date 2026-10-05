// Run: node members.test.js   (migration to member ids, rename propagation, merge + undo snapshot)
const assert = require('assert');
const M = require('./members.js');
let n = 0; const newId = () => 'id' + (++n);
const clone = (x) => JSON.parse(JSON.stringify(x));

// realistic OLD-format data (names only, no memberId)
function oldData() {
  const ev = (id, title, date, extra) => Object.assign({ id, title, date, start: '10:00', end: '10:50', memo: '', status: 'scheduled' }, extra);
  return {
    enrollments: [
      { id: 'e1', month: '2026-09', name: '김가나', dong: 'A', ho: '101', days: [2], start: '10:00', end: '10:50' },
      { id: 'e2', month: '2026-10', name: '김가나', dong: 'A', ho: '101', days: [2], start: '10:00', end: '10:50' },
      { id: 'e3', month: '2026-10', name: '김민지', dong: 'B', ho: '202', days: [3], start: '11:00', end: '11:50' },
      { id: 'e4', month: '2026-10', name: '김민지', dong: 'C', ho: '303', days: [4], start: '12:00', end: '12:50' },   // same name, other household
      { id: 'e5', month: '2026-10', name: '동호없음', dong: '', ho: '', days: [5], start: '13:00', end: '13:50' }
    ],
    events: [
      ev('v1', '김가나', '2026-09-01', { enrollmentId: 'e1', status: 'done', sign: 'M0 0L1 1' }),
      ev('v2', '김가나', '2026-10-06', { enrollmentId: 'e2' }),
      ev('v3', '박이안', '2026-10-06', { enrollmentId: 'e2' }),                 // family member sharing 김가나's 신청서
      ev('v4', ' 김가나 ', '2026-10-13'),                                       // unlinked, spacing differs
      ev('v5', '김민지', '2026-10-07', { enrollmentId: 'e3' }),
      ev('v6', '김민지', '2026-10-08', { enrollmentId: 'e4' }),
      ev('v7', '동호없음', '2026-10-09', { enrollmentId: 'e5' }),
      ev('v8', '신규회원', '2026-10-20'),                                       // matches no 신청서: must get a member, not be dropped
      ev('v9', '김가나', '2026-10-27', { enrollmentId: 'e2' })
    ],
    members: [],
    colors: { 'A|101': 3, 'n:동호없음': 7, 'B|202': 1 },
    newId
  };
}

// ---- migration
let d = oldData(); const before = d.events.map((e) => e.id + '|' + e.date + '|' + e.start);
assert.strictEqual(M.migrate(d), true);
assert.deepStrictEqual(d.events.map((e) => e.id + '|' + e.date + '|' + e.start), before, 'no lesson lost or reordered');
assert.ok(d.events.every((e) => e.memberId) && d.enrollments.every((e) => e.memberId), 'every record has a member');
const mem = (name) => d.members.filter((m) => M.norm(m.name) === M.norm(name));
assert.strictEqual(mem('김가나').length, 1, 'one member across months, spacing ignored');
assert.strictEqual(mem('김민지').length, 2, 'same name in two households = two members');
assert.strictEqual(d.events.find((e) => e.id === 'v4').memberId, mem('김가나')[0].id, 'unlinked " 김가나 " joins the 김가나 member');
assert.ok(mem('신규회원').length === 1 && d.events.find((e) => e.id === 'v8').memberId === mem('신규회원')[0].id, 'unknown name gets its own member');
assert.ok(mem('박이안').length === 1, 'family member of a shared 신청서 is a member');
assert.strictEqual(d.events.find((e) => e.id === 'v1').sign, 'M0 0L1 1', 'signature untouched');
assert.ok(!('n:동호없음' in d.colors) && d.colors['m:' + mem('동호없음')[0].id] === 7, 'n:<name> color moved to the member');
assert.strictEqual(d.colors['A|101'], 3);
const snap = JSON.stringify([d.events, d.enrollments, d.members, d.colors]);
assert.strictEqual(M.migrate(d), false, 'second run changes nothing');
assert.strictEqual(JSON.stringify([d.events, d.enrollments, d.members, d.colors]), snap);
assert.strictEqual(new Set(d.members.map((m) => m.id)).size, d.members.length, 'ids unique');

// ---- rename propagates (only the member record changes; names are derived)
const kim = mem('김가나')[0], lessonsOfKim = d.events.filter((e) => e.memberId === kim.id).length;
assert.deepStrictEqual(M.rename(d, kim.id, '   '), { ok: false, reason: 'empty' });
assert.deepStrictEqual(M.rename(d, kim.id, '김가 나나'), { ok: true });
assert.ok(d.events.filter((e) => e.memberId === kim.id).every((e) => e.title === '김가 나나'));
assert.ok(d.enrollments.filter((e) => e.memberId === kim.id).every((e) => e.name === '김가 나나'));
assert.strictEqual(d.events.filter((e) => e.memberId === kim.id).length, lessonsOfKim, 'same lesson count');
assert.strictEqual(d.colors['A|101'], 3, 'household color unchanged');
assert.deepStrictEqual(M.rename(d, kim.id, ' 김가  나나 '), { ok: true });          // spacing only
assert.strictEqual(kim.name, '김가 나나', 'trimmed and collapsed');

// ---- rename to a name that exists: conflict -> merge, undo = snapshot restore
const a = mem('김민지')[0], b = mem('김민지')[1], colorsBefore = clone(d.colors);
const r = M.rename(d, mem('신규회원')[0].id, '김민지'); assert.ok(r.conflict, 'taken name is reported, nothing renamed');
assert.strictEqual(mem('신규회원')[0].name, '신규회원');
const snapshot = clone({ events: d.events, enrollments: d.enrollments, members: d.members, colors: d.colors });
const nEv = d.events.length, moved = M.merge(d, b.id, a.id);
assert.strictEqual(moved, 1); assert.strictEqual(d.events.length, nEv, 'merge never drops lessons');
assert.ok(d.events.filter((e) => e.title === '김민지').every((e) => e.memberId === a.id));
assert.ok(!d.members.some((m) => m.id === b.id));
d.events = snapshot.events; d.enrollments = snapshot.enrollments; d.members = snapshot.members; d.colors = snapshot.colors;   // undo
assert.ok(d.members.some((m) => m.id === b.id) && d.events.find((e) => e.id === 'v6').memberId === b.id, 'undo restores the exact state');

// ---- ensure(): typed names resolve to a member, never a bare string
const before2 = d.members.length;
assert.strictEqual(M.ensure(d, ' 김가 나나', 'A|101').id, kim.id, 'existing member found (spacing ignored)');
const fresh = M.ensure(d, '완전새이름', 'Z|9'); assert.strictEqual(d.members.length, before2 + 1, 'unknown name creates a member'); assert.ok(fresh.id);
assert.strictEqual(M.ensure(d, '김민지', 'B|202').id, a.id, 'same name picks the member of that household');
assert.strictEqual(M.ensure(d, '김민지', 'C|303').id, b.id);
assert.strictEqual(M.ensure(d, '김민지', '', { anyHousehold: true }).id.length > 0, true);

// ---- corrupt / partial input never throws
M.migrate({ events: [], enrollments: [], members: null, colors: null });
M.migrate({ events: [{ id: 'x', title: '', date: '2026-10-01', memberId: 'ghost' }], enrollments: [{ id: 'y', month: '2026-10', name: 'k', memberId: 'ghost2' }], members: [{ id: 'bad' }], newId });
console.log('OK members');
