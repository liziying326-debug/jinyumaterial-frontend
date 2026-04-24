/**
 * JinYu Frontend Server
 *
 * 环境变量（创建 frontend/.env 文件或通过系统环境注入）：
 *   PORT          前台监听端口，默认 3011
 *   ADMIN_HOST    后台服务 hostname，默认 127.0.0.1
 *   ADMIN_PORT    后台服务端口，默认 3020
 *   ADMIN_PROTOCOL http | https，默认 http
 *
 * 本地开发：无需任何配置，直接 node server.js 即可
 * VPS 生产：创建 frontend/.env，填写实际值
 */

// ── 翻译结果校验（防止垃圾翻译写入缓存）────────────────────────
// 过滤与原文明显无关的翻译结果（如 MyMemory 错误返回、email 注入等）
function isBadTranslation(originalText, translatedText) {
  if (!originalText || !translatedText || originalText === translatedText) return false;
  const t = translatedText.trim().toLowerCase();
  const o = originalText.trim().toLowerCase();
  // 过滤 email 相关垃圾（非 email 原文却翻译成 email）
  if (/^e-?mail/.test(t) && !/^e-?mail/.test(o)) return true;
  // 过滤只剩标点和 emoji 的翻译
  if (/^[^\w\u4e00-\u9fff]{0,5}$/.test(t)) return true;
  // 过滤 HTML 标签残留
  if (/<\w+[^>]*>/.test(t) && !/<\w+[^>]*>/.test(o)) return true;
  return false;
}

// ── 加载 .env（如果存在）──────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8')
    .split('\n')
    .forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) process.env[key] = val;
    });
}

// ── 腾讯云机器翻译兜底（MyMemory 用完后自动切换）────────────────────
const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID || 'AKIDQjsrdFgwzpTxFOL7kANOFtKYcUCheR4X';
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY || 'Uq15zkJm6ECzZxFOL2ZzFJAqNiroa9Xk';

function sendTencentCloud(text, from, to, res) {
  if (!text || !text.trim()) {
    res.end(JSON.stringify({ success: false, result: text }));
    return true;
  }

  const service = 'tmt';
  const host = 'tmt.tencentcloudapi.com';
  const action = 'TextTranslate';
  const version = '2018-03-21';
  const region = 'ap-guangzhou';
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = Math.floor(Math.random() * 1000000);

  const sourceMap = { en: 'en', zh: 'zh', vi: 'vi', fil: 'fil', tl: 'fil' };
  const Source = sourceMap[from] || from;
  const Target = sourceMap[to] || to;

  const payload = JSON.stringify({
    SourceText: text,
    Source: Source,
    Target: Target,
    ProjectId: 0
  });

  const hashedPayload = crypto.createHash('sha256').update(payload).digest('hex');
  const canonicalHeaders = 'content-type:application/json\nhost:' + host + '\n';
  const signedHeaders = 'content-type;host';
  const canonicalRequest = 'POST\n/\n\n' + canonicalHeaders + '\n' + signedHeaders + '\n' + hashedPayload;
  const algorithm = 'TC3-HMAC-SHA256';
  const credentialScope = new Date().toISOString().slice(0, 10) + '/' + service + '/tc3_request';
  const stringToSign = algorithm + '\n' + timestamp + '\n' + credentialScope + '\n' + crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const kDate = crypto.createHmac('sha256', 'TC3' + TENCENT_SECRET_KEY).update(new Date().toISOString().slice(0, 10)).digest();
  const kService = crypto.createHmac('sha256', kDate).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('tc3_request').digest();
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = algorithm + ' Credential=' + TENCENT_SECRET_ID + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  const options = {
    hostname: host,
    port: 443,
    path: '/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-TC-Action': action,
      'X-TC-Version': version,
      'X-TC-Timestamp': timestamp.toString(),
      'X-TC-Region': region,
      'Authorization': authorization,
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  let tcBody = '';
  const req = https.request(options, tcRes => {
    tcRes.on('data', d => { tcBody += d; });
    tcRes.on('end', () => {
      try {
        const j = JSON.parse(tcBody);
        const result = j.Response && j.Response.TargetText;
        if (result && result.trim() && !isBadTranslation(text, result)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: true, result: result.trim() }));
        }
        if (j.Response && j.Response.Error) {
          console.log('腾讯云错误:', j.Response.Error.Code, j.Response.Error.Message);
        }
      } catch(e) { console.log('解析腾讯云响应失败:', e.message); }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, result: text }));
    });
  });
  req.on('error', e => {
    console.log('腾讯云请求失败:', e.message);
    res.end(JSON.stringify({ success: false, result: text }));
  });
  req.setTimeout(8000, () => { req.destroy(); res.end(JSON.stringify({ success: false, result: text })); });
  req.write(payload);
  req.end();
  return true;
}

