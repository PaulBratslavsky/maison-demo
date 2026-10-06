import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { SUBJECT_A, bootStrapi, tokyoDate, tokyoTime } from './harness.mjs';

const APPOINTMENT = 'plugin::maison.appointment';
const QUESTION = 'plugin::maison.question';
const INQUIRY = 'plugin::maison.inquiry';
const NOTIFICATION = 'plugin::maison.notification';
const BOUTIQUE = 'plugin::maison.boutique';
const STOCK_LEVEL = 'plugin::maison.stock-level';
const KNOWLEDGE = 'plugin::maison.knowledge';
const LIFF_URL = 'https://liff.line.me/1234567890-AbCdEfGh';
const TOKEN = 'maison-test-channel-token';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const TOKYO_OFFSET_MS = 9 * HOUR_MS;
/** The five made-up customers' subjects, and how staff see them. */
const DEMO_SUBJECT = /^line:Udec0de0{25}[1-5]$/;
const isDemo = (masked) => /^line:Udec…0[1-5]$/.test(masked);
/** A full LINE user ID, anywhere in a text. */
const LINE_USER_ID = /U[0-9a-f]{32}/;
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const ADDED = { created: true, customers: 5, appointments: 5, confirmed: 2, questions: 5, inquiries: 10 };
const NOTHING = { created: false, customers: 0, appointments: 0, confirmed: 0, questions: 0, inquiries: 0 };

/** A moment on Tokyo's wall clock: its calendar date, its weekday and its minutes since midnight. */
const inTokyo = (iso) => {
  const shifted = new Date(Date.parse(iso) + TOKYO_OFFSET_MS);
  return { isoDate: shifted.toISOString().slice(0, 10), weekday: WEEKDAYS[shifted.getUTCDay()], minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
};
const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3));

/** LINE's Messaging API on a free port of this machine. It keeps every request, and refuses each push, as LINE refuses a user nobody has. */
const startLineStub = async () => {
  const requests = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, body: JSON.parse(raw || 'null') });
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ message: 'Failed to send messages' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests, close: () => new Promise((resolve) => server.close(resolve)) };
};

