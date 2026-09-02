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

// アプリを閉じている・バックグラウンドのときに通知を受け取ったら表示する
messaging.onBackgroundMessage(function (payload) {
  var title =
    (payload.notification && payload.notification.title) ||
    (payload.data && payload.data.title) ||
    "🚨 安否確認";
  var body =
    (payload.notification && payload.notification.body) ||
    (payload.data && payload.data.body) ||
    "";

  self.registration.showNotification(title, {
    body: body,
    tag: "safety-check"
  });
});