const http = require('http');
const https = require('https');
const url = require('url');
const crypto = require('crypto');

const PORT          = parseInt(process.env.PORT)          || 3011;
const ADMIN_HOST    = process.env.ADMIN_HOST              || '127.0.0.1';
const ADMIN_PORT    = parseInt(process.env.ADMIN_PORT)    || 3002;
const ADMIN_PROTO   = process.env.ADMIN_PROTOCOL          || 'http';  // http | https

// 浏览量数据文件（写到 admin/data/ 供后台读取）
// 生产环境若前后台不在同一机器，此功能自动跳过
const PAGEVIEWS_FILE = path.join(__dirname, '../admin/data/pageviews.json');
// 新闻浏览量数据文件（按 slug 统计每篇文章的访问量）
const NEWS_VIEWS_FILE = path.join(__dirname, '../admin/data/news-views.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
};

// ── 浏览量记录 ──────────────────────────────────────────────────
function readPageviews() {
  if (!fs.existsSync(PAGEVIEWS_FILE)) return { daily: {}, monthly: {} };
  try { return JSON.parse(fs.readFileSync(PAGEVIEWS_FILE, 'utf8')); }
  catch { return { daily: {}, monthly: {} }; }
}

// ── 新闻浏览量记录（按 slug 统计）────────────────────────────────
function readNewsViews() {
  if (!fs.existsSync(NEWS_VIEWS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(NEWS_VIEWS_FILE, 'utf8')); }
  catch { return {}; }
}

// ── 翻译缓存持久化（供 autoTranslate.saveToI18nCache 调用）─────────
const TRANS_FILE = path.join(__dirname, 'translations.json');

function readTranslations() {
  if (!fs.existsSync(TRANS_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(TRANS_FILE, 'utf8')); }
  catch { return {}; }
}

function writeTranslations(data) {
  try {
    fs.writeFileSync(TRANS_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch(e) {
    console.warn('[i18n] write failed:', e.message);
    return false;
  }
}

function recordNewsView(slug) {
  if (!slug || typeof slug !== 'string') return;
  try {
    const data = readNewsViews();
    data[slug] = (data[slug] || 0) + 1;
    fs.writeFileSync(NEWS_VIEWS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* 写入失败不影响访问 */ }
}

function recordPageview(pathname, slug) {
  const ext = path.extname(pathname).toLowerCase();
  const STATIC_EXTS = ['.js','.css','.json','.png','.jpg','.jpeg','.gif','.svg','.ico','.webp','.woff','.woff2','.ttf','.eot','.map'];
  if (STATIC_EXTS.includes(ext)) return;
  if (ext && ext !== '.html') return;
  if (pathname.startsWith('/images/')) return;

  const now      = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const monthKey = now.toISOString().slice(0, 7);

  try {
    const data = readPageviews();
    data.daily[todayKey]   = (data.daily[todayKey]   || 0) + 1;
    data.monthly[monthKey] = (data.monthly[monthKey] || 0) + 1;

    const dayKeys = Object.keys(data.daily).sort();
    if (dayKeys.length > 90) dayKeys.slice(0, dayKeys.length - 90).forEach(k => delete data.daily[k]);
    const monthKeys = Object.keys(data.monthly).sort();
    if (monthKeys.length > 12) monthKeys.slice(0, monthKeys.length - 12).forEach(k => delete data.monthly[k]);

    fs.writeFileSync(PAGEVIEWS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch { /* 写入失败不影响访问 */ }

  // 如果是新闻详情页，记录该文章的浏览量
  if (slug) {
    recordNewsView(slug);
  }
}

// ── 反向代理（将 /api/* /images/* /uploads/* 转发到后台）─────────
function proxyToAdmin(req, res) {
  const transport = ADMIN_PROTO === 'https' ? https : http;

  const options = {
    hostname: ADMIN_HOST,
    port:     ADMIN_PORT,
    path:     req.url,
    method:   req.method,
    headers: {
      ...req.headers,
      host: `${ADMIN_HOST}:${ADMIN_PORT}`,
      'X-From-Frontend': '1',
    },
  };

  const proxyReq = transport.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[proxy error]', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Admin service unavailable' }));
  });

  req.pipe(proxyReq, { end: true });
}

