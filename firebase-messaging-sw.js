importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// index.html と同じFirebaseプロジェクトの設定です（公開されて問題ない情報です）
firebase.initializeApp({
  apiKey: "AIzaSyCpsdd1ngTLY_qlZE_szKTYPmxauUDrbic",
  authDomain: "higashiomi-app.firebaseapp.com",
  databaseURL: "https://higashiomi-app-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "higashiomi-app",
  storageBucket: "higashiomi-app.firebasestorage.app",
  messagingSenderId: "121683087696",
  appId: "1:121683087696:web:18af6c119bb7066d5ddc55"
});

var messaging = firebase.messaging();
var APP_URL = "https://higashiomiss.github.io/higashiomi-app/";

// アプリを閉じている・バックグラウンドのときに通知を受け取ったら表示する
messaging.onBackgroundMessage(function (payload) {
  var d = payload.data || {};
  var n = payload.notification || {};
  var title = d.title || n.title || "東近江製作所 TeamNavi";
  var body = d.body || n.body || "";
  var urgent = d.urgent === "1";

  // ホーム画面アイコンにバッジ（対応端末のみ）
  try {
    if (self.navigator && self.navigator.setAppBadge) {
      self.navigator.setAppBadge(1).catch(function () {});
    }
  } catch (e) {}

  return self.registration.showNotification(title, {
    body: body,
    tag: d.tag || "teamnavi",
    renotify: true,
    requireInteraction: urgent,
    vibrate: urgent ? [200, 100, 200, 100, 200] : [200],
    data: { url: (d.url || APP_URL) + (d.page ? "#" + d.page : "") }
  });
});

// 通知をタップしたらアプリを開く（開いていればそのタブを前に出す）
self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || APP_URL;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(APP_URL) === 0 && "focus" in list[i]) {
          if ("navigate" in list[i]) list[i].navigate(url);
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
