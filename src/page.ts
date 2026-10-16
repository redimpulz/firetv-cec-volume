// WebView に描くアプリの画面。Fire TV のリモコン用 API と同じ origin のページに書き込むので、
// 自己署名証明書や CORS を気にせず fetch で API を叩ける。
// RN 側とは window.ReactNativeWebView.postMessage と window.__vr.* で やり取りする。

export const PAGE_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>テレビ音量リモコン</title>
<style>
  :root { --fg: #fff; --sub: #c9d1e0; --btn: #2a2f3a; --focus: #3d7bff; --warn: #c0392b; }
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #11141a; color: var(--fg);
    font-family: sans-serif; overflow: hidden; }
  .screen { display: none; height: 100vh; flex-direction: column; align-items: center;
    justify-content: center; gap: 3vh; padding: 4vh 4vw; }
  .screen.active { display: flex; }
  h1 { margin: 0; font-size: 4vh; color: var(--sub); font-weight: normal; }
  .row { display: flex; gap: 3vw; }
  button { background: var(--btn); color: var(--fg); border: 0.5vh solid transparent;
    border-radius: 2vh; font-size: 3.5vh; font-weight: bold; padding: 0; cursor: pointer; }
  button:focus { outline: none; background: var(--focus); border-color: #fff; transform: scale(1.06); }
  .vol { width: 20vw; height: 22vh; font-size: 9vh; }
  .vol.text { font-size: 4.5vh; }
  .power { width: 66vw; height: 12vh; }
  .power.armed { background: var(--warn); }
  .status { min-height: 4vh; font-size: 3vh; color: #ffb4a9; text-align: center; }
  .digits { display: flex; gap: 1.5vw; }
  .digit { width: 7vh; height: 9vh; border: 0.4vh solid #5a6378; border-radius: 1vh;
    font-size: 6vh; display: flex; align-items: center; justify-content: center; }
  .keypad { display: grid; grid-template-columns: repeat(3, 14vw); gap: 1.5vh 1.5vw; }
  .keypad button { height: 9vh; font-size: 4.5vh; }
  .keypad button.small { font-size: 2.8vh; }
  .msg { font-size: 3vh; color: var(--sub); text-align: center; }
</style>
</head>
<body>
<section id="remote" class="screen">
  <h1>テレビの音量</h1>
  <div class="row">
    <button class="vol" data-action="volume_down" data-repeat>−</button>
    <button class="vol text" data-action="mute">消音</button>
    <button class="vol" data-action="volume_up" data-repeat id="first">＋</button>
  </div>
  <button class="power" id="power">テレビの電源を切る</button>
  <div class="status" id="status"></div>
</section>

<section id="pairing" class="screen">
  <h1>はじめの設定</h1>
  <div class="msg" id="pairMsg"></div>
  <div class="digits" id="digits"></div>
  <div class="keypad" id="keypad"></div>
</section>

<script>
(function () {
  var API_KEY = '0987654321';
  var PIN_LENGTH = 4;
  var KEEP_ALIVE_MS = 30000;
  var token = (window.__vr && window.__vr.token) || null;

  function post(msg) { window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  function log(text) { post({ type: 'log', text: text }); }

  // API はしばらく使わないと止まる。止まっていたら RN に DIAL で起こしてもらう
  var wakeWaiters = [];
  window.__vr = window.__vr || {};
  window.__vr.woke = function () { var w = wakeWaiters; wakeWaiters = []; w.forEach(function (f) { f(); }); };
  function wake() { return new Promise(function (resolve) { wakeWaiters.push(resolve); post({ type: 'wake' }); }); }

  function headers() {
    var h = { 'X-Api-Key': API_KEY, 'Content-Type': 'application/json' };
    if (token) h['X-Client-Token'] = token;
    return h;
  }
  function call(method, path, body, retried) {
    return fetch(path, { method: method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.text().then(function (t) { return { status: r.status, text: t }; }); })
      .catch(function (e) {
        if (retried) throw e;
        return wake().then(function () { return call(method, path, body, true); });
      });
  }

  // ---- 画面の切り替え ----
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    var f = id === 'remote' ? document.getElementById('first') : document.querySelector('#keypad button');
    if (f) f.focus();
    if (id === 'pairing') startPairing();
  }
  function onAuthFailed() {
    if (!document.getElementById('pairing').classList.contains('active')) show('pairing');
  }

  // ---- リモコン画面 ----
  var statusEl = document.getElementById('status');
  function send(action) {
    return call('POST', '/v1/FireTV?action=' + action).then(function (r) {
      if (r.status === 401 || r.status === 403) return onAuthFailed();
      statusEl.textContent = r.status === 200 ? '' : '送れませんでした（HTTP ' + r.status + '）';
    }).catch(function (e) { statusEl.textContent = '送れませんでした: ' + e; });
  }
  window.__vr.send = send;

  document.querySelectorAll('[data-action]').forEach(function (b) {
    b.addEventListener('click', function () { send(b.dataset.action); });
  });

  var power = document.getElementById('power');
  var armedTimer = null;
  power.addEventListener('click', function () {
    if (!armedTimer) {
      power.classList.add('armed');
      power.textContent = 'もう一度押して電源オフ';
      armedTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    // Fire TV をスリープさせると、HDMI-CEC でテレビも待機に入る
    send('sleep');
  });
  function disarm() {
    clearTimeout(armedTimer); armedTimer = null;
    power.classList.remove('armed');
    power.textContent = 'テレビの電源を切る';
  }

  // リモコンの音量ボタン。アプリが手前にある間だけ届く
  var VOLUME_KEYS = { AudioVolumeUp: 'volume_up', AudioVolumeDown: 'volume_down', AudioVolumeMute: 'mute',
    VolumeUp: 'volume_up', VolumeDown: 'volume_down', VolumeMute: 'mute' };
  document.addEventListener('keydown', function (e) {
    log('keydown key=' + e.key + ' code=' + e.code + ' keyCode=' + e.keyCode);
    var action = VOLUME_KEYS[e.key];
    if (action) { e.preventDefault(); send(action); }
  }, true);

  // 画面を開いている間は API を起こしておく。トークンが無効ならここでペアリングに移る
  function keepAlive() {
    call('GET', '/v1/FireTV').then(function (r) {
      if (r.status === 401 || r.status === 403) onAuthFailed();
    }).catch(function () {});
  }
  setInterval(keepAlive, KEEP_ALIVE_MS);

  // ---- ペアリング画面 ----
  var pin = '';
  var pairMsg = document.getElementById('pairMsg');
  var digits = document.getElementById('digits');
  for (var i = 0; i < PIN_LENGTH; i++) { var d = document.createElement('div'); d.className = 'digit'; digits.appendChild(d); }
  function renderPin() { for (var i = 0; i < PIN_LENGTH; i++) digits.children[i].textContent = pin[i] || ''; }

  var keypad = document.getElementById('keypad');
  ['1','2','3','4','5','6','7','8','9','消す','0','やり直す'].forEach(function (k) {
    var b = document.createElement('button');
    b.textContent = k;
    if (k.length > 1) b.className = 'small';
    b.addEventListener('click', function () { pressKey(k); });
    keypad.appendChild(b);
  });

  var busy = false;
  function startPairing() {
    pin = ''; renderPin();
    pairMsg.textContent = 'テレビに 4 桁の数字を表示しています…';
    call('POST', '/v1/FireTV/pin/display', { friendlyName: 'テレビ音量リモコン' }).then(function (r) {
      pairMsg.textContent = r.status === 200 ? 'テレビに出た 4 桁の数字を入力してください' : '数字を表示できませんでした（HTTP ' + r.status + '）';
    }).catch(function (e) { pairMsg.textContent = '数字を表示できませんでした: ' + e; });
  }
  function pressKey(k) {
    if (busy) return;
    if (k === 'やり直す') return startPairing();
    if (k === '消す') { pin = pin.slice(0, -1); return renderPin(); }
    if (pin.length >= PIN_LENGTH) return;
    pin += k; renderPin();
    if (pin.length === PIN_LENGTH) verify();
  }
  function verify() {
    busy = true;
    call('POST', '/v1/FireTV/pin/verify', { pin: pin }).then(function (r) {
      var t = null;
      try { t = JSON.parse(r.text).description; } catch (e) {}
      if (r.status !== 200 || !t || t === 'OK') throw new Error('HTTP ' + r.status);
      token = t;
      post({ type: 'saveToken', token: t });
      show('remote');
    }).catch(function () {
      pin = ''; renderPin();
      pairMsg.textContent = '数字が違うようです。もう一度入力してください';
    }).then(function () { busy = false; });
  }

  show(token ? 'remote' : 'pairing');
  keepAlive();
})();
</script>
</body>
</html>`;
