/**
 * Internationalization (i18n) Module
 * 从后台 API 加载翻译数据，缺失的翻译自动翻译并保存
 */

const i18n = {
  currentLang: 'en',
  supportedLanguages: ['en', 'zh', 'vi', 'tl'],
  langNames: {
    'en': 'English',
    'zh': '中文',
    'vi': 'Tiếng Việt',
    'tl': 'Filipino'
  },
  langCodes: {
    'en': 'EN',
    'zh': '中文',
    'vi': 'VN',
    'tl': 'PH'
  },

  // 翻译数据缓存（从后台加载）
  translations: {},

  // 是否已初始化
  _initialized: false,
  _initPromise: null,

  // 自动翻译功能开关
  autoTranslate: true,

  // 源语言：自动翻译时以哪种语言为源
  sourceLang: 'en',

  /**
   * 从后台加载翻译数据
   * @param {string} lang - 语言代码
   * @returns {Promise<Object>} 翻译数据（扁平 key-value）
   */
  async loadTranslations(lang) {
    try {
      const response = await fetch(`/api/i18n/${lang}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data || {};
    } catch (err) {
      console.warn(`Failed to load translations for "${lang}":`, err.message);
      return {};
    }
  },

  /**
   * 获取翻译文本
   * @param {string} key - 翻译键（支持点号分隔如 "nav.home"）
   * @returns {string} 翻译文本
   */
  t(key) {
    const dict = i18n.translations[i18n.currentLang] || {};
    const enDict = i18n.translations['en'] || {};
    // 当前语言有翻译且不是键名本身 → 返回翻译
    if (dict[key] && dict[key] !== key) return dict[key];
    // fallback 到英文
    if (enDict[key] && enDict[key] !== key) return enDict[key];
    return key; // 最终 fallback 返回键名
  },

  /**
   * 检测某种语言缺失的翻译 key
   * 以英文或中文（sourceLang）为基准，找出当前语言没有翻译的 key
   */
  findMissingKeys(targetLang) {
    const sourceDict = i18n.translations[i18n.sourceLang] || i18n.translations['en'] || {};
    const targetDict = i18n.translations[targetLang] || {};
    const missing = {};

    Object.entries(sourceDict).forEach(([key, value]) => {
      // 如果目标语言没有这个 key，或者值就是 key 本身，或者值为空
      if (!targetDict[key] || targetDict[key] === key || targetDict[key].trim() === '') {
        // 只有在有有效源文本时才需要翻译
        if (value && value !== key && value.trim() !== '') {
          missing[key] = value;
        }
      }
    });

    return missing;
  },

  /**
   * 自动翻译缺失的 key 并保存
   * @param {string} targetLang - 目标语言
   * @param {Object} missingKeys - { key: sourceText }
   * @returns {Promise<number>} 成功翻译的数量
   */
  async autoTranslateMissing(targetLang, missingKeys) {
    const keys = Object.keys(missingKeys);
    if (keys.length === 0) return 0;

    console.log(`[i18n] auto-translating ${keys.length} missing keys to "${targetLang}"...`);

    try {
      // 调用后台批量翻译接口
      const from = i18n.sourceLang;
      const response = await fetch('/api/translate/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: from,
          to: targetLang,
          texts: missingKeys
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      // 将翻译结果合并到缓存中
      if (result.translations && i18n.translations[targetLang]) {
        Object.entries(result.translations).forEach(([key, value]) => {
          if (value && value !== key) {
            i18n.translations[targetLang][key] = value;
          }
        });
      }

      console.log(`[i18n] auto-translated ${keys.length} keys to "${targetLang}" ✓`);
      return keys.length;
    } catch (err) {
      console.error(`[i18n] auto-translate failed for "${targetLang}":`, err.message);
      return 0;
    }
  },

  /**
   * 初始化翻译系统
   * 从 localStorage 读取语言 → 加载该语言翻译 → 自动翻译缺失 → 应用到 DOM
   * @returns {Promise<void>}
   */
  async init() {
    try {
      // 从 localStorage 读取上次使用的语言
      const savedLang = localStorage.getItem('jinyu_lang');
      if (savedLang && i18n.supportedLanguages.includes(savedLang)) {
        i18n.currentLang = savedLang;
      }

      // 加载当前语言的翻译
      const data = await i18n.loadTranslations(i18n.currentLang);
      i18n.translations[i18n.currentLang] = data;

      // 同时加载源语言（用于检测缺失翻译）
      if (i18n.currentLang !== i18n.sourceLang && !i18n.translations[i18n.sourceLang]) {
        const sourceData = await i18n.loadTranslations(i18n.sourceLang);
        i18n.translations[i18n.sourceLang] = sourceData;
      }
      // 也加载英文作为 fallback
      if (!i18n.translations['en']) {
        const enData = await i18n.loadTranslations('en');
        i18n.translations['en'] = enData;
      }

      // 自动翻译缺失的内容（改为非阻塞：后台静默执行，不 await）
      if (i18n.autoTranslate && i18n.currentLang !== i18n.sourceLang) {
        const missing = i18n.findMissingKeys(i18n.currentLang);
        if (Object.keys(missing).length > 0) {
          i18n.autoTranslateMissing(i18n.currentLang, missing).then(function(count) {
            if (count > 0) { i18n.applyTranslations(); }
          }).catch(function() {});
        }
      }
    } catch (err) {
      console.warn('[i18n] init partial failure, continuing with fallback:', err.message);
    } finally {
      // 无论成功还是失败，都标记为已初始化
      i18n._initialized = true;
      // 应用翻译到 DOM
      i18n.applyTranslations();
      console.log(`i18n initialized with language: ${i18n.currentLang} (${Object.keys(i18n.translations[i18n.currentLang] || {}).length} keys)`);
    }
  },

  /**
   * 切换语言
   * @param {string} lang - 语言代码
   */
  async changeLanguage(lang) {
    if (!i18n.supportedLanguages.includes(lang)) {
      console.warn(`Unsupported language: ${lang}`);
      return;
    }

    const oldLang = i18n.currentLang;
    i18n.currentLang = lang;
    localStorage.setItem('jinyu_lang', lang);

    // 如果该语言还没加载过，先加载
    if (!i18n.translations[lang]) {
      console.log('[i18n] changeLanguage: loading ' + lang + ' (was not cached)');
      const data = await i18n.loadTranslations(lang).catch(function(err) {
        console.warn('[i18n] loadTranslations error (ignored):', err.message);
        return {};
      });
      i18n.translations[lang] = data;
      console.log('[i18n] changeLanguage: loaded ' + lang + ', got ' + Object.keys(data).length + ' keys');
    } else {
      console.log('[i18n] changeLanguage: using cached ' + lang + ' (' + Object.keys(i18n.translations[lang]).length + ' keys)');
    }

    // 确保源语言和英文已加载
    if (!i18n.translations[i18n.sourceLang]) {
      i18n.translations[i18n.sourceLang] = await i18n.loadTranslations(i18n.sourceLang);
    }
    if (!i18n.translations['en']) {
      i18n.translations['en'] = await i18n.loadTranslations('en');
    }

    // 自动翻译缺失的内容（改为非阻塞，后台悄悄翻译，不影响页面响应）
    if (i18n.autoTranslate && lang !== i18n.sourceLang) {
      const missing = i18n.findMissingKeys(lang);
      if (Object.keys(missing).length > 0) {
        i18n.autoTranslateMissing(lang, missing).then(function(count) {
          if (count > 0) { i18n.applyTranslations(); }
        }).catch(function() {});
      }
    }

    // 应用翻译
    i18n.applyTranslations();

    // 触发自定义事件
    document.dispatchEvent(new CustomEvent('langChange', {
      detail: { lang, oldLang }
    }));
  },

  /**
   * 应用翻译到所有带有 data-i18n 属性的元素
   * 优先级：① data-i18n-{lang} 内联属性 → ② translations.json key → ③ 英文 fallback
   */
  applyTranslations() {
    const lang = i18n.currentLang;
    // 处理 data-i18n 属性（纯文本）
    const elements = document.querySelectorAll('[data-i18n]');
    let applied = 0;
    elements.forEach(el => {
      const key = el.getAttribute('data-i18n');

      // ① 优先读内联的 data-i18n-{lang} 属性（如 data-i18n-vi="..."）
      const inlineVal = (lang !== 'en') ? el.getAttribute('data-i18n-' + lang) : null;
      let translation;
      if (inlineVal && inlineVal.trim()) {
        translation = inlineVal.trim();
      } else {
        translation = i18n.t(key);
      }

      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = translation;
      } else {
        el.textContent = translation;
      }
      applied++;
    });
    // footer debug: 找到 footer 中的 data-i18n 元素
    const footerEls = document.querySelectorAll('footer [data-i18n]');
    if (footerEls.length > 0) {
      console.log('[i18n] applyTranslations: found ' + footerEls.length + ' footer elements, currentLang=' + i18n.currentLang);
      footerEls.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const val = el.textContent;
        console.log('  footer: ' + key + ' = ' + val);
      });
    } else {
      console.log('[i18n] applyTranslations: NO footer [data-i18n] elements found!');
    }

    // 处理 data-i18n-html 属性（支持 HTML 标签）
    const htmlElements = document.querySelectorAll('[data-i18n-html]');
    htmlElements.forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const translation = i18n.t(key);
      el.innerHTML = translation;
    });

    // 处理 data-i18n-placeholder 属性
    const phElements = document.querySelectorAll('[data-i18n-placeholder]');
    phElements.forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translation = i18n.t(key);
      if (translation !== key) {
        el.placeholder = translation;
      }
    });
  }
};

// 快捷方法

// 快捷方法
window.applyI18n = function() { i18n.applyTranslations(); };
window.i18n = i18n;

// ========================================
// window.autoTranslate —— 供各页面 pickLang / translate 调用
// 走后台 /api/translate 代理，带 sessionStorage 缓存 + translations.json 持久化
// 优先级：products.json 字段 → translations.json(i18n)缓存 → API 实时翻译→回写缓存
// ========================================
(function setupAutoTranslate() {
  var cache = {};

  function cacheKey(from, to, text) {
    return from + '|' + to + '|' + text;
  }

  /**
   * 从 i18n.translations 中读取动态翻译缓存
   * key 格式：prod_{id}_{field} 如 prod_42_name
   */
  function readI18nCache(id, field, lang) {
    if (!id || !field || !lang || lang === 'en') return '';
    var key = 'prod_' + id + '_' + field;
    var dict = (window.i18n && window.i18n.translations && window.i18n.translations[lang]) || {};
    return dict[key] || '';
  }

  /**
   * 将翻译结果异步写入 translations.json（不阻塞渲染）
   */
  function saveToI18nCache(id, field, lang, text) {
    if (!id || !field || !lang || !text || !text.trim() || lang === 'en') return;
    var key = 'prod_' + id + '_' + field;
    fetch('/api/i18n/' + lang, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: text.trim() })
    }).catch(function(e) {
      console.warn('[autoTranslate] cache save failed:', e.message);
    });
    // 同时更新内存缓存，下次直接用
    if (window.i18n && window.i18n.translations) {
      if (!window.i18n.translations[lang]) window.i18n.translations[lang] = {};
      window.i18n.translations[lang][key] = text.trim();
    }
  }

  // 翻译单段文本（带 i18n 缓存 + 内存缓存 + 自动持久化）
  // 缓存优先级：①内存cache → ②i18n(translations.json)内存数据 → ③API翻译 → 回写①②
  // 按段落/句子分段翻译，每段不超过 500 字符，避免 MyMemory API 限制
  async function translate(text, from, to, opts) {
    if (!text || !text.trim() || from === to) return text;
    opts = opts || {};
    var trimmedText = text.trim();

    // 超过 500 字符 → 按段落分段翻译后合并
    if (trimmedText.length > 500) {
      var chunks = trimmedText.split(/(?<=\n\n)/g); // 按空行分段
      // 如果分段后仍有超长块，按句子再切
      var subChunks = [];
      for (var ci = 0; ci < chunks.length; ci++) {
        if (chunks[ci].trim().length > 500) {
          var sentences = chunks[ci].match(/[^.!?。！？]+[.!?。！？]+/g) || [chunks[ci]];
          for (var si = 0; si < sentences.length; si++) {
            var s = sentences[si].trim();
            var seg = s;
            while (seg.length > 500 && si < sentences.length - 1) {
              si++;
              seg += ' ' + sentences[si].trim();
            }
            if (seg.trim()) subChunks.push(seg.trim());
          }
        } else if (chunks[ci].trim()) {
          subChunks.push(chunks[ci].trim());
        }
      }
      if (subChunks.length > 1) {
        var results = [];
        for (var ti = 0; ti < subChunks.length; ti++) {
          var r = await translate(subChunks[ti], from, to, opts);
          results.push(r);
        }
        return results.join('\n\n');
      }
    }

    // ① 内存 cache（当前会话）
    var key = cacheKey(from, to, trimmedText);
    if (cache[key]) return cache[key];

    // ② i18n 缓存（translations.json 已加载到内存的数据，跨会话有效）
    //    只用 opts 中的 id/field 精确匹配（pickLang 路径传的）
    if (window.i18n && window.i18n.translations && window.i18n.translations[to]) {
      var i18nDict = window.i18n.translations[to];
      if (opts.cacheId && opts.cacheField) {
        var preciseKey = 'prod_' + opts.cacheId + '_' + opts.cacheField;
        if (i18nDict[preciseKey] && i18nDict[preciseKey].trim()) {
          cache[key] = i18nDict[preciseKey];
          return i18nDict[preciseKey];
        }
      }
    }

    // ③ 都没命中 → 调 API
    try {
      var res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmedText, from: from, to: to })
      });
      if (!res.ok) return text;
      var data = await res.json();
      var result = data.translatedText || data.result || text;
      // 过滤 API 返回的错误文本（如 MyMemory 警告）
      if (typeof result === 'string' && (result.includes('MYMEMORY WARNING') || result.includes('USAGE LIMIT') || result.includes('NEXT AVAILABLE'))) {
        return text;
      }
      // 翻译成功且与原文不同 → 持久化到 translations.json
      if (result && result.trim() && result !== text) {
        cache[key] = result;
        if (opts.cacheId) {
          saveToI18nCache(opts.cacheId, opts.cacheField, to, result);
        }
      }
      return result;
    } catch (e) {
      console.warn('[autoTranslate] failed:', e.message);
      return text;
    }
  }

  // 从对象中按 base+语言后缀取值，为空时自动翻译（含 i18n 缓存层）
  // 例如 pickLang({ id:42, name_zh:'灯箱布', name_en:'Banner' }, 'name', 'tl')
  // 优先级：①字段值 → ②i18n(translations.json)缓存 → ③API翻译→自动存入②
  async function pickLang(obj, base, lang) {
    if (!obj || !base || !lang) return '';
    // 英文：读 _en，有则直接返回
    if (lang === 'en') {
      return obj[base + '_en'] || obj[base] || obj[base + '_zh'] || '';
    }
    // 中文：读 _zh，有则直接返回；否则查缓存，缓存为空则翻译
    if (lang === 'zh') {
      var zhVal = (obj[base + '_zh'] || '').trim();
      if (zhVal) return zhVal;
      var cachedZh = readI18nCache(obj.id, base, lang);
      if (cachedZh) return cachedZh;
      // 翻译：normalizePost 把英文放在 obj[base]（非 base+'_en'），优先取 base
      var zhSrc = obj[base] || obj[base + '_en'] || '';
      if (!zhSrc.trim()) return '';
      var zhResult = await translate(zhSrc.trim(), 'en', 'zh', { cacheId: obj.id, cacheField: base });
      return zhResult;
    }
    // 越南/菲律宾：先读对应后缀字段
    // ⚠️ tl 的短字段（<50字符）可能是旧 langData.ph 残留片段，不信任，
    //    跳过以走 readI18nCache 读取完整翻译。≥50 字符视为有效翻译。
    var suffix = lang === 'tl' ? ['_tl', '_fil', '_ph'] : ['_' + lang];
    var found = '';
    for (var i = 0; i < suffix.length; i++) {
      if (obj[base + suffix[i]]) { found = obj[base + suffix[i]]; break; }
    }
    var tlFieldTooShort = (lang === 'tl' && base !== 'slug' && base !== 'region' && base !== 'industry' && found && found.trim().length < 50);
    if (found && found.trim() && !tlFieldTooShort) return found;

    // ② 查 i18n 缓存（translations.json 中之前的翻译结果）
    var cached = readI18nCache(obj.id, base, lang);
    if (cached) return cached;

    // ③ 字段和缓存都为空 → API 翻译并自动存入缓存
    //    优先用英文翻译源（质量更高），其次中文
    var srcText = obj[base + '_en'] || obj[base] || '';
    if (!srcText || !srcText.trim()) srcText = obj[base + '_zh'] || '';
    if (!srcText || !srcText.trim()) return '';
    var translated = await translate(srcText, 'en', lang, { cacheId: obj.id, cacheField: base });
    return translated;
  }

  window.autoTranslate = {
    translate: translate,
    pickLang: pickLang
  };
  window.pickLang = pickLang;  // 暴露给 case-detail.html 等页面直接调用
})();

// ========================================
// 语言切换器 - 下拉菜单版本
// ========================================
(function setupLanguageSwitcher() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSwitcher);
  } else {
    initSwitcher();
  }

  function initSwitcher() {
    const switcher = document.getElementById('language-switcher');
    if (!switcher) return;

    const codeSpan = switcher.querySelector('.lang-code');

    // 创建下拉菜单
    const dropdown = document.createElement('div');
    dropdown.className = 'lang-dropdown';

    const arrow = document.createElement('div');
    arrow.className = 'lang-dropdown-arrow';
    dropdown.appendChild(arrow);

    dropdown.innerHTML += i18n.supportedLanguages.map(lang => `
      <button class="lang-option ${lang === i18n.currentLang ? 'active' : ''}" data-lang="${lang}">
        <span class="lang-code">${i18n.langCodes[lang]}</span>
        <span class="lang-name">${i18n.langNames[lang]}</span>
      </button>
    `).join('');

    switcher.appendChild(dropdown);

    switcher.addEventListener('click', (e) => {
      if (e.target.closest('.lang-option')) return;
      e.stopPropagation();
      dropdown.classList.toggle('show');
      switcher.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
      if (!switcher.contains(e.target)) {
        dropdown.classList.remove('show');
        switcher.classList.remove('active');
      }
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation(); // 阻止冒泡到 document
      const btn = e.target.closest('.lang-option');
      console.log('[i18n] dropdown click, btn:', btn ? btn.getAttribute('data-lang') : 'null', 'target:', e.target.tagName, e.target.className);
      if (btn) {
        const lang = btn.getAttribute('data-lang');
        dropdown.classList.remove('show');
        switcher.classList.remove('active');
        console.log('[i18n] lang option selected:', lang);
        i18n.changeLanguage(lang).catch(function(err) {
          console.error('[i18n] changeLanguage error:', err);
        });
      }
    });

    function updateDisplay() {
      codeSpan.textContent = i18n.langCodes[i18n.currentLang];
      if (dropdown) {
        dropdown.querySelectorAll('.lang-option').forEach(option => {
          const lang = option.getAttribute('data-lang');
          option.classList.toggle('active', lang === i18n.currentLang);
        });
      }
    }

    document.addEventListener('langChange', updateDisplay);
    updateDisplay();
  }
})();

// ========================================
// 初始化（异步）
// ========================================
// 初始化 + 语言切换时刷新导航产品分类下拉菜单
document.addEventListener('langChange', () => {
  if (typeof loadNavProductDropdown === 'function') loadNavProductDropdown();
});

const _i18nReady = i18n.init().catch(err => {
  console.error('i18n init failed:', err);
  // 即使加载失败也尝试应用（使用键名作为回退）
  i18n.applyTranslations();
});
// 暴露到 window，供 case-detail.html 等页面在渲染前 await 等待翻译数据加载
window._i18nReady = _i18nReady;
_i18nReady.then(() => {
  if (typeof loadNavProductDropdown === 'function') loadNavProductDropdown();
});
