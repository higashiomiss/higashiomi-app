const admin = require("firebase-admin");

const DATABASE_URL =
  "https://higashiomi-app-default-rtdb.asia-southeast1.firebasedatabase.app";
const APP_URL = "https://higashiomiss.github.io/higashiomi-app/";
const ALLOWED_ORIGINS = ["https://higashiomiss.github.io"];
// アプリから届いた「出来事」が、この時間内にデータベースへ書かれたものだけ通知する
const FRESH_MS = 10 * 60 * 1000;

let appPromise = null;

function getAdminApp() {
  if (appPromise) return appPromise;

  appPromise = (async () => {
    if (admin.apps.length) return admin.app();

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error(
        "環境変数 FIREBASE_SERVICE_ACCOUNT_JSON が設定されていません"
      );
    }
    const serviceAccount = JSON.parse(raw);

    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: DATABASE_URL
    });
  })();

  return appPromise;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Notify-Secret");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

// 安否確認：データベース上で「今始まった安否確認」かを確かめてから文面を作る
async function buildAnpiMessage(db) {
  const ref = db.ref("anpiData");
  const snap = await ref.once("value");
  const a = snap.val();
  if (!a || !a.active || !a.sentAt) return { skip: "実施中の安否確認がありません" };
  if (Date.now() - a.sentAt > FRESH_MS) return { skip: "古い安否確認です" };

  // 同じ安否確認で二重に通知しない
  const tx = await ref.child("notifiedAt").transaction((cur) =>
    cur && cur >= a.sentAt ? undefined : Date.now()
  );
  if (!tx.committed) return { skip: "通知済みです" };

  return {
    title: "🆘 安否確認",
    body: (a.desc || "安否確認が届いています") + "\nアプリを開いて回答してください",
    tag: "anpi-" + a.sentAt,
    page: "anpi",
    urgent: true
  };
}

// 予定：指定された日付・IDの予定が実際に追加されたばかりかを確かめる
async function buildSchedMessage(db, date, id) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return { skip: "日付が不正です" };
  const listRef = db.ref("schedData/" + date);
  const snap = await listRef.once("value");
  const raw = snap.val();
  let key = null;
  let item = null;
  if (raw) {
    Object.keys(raw).forEach((k) => {
      const s = raw[k];
      if (s && String(s.id) === String(id)) { key = k; item = s; }
    });
  }
  if (!item) return { skip: "予定が見つかりません" };
  if (!item.createdAt || Date.now() - item.createdAt > FRESH_MS) return { skip: "新しい予定ではありません" };

  const tx = await listRef.child(key + "/notified").transaction((cur) =>
    cur ? undefined : true
  );
  if (!tx.committed) return { skip: "通知済みです" };

  const p = date.split("-");
  const when = Number(p[1]) + "/" + Number(p[2]) + " " + (item.st || "") + (item.et ? "〜" + item.et : "");
  let body = when + "　" + (item.title || "");
  if (item.member) body += "\n👤 " + item.member;
  if (item.poster) body += "\n📝 " + item.poster;
  return {
    title: "📅 新しい予定が追加されました",
    body,
    tag: "sched-" + item.id,
    page: "schedule",
    urgent: false
  };
}

module.exports = async (req, res) => {
  setCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  try {
    await getAdminApp();
    const db = admin.database();

    let msg;
    if (body.event === "anpi") {
      msg = await buildAnpiMessage(db);
    } else if (body.event === "sched") {
      msg = await buildSchedMessage(db, body.date, body.id);
    } else {
      // 自由な文面での送信は合言葉が必要（管理用）
      const secret = req.headers["x-notify-secret"];
      if (!secret || !process.env.NOTIFY_SECRET || secret !== process.env.NOTIFY_SECRET) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      msg = {
        title: body.title || "🚨 安否確認",
        body: body.body || "",
        tag: "manual-" + Date.now(),
        page: "home",
        urgent: true
      };
    }

    if (msg.skip) {
      res.status(200).json({ sent: 0, failed: 0, skipped: msg.skip });
      return;
    }

    const snap = await db.ref("pushTokens").once("value");
    const tokensObj = snap.val() || {};
    const exclude = String(body.fromKey || "");
    const entries = Object.keys(tokensObj)
      .filter((k) => k !== exclude)
      .map((k) => ({ key: k, token: tokensObj[k] }))
      .filter((e) => typeof e.token === "string" && e.token.length > 0);

    if (entries.length === 0) {
      res.status(200).json({
        sent: 0,
        failed: 0,
        message:
          "登録済みの通知トークンがありません（スタッフが端末で「通知を受け取る」を押していない可能性があります）"
      });
      return;
    }

    // データだけを送り、表示は firebase-messaging-sw.js が行う（二重表示を防ぐ）
    const result = await admin.messaging().sendEachForMulticast({
      tokens: entries.map((e) => e.token),
      data: {
        title: msg.title,
        body: msg.body,
        tag: msg.tag,
        page: msg.page,
        urgent: msg.urgent ? "1" : "0",
        url: APP_URL
      },
      webpush: {
        headers: { Urgency: "high", TTL: String(24 * 60 * 60) }
      }
    });

    // 使えなくなった登録（アプリ削除・通知オフなど）を掃除する
    const removals = [];
    result.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token"
      ) {
        removals.push(db.ref("pushTokens/" + entries[i].key).remove());
      }
    });
    await Promise.all(removals);

    res.status(200).json({
      sent: result.successCount,
      failed: result.failureCount,
      removed: removals.length
    });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