describe('Load demo activity', () => {
  let strapi;
  let seed;
  let line;
  let loadedAt;
  /** What Paul's own rehearsal left: one request, one question and one inquiry of a customer of his own. */
  const own = {};

  /** The demo customers' rows of a content type, read straight from the database, with every field. */
  const demoRows = async (uid, params = {}) =>
    (await strapi.documents(uid).findMany({ limit: 100, ...params })).filter((row) => DEMO_SUBJECT.test(row.customer));

  before(async () => {
    line = await startLineStub();
    process.env.MAISON_LIFF_URL = LIFF_URL;
    strapi = await bootStrapi('demo-activity', { maisonConfig: { liffUrl: LIFF_URL, lineChannelAccessToken: TOKEN, lineApiBaseUrl: line.url } });
    seed = strapi.plugin('maison').service('seed');
    await seed.loadDemoCatalog();

    const booked = await strapi.plugin('maison').service('appointments').request({
      subject: SUBJECT_A, boutique: 'ginza', productSlugs: ['weekender-50'], requestedFor: tokyoTime(tokyoDate(10), '14:00'), createdVia: 'app',
    });
    assert.equal(booked.ok, true, JSON.stringify(booked));
    own.appointment = booked.value.reference;
    own.question = (await strapi.documents(QUESTION).create({ data: { reference: 'Q-9001', customer: SUBJECT_A, question: 'Can I pay in bitcoin?', status: 'open' } })).documentId;
    await strapi.plugin('maison').service('inquiries').log({ subject: SUBJECT_A, message: 'Can I pay in bitcoin?', knowledgeFound: false, handedOff: false });
    own.inquiry = (await strapi.documents(INQUIRY).findFirst({ filters: { customer: { $eq: SUBJECT_A } } })).documentId;
    line.requests.length = 0;
  });

  after(async () => {
    await strapi?.destroy();
    await line?.close();
    delete process.env.MAISON_LIFF_URL;
  });

  it('adds five requests, five questions and ten inquiries from five made-up customers, and answers so', async () => {
    loadedAt = new Date();
    assert.deepEqual(await seed.loadDemoActivity(), { ok: true, value: ADDED });
    assert.equal((await demoRows(APPOINTMENT, { status: 'draft' })).length, 5);
    assert.equal((await demoRows(QUESTION)).length, 5);
    assert.equal((await demoRows(INQUIRY)).length, 10);
    assert.equal(new Set((await demoRows(QUESTION)).map((row) => row.customer)).size, 5, 'one question per customer');
  });

  it("makes three requests wait for staff and confirms two, whose LINE confirmations LINE refused, so the board says not sent", async () => {
    const { value: rows } = await strapi.plugin('maison').service('appointments').listRequests({ status: 'all', limit: 50 });
    const demo = rows.filter((row) => isDemo(row.customer));
    assert.equal(demo.length, 5);
    assert.equal(new Set(demo.map((row) => row.customer)).size, 5, 'one request per customer');
    assert.deepEqual(demo.map((row) => row.status).sort(), ['confirmed', 'confirmed', 'requested', 'requested', 'requested']);
    for (const row of demo) {
      assert.match(row.reference, /^APT-\d{4}$/);
      assert.equal(row.confirmationSent, false, `${row.reference}: not sent`);
    }

    const confirmed = demo.filter((row) => row.status === 'confirmed').map((row) => row.reference);
    const notifications = await strapi.documents(NOTIFICATION).findMany({ filters: { appointmentReference: { $in: confirmed } } });
    assert.deepEqual(notifications.map((row) => [row.outcome, row.recordedBy]), [['failed', 'strapi'], ['failed', 'strapi']]);
    assert.equal(await strapi.documents(NOTIFICATION).count({ filters: { outcome: { $eq: 'sent' } } }), 0, 'no record says sent');
    // The publish ran the confirmation hook, which tried LINE once for each confirmed visit, and only for those.
    assert.equal(line.requests.length, 2);
    for (const push of line.requests) assert.match(`line:${push.body.to}`, DEMO_SUBJECT);

    const { value: waiting } = await strapi.plugin('maison').service('appointments').listRequests({ status: 'requested', limit: 50 });
    assert.equal(waiting.filter((row) => isDemo(row.customer)).length, 3, "the board's Waiting for staff view lists the three");
  });

  it("books every visit 2 to 13 days ahead, on a half-hour inside its boutique's hours, never Osaka on a Tuesday, for pieces the boutique has", async () => {
    const hours = Object.fromEntries(
      (await strapi.documents(BOUTIQUE).findMany({ locale: 'ja', status: 'published' })).map((boutique) => [boutique.slug, boutique.openingHours])
    );
    const stock = await strapi.documents(STOCK_LEVEL).findMany({ limit: 100 });
    const { value: rows } = await strapi.plugin('maison').service('appointments').listRequests({ status: 'all', limit: 50 });
    const demo = rows.filter((row) => isDemo(row.customer));
    assert.deepEqual(new Set(demo.map((row) => row.boutique.slug)), new Set(['ginza', 'omotesando', 'osaka']));

    const today = Date.parse(`${inTokyo(loadedAt.toISOString()).isoDate}T00:00:00Z`);
    for (const row of demo) {
      const { isoDate, weekday, minutes } = inTokyo(row.requestedFor);
      const away = (Date.parse(`${isoDate}T00:00:00Z`) - today) / DAY_MS;
      assert.ok(away >= 2 && away <= 13, `${row.reference}: ${away} days ahead`);
      assert.equal(minutes % 30, 0, `${row.reference}: on a half-hour`);
      const day = hours[row.boutique.slug].find((entry) => entry.weekday === weekday);
      assert.ok(day, `${row.reference}: ${row.boutique.slug} is open on ${weekday}`);
      assert.ok(minutes >= toMinutes(day.opens) && minutes + 30 <= toMinutes(day.closes), `${row.reference}: inside ${day.opens}-${day.closes}`);
      if (row.boutique.slug === 'osaka') assert.notEqual(weekday, 'tue', `${row.reference}: Osaka is closed on Tuesdays`);
      assert.ok(row.products.length > 0, `${row.reference}: for at least one piece`);
      for (const { slug } of row.products) {
        const level = stock.find((candidate) => candidate.productSlug === slug && candidate.boutiqueSlug === row.boutique.slug);
        assert.ok(level?.quantity > 0, `${row.reference}: ${row.boutique.slug} has ${slug}`);
      }
    }

    const drafts = await demoRows(APPOINTMENT, { status: 'draft' });
    assert.deepEqual(new Set(drafts.map((row) => row.language)), new Set(['ja', 'en']));
    assert.deepEqual(new Set(drafts.map((row) => row.createdVia)), new Set(['app', 'concierge']));
    assert.equal(drafts.filter((row) => row.customerNote).length, 2, 'two carry a note');
  });

  it('records the questions: three open, one taken, one answered, each with a Q- reference and the customer\'s name', async () => {
    const { value: rows } = await strapi.plugin('maison').service('questions').list({ status: 'all', limit: 100 });
    const demo = rows.filter((row) => isDemo(row.customer));
    assert.equal(demo.length, 5);
    for (const row of demo) {
      assert.match(row.reference, /^Q-\d{4}$/);
      assert.ok(row.customerName, `${row.reference}: named`);
      assert.equal(row.line, null, `${row.reference}: nothing says it went out on LINE`);
      assert.equal(row.addedToKnowledge, false);
    }
    const open = demo.filter((row) => row.status === 'open');
    assert.deepEqual(open.map((row) => row.reason).sort(), ['asked_for_person', 'no_answer', 'no_answer']);
    const [taken] = demo.filter((row) => row.status === 'taken');
    assert.ok(taken.staffName && taken.takenAt, 'taken by someone, at a time');
    const [answered] = demo.filter((row) => row.status === 'answered');
    assert.ok(answered.staffName && answered.answeredAt && answered.answer, 'answered by someone, at a time, with the answer');
    assert.deepEqual(new Set(demo.map((row) => row.language)), new Set(['ja', 'en']));
    assert.ok(demo.filter((row) => row.product).length >= 2, 'some are about a piece');
  });

  it('logs ten inquiries: five hand-offs in Needs an answer, two complaints, one praise, one answered from knowledge, one for the sweep', async () => {
    const { value: rows } = await strapi.plugin('maison').service('inquiries').list({ filter: 'all', limit: 100 });
    const demo = rows.filter((row) => isDemo(row.customer));
    assert.equal(demo.length, 10);

    const questions = (await demoRows(QUESTION)).map((row) => [row.reference, row.status]);
    const handOffs = demo.filter((row) => row.handedOff);
    assert.deepEqual(handOffs.map((row) => [row.question.reference, row.question.status]).sort(), [...questions].sort(), 'one per question');
    for (const row of handOffs) {
      assert.equal(row.queue, 'needs-answer');
      assert.equal(row.kind, 'question');
      assert.equal(row.status, row.question.status === 'answered' ? 'replied' : 'open', row.question.reference);
    }
    const [replied] = handOffs.filter((row) => row.status === 'replied');
    assert.ok(replied.replyText && replied.repliedAt && replied.repliedBy, "the answered question's inquiry carries the answer");
    assert.equal(replied.line, null, 'and nothing says it went out on LINE');

    const standalone = demo.filter((row) => !row.handedOff);
    assert.deepEqual(standalone.map((row) => row.queue).sort(), ['complaint', 'complaint', 'none', 'none', 'praise']);
    for (const row of standalone.filter(({ kind }) => kind === 'complaint')) assert.equal(row.sentimentLabel, 'negative');
    for (const row of standalone.filter(({ kind }) => kind === 'praise')) assert.equal(row.sentimentLabel, 'positive');
    const [fromKnowledge] = standalone.filter((row) => row.kind === 'question');
    assert.equal(fromKnowledge.knowledgeFound, true);
    assert.equal(fromKnowledge.answered, true);
    const entries = await strapi.documents(KNOWLEDGE).findMany({ locale: 'en', status: 'published', limit: 100 });
    assert.ok(entries.some((entry) => fromKnowledge.reply.includes(entry.answer)), 'its reply is a seeded entry, word for word');
    const pending = standalone.filter((row) => row.analysisStatus === 'pending');
    assert.equal(pending.length, 1);
    assert.equal(pending[0].kind, null);

    for (const row of await demoRows(INQUIRY)) {
      assert.equal(row.via, 'concierge');
      assert.ok(row.reply, 'each has a reply');
      if (row.analysisStatus === 'pending') continue;
      assert.equal(row.analysisStatus, 'analyzed');
      assert.equal(row.analysisAttempts, 0);
      assert.equal(row.modelVersion, 'demo-seed');
      assert.equal(row.promptVersion, null, "no prompt version: nobody takes these labels for a model's");
      assert.ok(row.reason && row.topic, 'a reason and a topic for staff');
    }
    assert.deepEqual(new Set(demo.map((row) => row.language)), new Set(['ja', 'en']));

    // The open demo inquiries in each queue, beside Paul's own inquiry, which waits for the sweep.
    assert.deepEqual(await strapi.plugin('maison').service('inquiries').summary(), { needsAnswer: 4, complaint: 2, praise: 1, notLabelled: 2 });
  });

  it('spreads when the rows came in over the last three days, never two at the same moment', async () => {
    const times = [
      ...(await demoRows(APPOINTMENT, { status: 'draft' })),
      ...(await demoRows(APPOINTMENT, { status: 'published' })),
      ...(await demoRows(QUESTION)),
      ...(await demoRows(INQUIRY)),
    ].map((row) => Date.parse(row.createdAt));
    assert.equal(times.length, 22);
    for (const time of times) assert.ok(time > loadedAt.getTime() - 3 * DAY_MS && time < loadedAt.getTime(), new Date(time).toISOString());
    const drafts = (await demoRows(APPOINTMENT, { status: 'draft' })).map((row) => Date.parse(row.createdAt));
    const others = [...drafts, ...[...(await demoRows(QUESTION)), ...(await demoRows(INQUIRY))].map((row) => Date.parse(row.createdAt))];
    assert.equal(new Set(others).size, 20, 'no two rows at the same moment');
    assert.ok(Math.max(...others) - Math.min(...others) >= 48 * HOUR_MS, 'over more than two days');
    // A confirmed visit's published row came in when its request did.
    for (const published of await demoRows(APPOINTMENT, { status: 'published' })) {
      const [draft] = await demoRows(APPOINTMENT, { status: 'draft', filters: { documentId: { $eq: published.documentId } } });
      assert.equal(published.createdAt, draft.createdAt, published.reference);
    }
  });

  it("adds nothing the second time, and leaves everyone else's activity as it was", async () => {
    assert.deepEqual(await seed.loadDemoActivity(), { ok: true, value: NOTHING });
    assert.equal((await demoRows(APPOINTMENT, { status: 'draft' })).length, 5);
    assert.equal((await demoRows(QUESTION)).length, 5);
    assert.equal((await demoRows(INQUIRY)).length, 10);
    assert.equal(line.requests.length, 2, 'nothing more was sent');
    assert.equal(await strapi.documents(APPOINTMENT).count({ filters: { reference: { $eq: own.appointment } } }), 1);
    assert.ok(await strapi.documents(QUESTION).findOne({ documentId: own.question }));
    assert.ok(await strapi.documents(INQUIRY).findOne({ documentId: own.inquiry }));
  });

  describe('over the admin routes', () => {
    let baseUrl;
    let staff;
    let reviewer;

    /** One request to an admin route. Tokens are sent, never logged. */
    const call = async (method, path, token) => {
      const response = await fetch(new URL(path, baseUrl), { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const text = await response.text();
      return { status: response.status, text, body: JSON.parse(text || 'null') };
    };

    /** An admin whose role holds `actions`, signed in the way the admin panel's login does it. No password, in this test's database only. */
    const adminWith = async (name, actions) => {
      const roles = strapi.service('admin::role');
      const role = await roles.create({ name: `Maison test: ${name}`, description: 'Created by the Maison integration tests' });
      await roles.assignPermissions(role.id, actions.map((action) => ({ action, subject: null, properties: {}, conditions: [] })));
      const user = await strapi.service('admin::user').create({ email: `${name}@maison.test`, firstname: name, lastname: 'Test', isActive: true, roles: [role.id] });
      const sessions = strapi.sessionManager('admin');
      const { token: refreshToken } = await sessions.generateRefreshToken(String(user.id), `maison-test-${name}`, { type: 'session' });
      return (await sessions.generateAccessToken(refreshToken)).token;
    };

    before(async () => {
      staff = await adminWith('demo-staff', [
        'plugin::maison.demo.manage',
        'plugin::maison.appointments.review',
        'plugin::maison.questions.read',
        'plugin::maison.inquiries.view',
      ]);
      reviewer = await adminWith('demo-reviewer', ['plugin::maison.appointments.review']);
      await new Promise((resolve, reject) => {
        strapi.server.listen(0, '127.0.0.1', resolve).once('error', reject);
      });
      baseUrl = `http://127.0.0.1:${strapi.server.httpServer.address().port}`;
    });

    it('POST /maison/demo/activity answers an admin who may manage the demo data, and nobody else', async () => {
      assert.equal((await call('POST', '/maison/demo/activity')).status, 401);
      assert.equal((await call('POST', '/maison/demo/activity', reviewer)).status, 403);
      const { status, body } = await call('POST', '/maison/demo/activity', staff);
      assert.equal(status, 200);
      assert.deepEqual(body, NOTHING, 'already there');
    });

    it('never shows a full LINE user ID in the requests, questions or inquiries, and lists show when each came in', async () => {
      const lists = {
        '/maison/appointments?status=all&limit=50': 'appointments',
        '/maison/questions?status=all&limit=100': 'questions',
        '/maison/inquiries?filter=all&limit=100': 'inquiries',
      };
      for (const [path, key] of Object.entries(lists)) {
        const { status, text, body } = await call('GET', path, staff);
        assert.equal(status, 200, path);
        const demo = body[key].filter((row) => isDemo(row.customer));
        assert.ok(demo.length >= 5, `${path} lists the demo rows`);
        assert.doesNotMatch(text, LINE_USER_ID, `${path} masks every customer`);
        const times = demo.map((row) => Date.parse(row.createdAt));
        assert.ok(Math.max(...times) - Math.min(...times) >= 24 * HOUR_MS, `${path}: received over more than a day`);
        assert.ok(times.every((time) => time > loadedAt.getTime() - 3 * DAY_MS), `${path}: within the last three days`);
      }
    });
  });

  it('Reset demo activity clears it, and it loads again afterwards', async () => {
    await seed.resetDemoAppointments();
    assert.equal((await demoRows(APPOINTMENT, { status: 'draft' })).length, 0);
    assert.equal((await demoRows(QUESTION)).length, 0);
    assert.equal((await demoRows(INQUIRY)).length, 0);
    assert.equal(await strapi.documents(NOTIFICATION).count(), 0);
    assert.deepEqual(await seed.loadDemoActivity(), { ok: true, value: ADDED });
  });
});
