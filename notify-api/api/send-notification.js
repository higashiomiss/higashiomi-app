const admin = require("firebase-admin");

const DATABASE_URL =
  "https://higashiomi-app-default-rtdb.asia-southeast1.firebasedatabase.app";

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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const secret = req.headers["x-notify-secret"];
  if (!secret || secret !== process.env.NOTIFY_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
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

  const title = body.title || "🚨 安否確認";
  const messageBody = body.body || "";

  try {
    await getAdminApp();

    const snap = await admin.database().ref("pushTokens").once("value");
    const tokensObj = snap.val() || {};
    const tokens = Object.values(tokensObj).filter(
      (t) => typeof t === "string" && t.length > 0
    );

    if (tokens.length === 0) {
      res.status(200).json({
        sent: 0,
        failed: 0,
        message:
          "登録済みの通知トークンがありません（スタッフが端末で「通知を受け取る」を押していない可能性があります）"
      });
      return;
    }

    const result = await admin.messaging().sendEachForMulticast({
      notification: { title, body: messageBody },
      tokens
    });

    res.status(200).json({
      sent: result.successCount,
      failed: result.failureCount
    });
  } catch (err) {
    res.status(500).json({ error: String((err && err.message) || err) });
  }
};
