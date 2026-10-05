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

// ---- moveLessons: memberId + 신청서 link follow the new member
{
  const mk = () => ({
    members: [{ id: 'm1', name: '일번' }, { id: 'm2', name: '이번' }],
    enrollments: [
      { id: 'a9', month: '2026-09', name: '일번', dong: 'A', ho: '1', memberId: 'm1' }, { id: 'a10', month: '2026-10', name: '일번', dong: 'A', ho: '1', memberId: 'm1' },
      { id: 'b10', month: '2026-10', name: '이번', dong: 'B', ho: '2', memberId: 'm2' }
    ],
    events: [
      { id: 'x1', title: '일번', memberId: 'm1', date: '2026-09-01', enrollmentId: 'a9', status: 'done', sign: 'M0 0' },
      { id: 'x2', title: '일번', memberId: 'm1', date: '2026-10-06', enrollmentId: 'a10' },
      { id: 'x3', title: '일번', memberId: 'm1', date: '2026-10-13', enrollmentId: 'a10' },
      { id: 'y1', title: '이번', memberId: 'm2', date: '2026-10-07', enrollmentId: 'b10' }
    ], colors: {}
  });
  let d2 = mk(), r2 = M.moveLessons(d2, ['x3'], 'm2');
  assert.strictEqual(r2.moved, 1);
  const x3 = d2.events.find((e) => e.id === 'x3');
  assert.deepStrictEqual([x3.memberId, x3.title, x3.enrollmentId], ['m2', '이번', 'b10'], 'moved to the new member and their October 신청서');
  assert.ok(r2.enrollmentIds.includes('a10') && r2.enrollmentIds.includes('b10'), 'old and new 신청서 are reported for syncing');
  assert.strictEqual(d2.events.find((e) => e.id === 'x2').memberId, 'm1', 'other lessons stay');
  d2 = mk(); M.moveLessons(d2, ['x1'], 'm2');      // September: the new member has no 신청서 that month -> unlinked, signature kept
  const x1 = d2.events.find((e) => e.id === 'x1');
  assert.ok(x1.memberId === 'm2' && !('enrollmentId' in x1) && x1.sign === 'M0 0' && x1.status === 'done');
  d2 = mk(); M.moveLessons(d2, ['y1'], 'm1');      // back into a household's shared 신청서 of that month
  assert.strictEqual(d2.events.find((e) => e.id === 'y1').enrollmentId, 'a10');
  d2 = mk(); const cnt = d2.events.length; M.moveLessons(d2, d2.events.filter((e) => e.memberId === 'm1').map((e) => e.id), 'm2');
  assert.strictEqual(d2.events.length, cnt, 'moving never drops lessons'); assert.ok(d2.events.every((e) => e.memberId === 'm2'));
  assert.strictEqual(M.moveLessons(mk(), ['x2'], 'nobody').moved, 0);
  // ---- ensureEnrollments: a member without a 신청서 that month gets one
  d2 = mk(); n = 0;
  let mv = M.moveLessons(d2, ['x1', 'x3'], 'm2'); const made = M.ensureEnrollments(d2, ['x1', 'x3'], 'm2');
  assert.strictEqual(made.length, 1, 'only September is missing (October 신청서 of m2 exists)');
  assert.strictEqual(made[0].month, '2026-09'); assert.strictEqual(made[0].memberId, 'm2');
  assert.deepStrictEqual([made[0].dong, made[0].ho], ['B', '2'], 'copies 동/호 from the member\'s other 신청서');
  assert.strictEqual(d2.events.find((e) => e.id === 'x1').enrollmentId, made[0].id, 'the lesson is linked to it');
  assert.ok(d2.enrollments.some((e) => e.id === made[0].id));
  d2 = mk(); d2.members.push({ id: 'm3', name: '새사람' }); M.moveLessons(d2, ['x2', 'x3'], 'm3');
  const made3 = M.ensureEnrollments(d2, ['x2', 'x3'], 'm3');
  assert.strictEqual(made3.length, 1); assert.deepStrictEqual([made3[0].month, made3[0].dong, made3[0].ho, made3[0].name], ['2026-10', '', '', '새사람'], 'brand-new member: blank 동/호');
  assert.strictEqual(made3[0].periodEnd, '2026-10-31');
  assert.ok(d2.events.filter((e) => e.memberId === 'm3').every((e) => e.enrollmentId === made3[0].id));
  assert.strictEqual(M.ensureEnrollments(d2, ['x2', 'x3'], 'm3').length, 0, 'second call creates nothing');
  console.log('OK moveLessons');
}