// ── 产品详情API：从产品列表中查找单个产品 ───────────────────────
function handleProductDetail(req, res, productId) {
  const urlStr = `http://${ADMIN_HOST}:${ADMIN_PORT}/api/products`;

  const transport2 = ADMIN_PROTO === 'https' ? https : http;
  const req2 = transport2.get(urlStr, { headers: { 'X-From-Frontend': '1' } }, (apiRes) => {
    let body = '';
    apiRes.on('data', d => { body += d; });
    apiRes.on('end', () => {
      try {
        const products = JSON.parse(body);
        const prodArray = Array.isArray(products) ? products : (products.value || products.data || []);
        // 先按 ID 匹配（数字路由）
        let product = prodArray.find(p => String(p.id) === String(productId));
        // ID 没匹配 → 按 name_en slug 匹配
        if (!product) {
          const slug = productId.toLowerCase()
            .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
            .replace(/^-+|-+$/g, '');
          product = prodArray.find(p => {
            const pSlug = (p.name_en || p.name || '').toLowerCase()
              .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
              .replace(/^-+|-+$/g, '');
            return pSlug === slug;
          });
        }

        if (product) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, data: product }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Product not found' }));
        }
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Failed to fetch products' }));
      }
    });
  }).on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, message: 'Admin service unavailable' }));
  });
}

// ── 翻译代理（国内可访问，服务端转发）──────────────────────────
// GET /api/translate?text=...&from=zh&to=en
// 主接口：有道翻译（无需Key，国内稳定）— 适用于 zh/en/vi
// 菲律宾语(tl)专用：微软 Edge Translate（有道不支持 tl）
// 兜底接口：MyMemory（全球可用）
function handleTranslate(req, res) {
  const parsedQ = url.parse(req.url, true);
  const { text, from, to } = parsedQ.query;
  if (!text || !to) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ success: false, result: text || '' }));
  }

  // ── 菲律宾语(tl)：走微软 Edge Translate（有道不支持 tl）──
  if (to === 'tl' || to === 'fil' || to === 'ph') {
    return handleMsTranslate(req, res, text, from, to);
  }

  // 语言代码映射（有道格式）
  const YOUDAO_LANG = { zh: 'zh-CHS', en: 'en', vi: 'vi', auto: 'auto' };
  const fromCode = YOUDAO_LANG[from] || 'auto';
  const toCode   = YOUDAO_LANG[to]   || 'en';

  // 有道免费接口
  const youdaoPath = '/translate?doctype=json&type=' + fromCode + '2' + toCode
    + '&i=' + encodeURIComponent(text);

  const youdaoOpt = {
    hostname: 'fanyi.youdao.com',
    path: youdaoPath,
    method: 'GET',
    timeout: 5000,
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fanyi.youdao.com/' }
  };

  function fallbackMyMemory(originalText) {
    // MyMemory 免费接口（备用）
    const mmLang = { zh: 'zh-CN', en: 'en', vi: 'vi', tl: 'tl' };
    const langPair = (mmLang[from] || 'en') + '|' + (mmLang[to] || 'en');
    const mmPath = '/get?q=' + encodeURIComponent(originalText) + '&langpair=' + encodeURIComponent(langPair);
    const mmOpt = {
      hostname: 'api.mymemory.translated.net',
      path: mmPath,
      method: 'GET',
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    };
    let body = '';
    const mmReq = https.request(mmOpt, mmRes => {
      mmRes.on('data', d => { body += d; });
      mmRes.on('end', () => {
        try {
          const j = JSON.parse(body);
          const translated = j.responseData && j.responseData.translatedText;
          // 过滤 MyMemory 警告文本和超限提示 + 垃圾翻译
          if (translated && !translated.includes('MYMEMORY WARNING') && !translated.includes('QUERY LENGTH LIMIT') && translated !== 'USAGE LIMIT EXCEEDED' && !isBadTranslation(originalText, translated)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: true, result: translated }));
          }
        } catch(e) {}
        // MyMemory 失败 → 腾讯云兜底
        if (sendTencentCloud(originalText, from, to, res)) return;
        // 全部失败，返回原文
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, result: originalText }));
      });
    });
    mmReq.on('error', () => {
      if (!sendTencentCloud(originalText, from, to, res)) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ success: false, result: originalText }));
      }
    });
    mmReq.end();
  }

  let body = '';
  const ydReq = https.request(youdaoOpt, ydRes => {
    ydRes.on('data', d => { body += d; });
    ydRes.on('end', () => {
      try {
        const j = JSON.parse(body);
        // 有道返回格式：{ translateResult: [[{tgt:"..."}]], errorCode: "0" }
        const tgt = j.translateResult && j.translateResult[0] && j.translateResult[0][0] && j.translateResult[0][0].tgt;
        if (j.errorCode === '0' && tgt && !isBadTranslation(text, tgt)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: true, result: tgt }));
        }
      } catch(e) {}
      // 有道失败，走备用 MyMemory
      fallbackMyMemory(text);
    });
  });
  ydReq.on('error', () => fallbackMyMemory(text));
  ydReq.end();
}

