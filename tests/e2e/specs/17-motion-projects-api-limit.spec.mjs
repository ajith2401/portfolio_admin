// Real HTTP checks of the server-side 400-UTF-16-unit line guard on POST /api/motion-projects and
// PUT /api/motion-projects/[id], plus the access-control order around it. Runs only against the throwaway local DB.
import { test, expect, request as pwRequest } from "@playwright/test";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { BASE, MONGO, ADMIN } from "../env.mjs";

if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(MONGO))
  throw new Error("spec 17 refuses non-local MongoDB");

const EDITOR = {
  email: "e2e-editor-17@example.test",
  password: "e2e-editor-17-" + Math.random().toString(36).slice(2),
};
const TAG = "spec17-";

// ---- synthetic strings, each asserted to its exact UTF-16 length ----
const fill = (unit, n, pad = "x") => {
  let s = "";
  while (s.length + unit.length <= n) s += unit;
  while (s.length < n) s += pad;
  return s;
};
const TA = "க்ஷகொஸ்ரீ"; // 3 + 2 + 4 = 9 units of base letters + combining signs
const tamil400 = TA.repeat(44) + "கொகொ"; // 396 + 4
const tamil401 = TA.repeat(44) + "க்ஷகொ"; // 396 + 5
const emoji400 = "😀".repeat(200); // 200 code points, 400 units
const emoji401 = "அ" + "😀".repeat(200); // 201 code points, 401 units
const emoji402cp201 = "😀".repeat(201); // 201 code points (<= 400), 402 units (> 400)
const MIX = "தமிழ் Tamil 🌺 கொ ஸ்ரீ 👩‍💻 ";
const mixed400 = fill(MIX, 400, "z");
const mixed401 = fill(MIX, 400, "z") + "ழ";
const ascii400 = "a".repeat(400),
  ascii401 = "a".repeat(401);

const scenesWith = (line, at = [0, 0]) => {
  const scenes = Array.from({ length: Math.max(1, at[0] + 1) }, (_, i) => ({
    lines: [`வரி ${i}`, "second line", "third line"],
  }));
  scenes[at[0]].lines[at[1]] = line;
  return { scenes };
};
const poemWith = (line, at = [0, 0]) => {
  const stanzas = Array.from({ length: at[0] + 1 }, (_, i) =>
    Array.from({ length: Math.max(2, at[1] + 1) }, (_, j) => `பா ${i}.${j}`),
  );
  stanzas[at[0]][at[1]] = line;
  return {
    poem: { title: "Spec 17 poem", stanzas },
    scenes: [{ lines: ["x"] }],
  };
};

let db, admin, editor, anon, evil, adminProject, editorProject;
const projects = () => db.collection("motionprojects");
const count = () => projects().countDocuments({});
const raw = async (id) =>
  JSON.stringify(
    await projects().findOne({ _id: new mongoose.Types.ObjectId(id) }),
  );

const NO_COOKIES = { cookies: [], origins: [] };
async function session(user) {
  const login = await pwRequest.newContext({
    baseURL: BASE,
    storageState: NO_COOKIES,
    extraHTTPHeaders: { Origin: BASE },
  });
  const r = await login.post("/api/login", { data: user });
  expect(r.status(), "login " + user.email).toBe(200);
  const tok = r
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => /(?:^|\s)token=([^;]+)/.exec(h.value)?.[1])
    .find(Boolean);
  expect(tok).toBeTruthy();
  await login.dispose();
  return tok;
}
const ctx = (headers) =>
  // empty storageState: otherwise the context inherits the project's admin session from playwright.config `use`
  pwRequest.newContext({
    baseURL: BASE,
    storageState: NO_COOKIES,
    extraHTTPHeaders: headers,
  });

async function expectRejected(res, where) {
  expect(res.status()).toBe(422);
  const b = await res.json();
  expect(b.code).toBe("LINE_TOO_LONG");
  expect(b.error).toContain("Nothing was saved");
  expect(b.error).toContain(`a ${where} line`.replace(/^a/, "A"));
  expect(b.project).toBeUndefined();
  return b;
}

