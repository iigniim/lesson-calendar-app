/* Members: a stable id per person, so a rename never has to touch individual lessons.
   Pure functions over plain data d = { events, enrollments, members, colors, newId? } (mutated in place), so they can be tested in node.

   - members:      [{ id, name }]            the single place a person's name lives
   - events / enrollments carry memberId     title / name are a derived copy, rewritten from the member by applyNames()
   - colors (settings.colors) are keyed by household "동|호", or "m:<memberId>" when there is no 동/호 */
(function (root) {
  var clean = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };          // trim + collapse spaces
  var norm = function (s) { return clean(s).normalize('NFC').toLowerCase(); };                          // for comparing names
  var hhOf = function (enr) { return enr && enr.dong && enr.ho ? enr.dong + '|' + enr.ho : ''; };
  var rid = function (d) { return d.newId ? d.newId() : 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); };

  function byId(list) { var m = {}; list.forEach(function (x) { m[x.id] = x; }); return m; }

  /* Give every event / enrollment without a (valid) memberId a member. Idempotent: a second run changes nothing.
     Same name + same household = same member; same name in another household = another member;
     names differing only in case or spacing are the same person. Returns true when something changed. */
  function migrate(d) {
    d.members = Array.isArray(d.members) ? d.members.filter(function (m) { return m && typeof m.id === 'string' && clean(m.name); }) : [];
    d.colors = d.colors || {};
    var changed = false, members = byId(d.members), enrById = byId(d.enrollments), idsByKey = {};
    var key = function (name, hh) { return norm(name) + '#' + hh; };
    function remember(name, hh, id) { var k = key(name, hh); if (!idsByKey[k]) idsByKey[k] = id; }
    // reuse the ids already in use (a partly migrated or merged data set)
    d.enrollments.forEach(function (e) { if (e.memberId && members[e.memberId]) remember(members[e.memberId].name, hhOf(e), e.memberId); });
    d.events.forEach(function (e) {
      if (e.memberId && members[e.memberId]) remember(members[e.memberId].name, hhOf(enrById[e.enrollmentId]), e.memberId);
    });
    function resolve(name, hh) {
      var k = key(name, hh);
      if (idsByKey[k]) return idsByKey[k];
      var m = { id: rid(d), name: clean(name) };
      d.members.push(m); members[m.id] = m; idsByKey[k] = m.id; changed = true;
      return m.id;
    }
    var valid = function (e) { return e.memberId && members[e.memberId]; };
    // enrollments first (oldest month first, so the first spelling wins as the display name)
    d.enrollments.slice().sort(function (a, b) { return a.month < b.month ? -1 : a.month > b.month ? 1 : 0; }).forEach(function (e) {
      if (!valid(e) && clean(e.name)) { e.memberId = resolve(e.name, hhOf(e)); changed = true; }
    });
    d.events.forEach(function (e) {
      if (valid(e)) return;
      var enr = enrById[e.enrollmentId];
      if (enr) { e.memberId = resolve(e.title, hhOf(enr)); changed = true; return; }
      // not linked to a 신청서: the member of the same-named 신청서 in that month, when that is unambiguous
      var ids = {};
      d.enrollments.forEach(function (x) { if (x.month === e.date.slice(0, 7) && norm(x.name) === norm(e.title) && x.memberId) ids[x.memberId] = 1; });
      var keys = Object.keys(ids);
      e.memberId = keys.length === 1 ? keys[0] : resolve(e.title, '');
      changed = true;
    });
    // colors of members without 동/호 were keyed by "n:<name>"
    Object.keys(d.colors).forEach(function (k) {
      if (k.slice(0, 2) !== 'n:') return;
      var id = idsByKey[key(k.slice(2), '')];
      if (id && !(('m:' + id) in d.colors)) { d.colors['m:' + id] = d.colors[k]; delete d.colors[k]; changed = true; }
    });
    return changed;
  }

  /* title / name follow the member record. Returns true when a copy was out of date. */
  function applyNames(d) {
    var members = byId(d.members || []), n = 0;
    [d.events, d.enrollments].forEach(function (list, i) {
      var field = i === 0 ? 'title' : 'name';
      list.forEach(function (x) { var m = x.memberId && members[x.memberId]; if (m && x[field] !== m.name) { x[field] = m.name; n++; } });
    });
    return n > 0;
  }

  /* The member for a typed name, created when there is none (never a bare string).
     opts.anyHousehold: take a same-named member even from another household (lesson form); otherwise the household must match. */
  function ensure(d, name, hh, opts) {
    var nm = clean(name), cands = d.members.filter(function (m) { return norm(m.name) === norm(nm); });
    var enrById = byId(d.enrollments), hhs = function (m) {
      var set = {};
      d.enrollments.forEach(function (e) { if (e.memberId === m.id) set[hhOf(e)] = 1; });
      d.events.forEach(function (e) { if (e.memberId === m.id && enrById[e.enrollmentId]) set[hhOf(enrById[e.enrollmentId])] = 1; });
      return set;
    };
    var hit = cands.filter(function (m) { var s = hhs(m); return hh ? s[hh] : (s[''] || !Object.keys(s).length); })[0];
    if (!hit && hh && cands.length) hit = cands.filter(function (m) { return !Object.keys(hhs(m)).some(function (k) { return k; }); })[0];   // member without any 동/호 yet
    if (!hit && opts && opts.anyHousehold) hit = cands[0];
    if (hit) return hit;
    hit = { id: rid(d), name: nm };
    d.members.push(hit);
    return hit;
  }

  function lessonCount(d, id) { return d.events.filter(function (e) { return e.memberId === id; }).length; }

  /* Rename. Returns { ok: true }, { ok: false, reason: 'empty' }, or { conflict: otherMember } when another member already has that name. */
  function rename(d, id, newName) {
    var nm = clean(newName), m = d.members.filter(function (x) { return x.id === id; })[0];
    if (!m) return { ok: false, reason: 'missing' };
    if (!nm) return { ok: false, reason: 'empty' };
    var other = d.members.filter(function (x) { return x.id !== id && norm(x.name) === norm(nm); })[0];
    if (other) return { conflict: other };
    m.name = nm;
    applyNames(d);
    return { ok: true };
  }

  /* Move everything of member `fromId` to `toId` (whose name and color stay), then drop `fromId`. Returns how many lessons moved. */
  function merge(d, fromId, toId) {
    var n = lessonCount(d, fromId);
    d.events.forEach(function (e) { if (e.memberId === fromId) e.memberId = toId; });
    d.enrollments.forEach(function (e) { if (e.memberId === fromId) e.memberId = toId; });
    d.members = d.members.filter(function (m) { return m.id !== fromId; });
    delete d.colors['m:' + fromId];
    applyNames(d);
    return n;
  }

  /* Which 신청서 a moved lesson belongs to afterwards: the new member's own 신청서 of that month (same household as now preferred),
     else the 신청서 the new member's other lessons of that month already sit on (a shared family 신청서), else none. */
  function enrollmentFor(d, e, toId, moving) {
    var month = e.date.slice(0, 7), cur = d.enrollments.filter(function (x) { return x.id === e.enrollmentId; })[0];
    var own = d.enrollments.filter(function (x) { return x.memberId === toId && x.month === month; });
    var pick = own.filter(function (x) { return cur && hhOf(x) === hhOf(cur); })[0] || own[0];
    if (pick) return pick.id;
    var count = {}, best = null;
    d.events.forEach(function (x) {
      if (moving[x.id] || x.memberId !== toId || !x.enrollmentId || x.date.slice(0, 7) !== month) return;
      count[x.enrollmentId] = (count[x.enrollmentId] || 0) + 1;
      if (!best || count[x.enrollmentId] > count[best]) best = x.enrollmentId;
    });
    return best;
  }

  /* Give the lessons `ids` to member `toId`: memberId + title, and the 신청서 link follows the member (sheets, color and counts derive from it).
     Returns { moved, enrollmentIds } where enrollmentIds are the 신청서 whose lessons changed (old and new). */
  function moveLessons(d, ids, toId) {
    var to = d.members.filter(function (m) { return m.id === toId; })[0], moving = {}, touched = {}, moved = 0;
    if (!to) return { moved: 0, enrollmentIds: [] };
    ids.forEach(function (id) { moving[id] = true; });
    d.events.forEach(function (e) {
      if (!moving[e.id]) return;
      if (e.enrollmentId) touched[e.enrollmentId] = true;
      var link = enrollmentFor(d, e, toId, moving);
      e.memberId = toId; e.title = to.name;
      if (link) { e.enrollmentId = link; touched[link] = true; } else delete e.enrollmentId;
      moved++;
    });
    return { moved: moved, enrollmentIds: Object.keys(touched) };
  }

  var api = { moveLessons: moveLessons, clean: clean, norm: norm, migrate: migrate, applyNames: applyNames, ensure: ensure, rename: rename, merge: merge, lessonCount: lessonCount };
  root.Members = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