// ── 微软 Edge 翻译（用于菲律宾语等有道不支持的语言）──
let _msToken = null;
let _msTokenExpiry = 0;

function getMsToken(cb) {
  if (_msToken && Date.now() < _msTokenExpiry) return cb(null, _msToken);
  const req = https.request('https://edge.microsoft.com/translate/auth', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    timeout: 8000
  }, res => {
    let d = '';
    res.on('data', c => d += c);
    res.on('end', () => {
      _msToken = d.trim();
      _msTokenExpiry = Date.now() + 9 * 60 * 1000;
      cb(null, _msToken);
    });
  });
  req.on('error', cb);
  req.on('timeout', () => { req.destroy(); cb(new Error('timeout')); });
  req.end();
}

function handleMsTranslate(req, res, text, from, to) {
  getMsToken(function(err, token) {
    if (err || !token) {
      // 微软失败，fallback 到 MyMemory
      return fallbackMyMemoryForTl(text, from, to, res);
    }

    const msLangMap = { 'en': 'en', 'zh': 'zh-Hans', 'vi': 'vi', 'tl': 'fil', 'fil': 'fil', 'ph': 'fil' };
    const msFrom = msLangMap[from] || 'auto';
    const msTo   = msLangMap[to]   || 'fil';
    
    const msUrlObj = new URL('https://api-edge.cognitive.microsofttranslator.com/translate?from=' + msFrom + '&to=' + msTo + '&api-version=3.0&textType=plain');
    
    const msBody = JSON.stringify([{ Text: text }]);
    const msReq = https.request({
      hostname: msUrlObj.hostname,
      path: msUrlObj.pathname + msUrlObj.search,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      timeout: 10000
    }, msRes => {
      let msBody = '';
      msRes.on('data', d => msBody += d);
      msRes.on('end', () => {
        try {
          const j = JSON.parse(msBody);
          const result = j?.[0]?.translations?.[0]?.text;
          if (result && result.trim() && !isBadTranslation(text, result)) {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            return res.end(JSON.stringify({ success: true, result: result.trim() }));
          }
        } catch(e) {}
        fallbackMyMemoryForTl(text, from, to, res);
      });
    });
    msReq.on('error', () => fallbackMyMemoryForTl(text, from, to, res));
    msReq.on('timeout', () => { msRes.destroy(); fallbackMyMemoryForTl(text, from, to, res); });
    msReq.write(msBody);
    msReq.end();
  });
}