test.beforeAll(async () => {
  await mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 });
  db = mongoose.connection.db;
  await db.collection("users").deleteMany({ email: EDITOR.email });
  await db.collection("users").insertOne({
    name: "E2E Editor 17",
    email: EDITOR.email,
    password: await bcrypt.hash(EDITOR.password, 10),
    role: "editor",
    createdAt: new Date(),
  });
  await projects().deleteMany({ name: { $regex: "^" + TAG } });
  const at = await session(ADMIN),
    et = await session(EDITOR);
  admin = await ctx({ Origin: BASE, Cookie: `token=${at}` });
  editor = await ctx({ Origin: BASE, Cookie: `token=${et}` });
  anon = await ctx({ Origin: BASE });
  evil = await ctx({ Origin: "https://evil.example", Cookie: `token=${at}` });
  // the strings really have the lengths the cases claim
  expect([ascii400, tamil400, emoji400, mixed400].map((s) => s.length)).toEqual(
    [400, 400, 400, 400],
  );
  expect([ascii401, tamil401, emoji401, mixed401].map((s) => s.length)).toEqual(
    [401, 401, 401, 401],
  );
  expect([...emoji402cp201].length).toBe(201);
  expect(emoji402cp201.length).toBe(402);
  expect(mixed400).toMatch(/[஀-௿]/u);
  expect(mixed400).toMatch(/\p{Extended_Pictographic}/u);
  expect(mixed400).toMatch(/[A-Za-z]/);
  // a shared synthetic project owned by the admin and one owned by the editor
  const r1 = await admin.post("/api/motion-projects", {
    data: {
      name: TAG + "admin-owned",
      composition: {
        ...poemWith("அன்பே சிவம்"),
        scenes: [{ lines: ["அன்பே சிவம்", "அறமே துணை"] }],
      },
    },
  });
  expect(r1.status()).toBe(201);
  adminProject = (await r1.json()).project._id;
  const r2 = await editor.post("/api/motion-projects", {
    data: {
      name: TAG + "editor-owned",
      composition: scenesWith("editor line"),
    },
  });
  expect(r2.status()).toBe(201);
  editorProject = (await r2.json()).project._id;
});

test.afterAll(async () => {
  await projects().deleteMany({ name: { $regex: "^" + TAG } });
  await db.collection("users").deleteMany({ email: EDITOR.email });
  await mongoose.disconnect();
  for (const c of [admin, editor, anon, evil]) await c?.dispose();
});

const ACCEPT = { ascii400, tamil400, emoji400, mixed400 };
const REJECT = { ascii401, tamil401, emoji401, mixed401, emoji402cp201 };

test("POST accepts lines of exactly 400 UTF-16 units and stores them verbatim (scene and poem)", async () => {
  for (const [k, line] of Object.entries(ACCEPT)) {
    for (const [where, comp, read] of [
      ["scene", scenesWith(line, [2, 1]), (c) => c.scenes[2].lines[1]],
      ["poem", poemWith(line, [1, 3]), (c) => c.poem.stanzas[1][3]],
    ]) {
      const before = await count();
      const r = await admin.post("/api/motion-projects", {
        data: { name: `${TAG}${k}-${where}`, composition: comp },
      });
      expect(r.status(), `${k} ${where}`).toBe(201);
      const created = (await r.json()).project;
      expect(read(created.composition)).toBe(line);
      expect(await count()).toBe(before + 1);
      const g = await admin.get(`/api/motion-projects/${created._id}`);
      expect(g.status()).toBe(200);
      const stored = read((await g.json()).project.composition);
      expect(stored).toBe(line);
      expect(
        Buffer.from(stored, "utf8").equals(Buffer.from(line, "utf8")),
      ).toBe(true);
      console.log(
        `[17] POST ${k} ${where}: 201, stored length ${stored.length}, byte-identical`,
      );
    }
  }
});

