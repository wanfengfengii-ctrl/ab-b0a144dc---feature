/**
 * 健康端点冒烟：轮询 HTTP 健康端点直到 200 或超时。
 * 用法：node scripts/healthcheck.mjs [url]
 * 环境变量 HEALTH_URL 可指定端点，默认 http://web/health（compose 内部网络）。
 */
const url = process.argv[2] ?? process.env.HEALTH_URL ?? 'http://web/health';
const attempts = Number(process.env.HEALTH_ATTEMPTS ?? 30);
const intervalMs = Number(process.env.HEALTH_INTERVAL_MS ?? 1000);

for (let i = 1; i <= attempts; i++) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const body = (await res.text()).trim();
      console.log(`健康端点 ${url} -> ${res.status}（${body}）`);
      process.exit(0);
    }
    console.log(`第 ${i}/${attempts} 次：${url} -> HTTP ${res.status}`);
  } catch (err) {
    console.log(`第 ${i}/${attempts} 次：${url} -> ${err.message}`);
  }
  await new Promise((r) => setTimeout(r, intervalMs));
}

console.error(`健康端点 ${url} 在 ${attempts} 次尝试后仍不可用`);
process.exit(1);