function fallbackMyMemoryForTl(originalText, from, to, res) {
  const mmLang = { zh: 'zh-CN', en: 'en', vi: 'vi', tl: 'tl' };
  const langPair = (mmLang[from] || 'en') + '|' + (mmLang[to] || 'tl');
  const mmPath = '/get?q=' + encodeURIComponent(originalText) + '&langpair=' + encodeURIComponent(langPair);
  const mmOpt = {
    hostname: 'api.mymemory.translated.net',
    path: mmPath,
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' }
  };
  let body = '';
  const mmReq = https.request(mmOpt, mmRes => {
    mmRes.on('data', d => { body += d; });
    mmRes.on('end', () => {
      try {
        const j = JSON.parse(body);
        const translated = j.responseData && j.responseData.translatedText;
        if (translated && !translated.includes('MYMEMORY WARNING') && !translated.includes('QUERY LENGTH LIMIT') && translated !== 'USAGE LIMIT EXCEEDED' && !isBadTranslation(originalText, translated)) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
          return res.end(JSON.stringify({ success: true, result: translated }));
        }
      } catch(e) {}
      // MyMemory 失败 → 腾讯云兜底（菲律宾语也支持）
      if (sendTencentCloud(originalText, from, to, res)) return;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, result: originalText }));
    });
  });
  mmReq.on('error', () => {
    if (!sendTencentCloud(originalText, from, to, res)) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ success: false, result: originalText }));
    }
  });
  mmReq.end();
}