test("POST refuses any line over 400 units with 422 LINE_TOO_LONG and creates nothing (top-level and nested)", async () => {
  for (const [k, line] of Object.entries(REJECT)) {
    for (const [where, comp] of [
      ["scene", scenesWith(line)],
      ["scene", scenesWith(line, [3, 2])], // nested: composition.scenes[3].lines[2]
      ["poem", poemWith(line)],
      ["poem", poemWith(line, [2, 5])], // nested: composition.poem.stanzas[2][5]
    ]) {
      const before = await count(),
        names = await projects().countDocuments({ name: `${TAG}rej-${k}` });
      const r = await admin.post("/api/motion-projects", {
        data: { name: `${TAG}rej-${k}`, composition: comp },
      });
      const b = await expectRejected(r, where);
      expect(b.error).toContain(`has ${line.length} characters`);
      expect(await count()).toBe(before);
      expect(await projects().countDocuments({ name: `${TAG}rej-${k}` })).toBe(
        names,
      );
      console.log(
        `[17] POST ${k} ${where}: ${r.status()} ${JSON.stringify(b)}`,
      );
    }
  }
});

test("PUT accepts 400-unit lines from the owner; refuses 401+ with 422 and leaves the record byte-identical", async () => {
  for (const [k, line] of Object.entries(ACCEPT)) {
    const r = await admin.put(`/api/motion-projects/${adminProject}`, {
      data: {
        composition: {
          ...poemWith(line, [0, 1]),
          scenes: [{ lines: ["a", line] }],
        },
      },
    });
    expect(r.status(), k).toBe(200);
    const p = (await r.json()).project;
    expect(p.composition.scenes[0].lines[1]).toBe(line);
    expect(p.composition.poem.stanzas[0][1]).toBe(line);
    const g = (
      await (await admin.get(`/api/motion-projects/${adminProject}`)).json()
    ).project;
    expect(g.composition.scenes[0].lines[1]).toBe(line);
    expect(g.composition.poem.stanzas[0][1]).toBe(line);
    console.log(`[17] PUT ${k}: 200, revision ${p.revision}, stored verbatim`);
  }
  // put a known Tamil state in place, then hammer it with overlong edits
  const known = await admin.put(`/api/motion-projects/${adminProject}`, {
    data: {
      name: TAG + "admin-owned",
      composition: {
        ...poemWith(tamil400),
        scenes: [{ lines: [tamil400, "கொ"] }],
      },
    },
  });
  expect(known.status()).toBe(200);
  for (const [k, line] of Object.entries(REJECT)) {
    for (const [where, comp] of [
      ["scene", scenesWith(line)],
      ["scene", scenesWith(line, [4, 1])],
      ["poem", poemWith(line)],
      ["poem", poemWith(line, [3, 2])],
    ]) {
      const beforeRaw = await raw(adminProject),
        beforeHttp = await (
          await admin.get(`/api/motion-projects/${adminProject}`)
        ).text(),
        n = await count();
      const r = await admin.put(`/api/motion-projects/${adminProject}`, {
        data: { name: TAG + "renamed-should-not-stick", composition: comp },
      });
      const b = await expectRejected(r, where);
      expect(await raw(adminProject)).toBe(beforeRaw); // incl. updatedAt and revision
      expect(
        await (await admin.get(`/api/motion-projects/${adminProject}`)).text(),
      ).toBe(beforeHttp);
      expect(await count()).toBe(n);
      console.log(
        `[17] PUT ${k} ${where}: ${r.status()} ${b.code} "${b.error}"`,
      );
    }
  }
  const after = JSON.parse(await raw(adminProject));
  expect(after.name).toBe(TAG + "admin-owned");
  expect(after.composition.scenes[0].lines[0]).toBe(tamil400);
});

test("an ordinary valid project round-trips byte-identically", async () => {
  const comp = {
    poem: {
      title: "மோஷன்",
      stanzas: [
        ["அன்பே சிவம்", "அறமே துணை"],
        ["நன்றே செய் 🌺", "ஸ்ரீ கொ க்ஷ"],
      ],
    },
    scenes: [{ lines: ["அன்பே சிவம்", "அறமே துணை"] }, { lines: ["நன்றே செய் 🌺"] }],
  };
  const before = await count();
  const r = await admin.post("/api/motion-projects", {
    data: { name: TAG + "ordinary", composition: comp },
  });
  expect(r.status()).toBe(201);
  const id = (await r.json()).project._id;
  expect(await count()).toBe(before + 1);
  const g = (await (await admin.get(`/api/motion-projects/${id}`)).json())
    .project;
  expect(g.composition.poem.stanzas).toEqual(comp.poem.stanzas);
  expect(g.composition.scenes.map((s) => s.lines)).toEqual(
    comp.scenes.map((s) => s.lines),
  );
  expect(g.name).toBe(TAG + "ordinary");
  console.log("[17] ordinary: 201, GET 200, stanzas + scene lines identical");
});

