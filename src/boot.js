// Keep startup failures visible even when the game module cannot be imported.
(() => {
  const loading = document.getElementById('loading');
  const message = document.getElementById('loading-text');
  const retry = document.getElementById('retry-loading');
  function showFailure(text) {
    if (loading.hidden) return;
    message.textContent = text;
    retry.hidden = false;
    loading.querySelector('i').hidden = true;
  }
  retry.addEventListener('click', () => location.reload());
  const timeout = setTimeout(() => showFailure('파일을 불러오는 데 시간이 걸립니다. 서버 연결을 확인하고 다시 시도해 주세요.'), 15000);
  window.addEventListener('skywind-ready', () => clearTimeout(timeout), { once: true });
  window.addEventListener('skywind-load-error', () => clearTimeout(timeout), { once: true });
  if (location.protocol === 'file:') {
    clearTimeout(timeout);
    showFailure('로컬 서버로 실행해 주세요: npm start → http://127.0.0.1:5173');
    return;
  }
  import('./main.js').catch(error => {
    clearTimeout(timeout);
    console.error('SkyWind startup:', error);
    showFailure(`게임을 시작하지 못했습니다: ${error.message}`);
  });
})();