// ── HTTP 服务器 ─────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  // 翻译代理（国内可访问）
  if (pathname === '/api/translate' && req.method === 'GET') return handleTranslate(req, res);

  // POST /api/translate（i18n.js 用 POST）
  if (pathname === '/api/translate' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const { text, from, to } = JSON.parse(body);
        // 复用 GET 处理逻辑，但用查询参数形式
        const modifiedReq = { url: `/api/translate?text=${encodeURIComponent(text || '')}&from=${from || 'auto'}&to=${to || 'en'}` };
        handleTranslate(modifiedReq, res);
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, result: '' }));
      }
    });
    return;
  }

  // POST /api/translate/batch（i18n.js autoTranslateMissing 用）
  if (pathname === '/api/translate/batch' && req.method === 'POST') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const { from, to, texts } = JSON.parse(body);
        const results = {};
        const entries = Object.entries(texts || {});
        for (const [key, text] of entries) {
          // 逐条翻译（复用 handleTranslate GET 逻辑）
          await new Promise(resolve => {
            const modifiedReq = { url: `/api/translate?text=${encodeURIComponent(text || '')}&from=${from || 'auto'}&to=${to || 'en'}` };
            // 捕获翻译结果
            const origEnd = res.end.bind(res);
            const chunks = [];
            const newRes = {
              writeHead: () => {},
              end: (data) => {
                try {
                  const j = JSON.parse(data || '{}');
                  results[key] = j.result || j.translatedText || text;
                } catch(e2) {
                  results[key] = text;
                }
                resolve();
              },
              on: (e, cb) => {
                if (e === 'data') return cb('');
                if (e === 'end') return resolve();
              }
            };
            handleTranslate(modifiedReq, newRes);
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ translations: results }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ translations: {} }));
      }
    });
    return;
  }

  // ── 翻译缓存持久化 API ───────────────────────────────────────────
  // GET /api/i18n/:lang  代理到后台 admin（后台有完整翻译数据）
  const i18nGetMatch = pathname.match(/^\/api\/i18n\/([a-z]{2}(-[A-Z]{2})?)$/);
  if (i18nGetMatch && req.method === 'GET') {
    const lang = i18nGetMatch[1];
    // 本地缓存 key 标准化（前台 translations.json 使用短码 zh/vi/tl，非 zh-CN/vi-VN）
    const LOCAL_LANG_MAP = { 'zh-CN': 'zh', 'vi-VN': 'vi', 'tl-PH': 'tl', 'fil-PH': 'tl' };
    const localLang = LOCAL_LANG_MAP[lang] || lang;
    const local = readTranslations();
    const localData = local[localLang] || {};
    // 后台翻译数据的语言码（后台只有 zh/vi/tl/fil/en，无 zh-CN/vi-VN）
    const adminLang = LOCAL_LANG_MAP[lang] || lang;
    const adminUrl = `http://${ADMIN_HOST}:${ADMIN_PORT}/api/i18n/${adminLang}`;
    http.get(adminUrl, (adminRes) => {
      let data = '';
      adminRes.on('data', c => data += c);
      adminRes.on('end', () => {
        try {
          const adminData = JSON.parse(data) || {};
          // 检测是否是真正的数组格式（只有 Array.isArray 能准确判断）
          // 数组才 fallback 到本地缓存；对象（含混有数字键的翻译对象）正常合并
          // 合并：后台基础翻译 + 本地动态翻译（后者覆盖前者）
          const merged = Array.isArray(adminData) ? { ...localData } : { ...adminData, ...localData };
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(merged));
        } catch(e) {
          // 后台挂了也返回本地数据
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(localData));
        }
      });
    }).on('error', () => {
      // 后台不可达时返回本地缓存
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(localData));
    });
    return;
  }
  // PUT /api/i18n/:lang  写入/合并翻译 key（用于 autoTranslate 缓存持久化）
  const i18nPutMatch = pathname.match(/^\/api\/i18n\/([a-z]{2}(-[A-Z]{2})?)$/);
  if (i18nPutMatch && req.method === 'PUT') {
    let body = '';
    req.on('data', d => body += d);
    req.on('end', () => {
      try {
        const lang = i18nPutMatch[1];
        const LOCAL_LANG_MAP = { 'zh-CN': 'zh', 'vi-VN': 'vi', 'tl-PH': 'tl', 'fil-PH': 'tl' };
        const localLang = LOCAL_LANG_MAP[lang] || lang;
        const updates = JSON.parse(body);
        if (!updates || typeof updates !== 'object') throw new Error('Invalid body');
        const translations = readTranslations();
        if (!translations[localLang]) translations[localLang] = {};
        let count = 0;
        Object.entries(updates).forEach(([key, value]) => {
          if (value && typeof value === 'string' && value.trim()) {
            translations[localLang][key.trim()] = value.trim();
            count++;
          }
        });
        writeTranslations(translations);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 新闻浏览量 API：GET /api/news-views/[slug]
  const newsViewsMatch = pathname.match(/^\/api\/news-views\/(.+)$/);
  if (newsViewsMatch) {
    const slug = decodeURIComponent(newsViewsMatch[1]);
    const views = readNewsViews();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, slug, views: views[slug] || 0 }));
    return;
  }

  // 所有新闻浏览量 API：GET /api/news-views (返回所有)
  if (pathname === '/api/news-views' && req.method === 'GET') {
    const views = readNewsViews();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, data: views }));
    return;
  }

  // 产品 by-slug API：代理到后台（不走 handleProductDetail）
  if (pathname.startsWith('/api/products/by-slug/')) return proxyToAdmin(req, res);

  // 产品详情API：/api/products/{id} → 从产品列表中查找
  const productDetailMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productDetailMatch) return handleProductDetail(req, res, productDetailMatch[1]);

  // /api/applications → /api/scenarios（别名路由，转换数据格式）
  if (pathname === '/api/applications') {
    const scenariosUrl = `http://${ADMIN_HOST}:${ADMIN_PORT}/api/scenarios`;
    http.get(scenariosUrl, (apiRes) => {
      let body = '';
      apiRes.on('data', d => { body += d; });
      apiRes.on('end', () => {
        try {
          // 后台存 nested {descriptionsByLang:{en,zh,vi,ph}} → 转为前台 flat {_en,_zh,_vi,_tl}
          const raw = JSON.parse(body);
          // 兼容两种格式：{success,data} 或 直接数组
          const scenariosData = raw.data || raw;
          const flat = (Array.isArray(scenariosData) ? scenariosData : []).map(s => ({
            id: s.id,
            slug: s.slug || '',
            image: s.image || '',
            images: s.images || [],
            name_en: s.name_en || s.name || '',
            name_zh: s.name_zh || '',
            name_vi: s.name_vi || '',
            name_tl: s.name_tl || '',
            description_en: s.description_en || '',
            description_zh: s.description_zh || '',
            description_vi: s.description_vi || '',
            description_tl: s.description_tl || '',
            // 推荐材料（后台已扁平化）
            materials: Array.isArray(s.materials) ? s.materials.map(m => ({
              id: m.id,
              name: m.name || m.name_en || '',
              name_en:  m.name_en  || '',
              name_zh:  m.name_zh  || '',
              name_vi:  m.name_vi  || '',
              name_tl:  m.name_tl  || '',
              desc: m.desc || m.description_en || '',
              description_en:  m.description_en  || '',
              description_zh:  m.description_zh  || '',
              description_vi:  m.description_vi  || '',
              description_tl:  m.description_tl  || '',
            })) : []
          }));
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: true, data: flat }));
        } catch(e) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, message: 'Parse error' }));
        }
      });
    }).on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Admin unavailable' }));
    });
    return;
  }

  // /api/* → 代理到后台
  if (pathname.startsWith('/api/')) return proxyToAdmin(req, res);

  // 图片/上传目录 → 代理到后台（后台上传的图片可在前台访问）
  if (pathname.startsWith('/uploads/')
   || pathname.startsWith('/admin-images/')
   || pathname.startsWith('/about-uploads/')
   || pathname.startsWith('/homepage-uploads/')
   || pathname.startsWith('/case-uploads/')
   || pathname.startsWith('/product-images/')) {
    return proxyToAdmin(req, res);
  }

  // 根路径 → index.html
  if (pathname === '/') pathname = '/index.html';

  // ── 干净 URL 路由（Clean URL rewrite）────────────────────────────
  // /products              → products.html
  // /products/:slug       → product-detail.html（SEO 友好 URL）
  // /products/:catSlug     → products.html
  // /products/:catSlug/:productSlug → product-detail.html
  // /about                 → about.html
  // /contact               → contact.html
  // /applications          → applications.html
  // /case-studies          → case-studies.html
  // /news                  → news.html
  // /news/:slug            → news-detail.html
  if (pathname === '/products') {
    const q = parsedUrl.query || '';
    if (q && (q.includes('id=') || q.includes('slug='))) {
      pathname = '/product-detail.html';
    } else {
      pathname = '/products.html';
    }
  } else if (pathname.startsWith('/products/')) {
    // /products/:slug → product-detail.html
    const parts = pathname.replace(/^\/products\//, '').split('/').filter(Boolean);
    pathname = '/product-detail.html';
    // 将 slug 作为查询参数传给 product-detail.html（兼容现有 JS 逻辑）
    const slug = parts.join('/');
    parsedUrl.search = '?slug=' + encodeURIComponent(slug);
  } else if (pathname === '/about') {
    pathname = '/about.html';
  } else if (pathname === '/contact') {
    pathname = '/contact.html';
  } else if (pathname === '/applications') {
    pathname = '/applications.html';
  } else if (pathname === '/case-studies' || pathname === '/cases') {
    pathname = '/case-studies.html';
  } else if (pathname.startsWith('/cases/') || pathname.startsWith('/case-studies/')) {
    pathname = '/case-detail.html';
  } else if (pathname === '/news') {
    pathname = '/news.html';
  } else if (pathname.startsWith('/news/')) {
    pathname = '/news-detail.html';
  }

  // 浏览量统计（仅统计真实访客，排除本地 IP）
  if (req.method === 'GET') {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const isLocal  = ['127.0.0.1','::1','::ffff:127.0.0.1'].some(ip => clientIp.startsWith(ip));
    if (!isLocal) {
      // 如果是新闻详情页，从路径中获取 slug
      let slug = null;
      const origPathname = parsedUrl.pathname;
      if (origPathname.startsWith('/news/')) {
        slug = origPathname.replace('/news/', '').split('/')[0] || null;
      } else if (origPathname === '/news-detail.html') {
        const query = parsedUrl.query || '';
        const params = new URLSearchParams(query);
        slug = params.get('slug') || null;
      }
      recordPageview(pathname, slug);
    }
  }

  // 静态文件服务
  const filePath    = path.join(__dirname, pathname);
  const ext         = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404 Not Found</h1>');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const adminUrl = `${ADMIN_PROTO}://${ADMIN_HOST}:${ADMIN_PORT}`;
  console.log(`✅ JinYu 前台已启动: http://localhost:${PORT}/`);
  console.log(`   后台代理目标: ${adminUrl}`);
});