test("access control answers before the length guard", async () => {
  const valid = { name: TAG + "x", composition: scenesWith("ok") };
  const long = { name: TAG + "x", composition: scenesWith(ascii401) };
  const n0 = await count(),
    adminRaw = await raw(adminProject),
    editorRaw = await raw(editorProject);
  const seen = {};
  const hit = async (label, res, status) => {
    const b = await res.text();
    seen[label] = `${res.status()} ${b.slice(0, 120)}`;
    console.log(`[17] ${label}: ${seen[label]}`);
    expect.soft(res.status(), label).toBe(status);
    expect.soft(b, label).not.toContain("LINE_TOO_LONG");
  };
  // unauthenticated
  await hit(
    "anon POST valid",
    await anon.post("/api/motion-projects", { data: valid }),
    401,
  );
  await hit(
    "anon POST overlong",
    await anon.post("/api/motion-projects", { data: long }),
    401,
  );
  await hit(
    "anon PUT valid",
    await anon.put(`/api/motion-projects/${adminProject}`, { data: valid }),
    401,
  );
  await hit(
    "anon PUT overlong",
    await anon.put(`/api/motion-projects/${adminProject}`, { data: long }),
    401,
  );
  // cross-origin with a valid admin session
  await hit(
    "cross-origin POST valid",
    await evil.post("/api/motion-projects", { data: valid }),
    403,
  );
  await hit(
    "cross-origin POST overlong",
    await evil.post("/api/motion-projects", { data: long }),
    403,
  );
  await hit(
    "cross-origin PUT valid",
    await evil.put(`/api/motion-projects/${adminProject}`, { data: valid }),
    403,
  );
  await hit(
    "cross-origin PUT overlong",
    await evil.put(`/api/motion-projects/${adminProject}`, { data: long }),
    403,
  );
  // an editor who does not own the project
  await hit(
    "non-owner PUT valid",
    await editor.put(`/api/motion-projects/${adminProject}`, { data: valid }),
    403,
  );
  await hit(
    "non-owner PUT overlong",
    await editor.put(`/api/motion-projects/${adminProject}`, { data: long }),
    403,
  );
  // a project id that does not exist
  await hit(
    "missing id PUT overlong",
    await admin.put("/api/motion-projects/0123456789abcdef01234567", {
      data: long,
    }),
    404,
  );
  expect(await count()).toBe(n0);
  expect(await raw(adminProject)).toBe(adminRaw);
  expect(await raw(editorProject)).toBe(editorRaw);
  // the owning editor still gets the 422 on an overlong edit, and can save a valid one
  const own = await editor.put(`/api/motion-projects/${editorProject}`, {
    data: long,
  });
  const ob = await expectRejected(own, "scene");
  seen["owner editor PUT overlong"] = `${own.status()} ${JSON.stringify(ob)}`;
  expect(await raw(editorProject)).toBe(editorRaw);
  const ok = await editor.put(`/api/motion-projects/${editorProject}`, {
    data: { composition: scenesWith("தமிழ் ok") },
  });
  expect(ok.status()).toBe(200);
  const okp = (await ok.json()).project;
  expect(okp.composition.scenes[0].lines[0]).toBe("தமிழ் ok");
  expect(okp.revision).toBe(JSON.parse(editorRaw).revision + 1);
  seen["owner editor PUT valid"] = `${ok.status()} revision ${okp.revision}`;
  const adm = await admin.put(`/api/motion-projects/${adminProject}`, {
    data: { name: TAG + "admin-owned" },
  });
  expect(adm.status()).toBe(200);
  seen["owner admin PUT valid"] =
    `${adm.status()} revision ${(await adm.json()).project.revision}`;
  for (const [k, v] of Object.entries(seen)) console.log(`[17] ${k}: ${v}`);
});
