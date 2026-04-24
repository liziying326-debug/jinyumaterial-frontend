// API Client - 不影响原有i18n.js功能
// 只在需要动态加载数据时使用

const API_BASE = window.location.origin;

// 共享图片URL配置 - About页面相关图片
// 首页About Us图片 和 about页Our Journey图片共享同一个URL
const DEFAULT_ABOUT_IMAGES = {
  ourJourney: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80',
  aboutMain: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80'  // 默认同步使用Our Journey图片
};

// 从后台 /api/about 加载About页面图片配置
async function loadAboutImages() {
  try {
    const res = await fetch(`${API_BASE}/api/about`);
    if (res.ok) {
      const json = await res.json();
      const about = json.data || {};
      // timeline_image 就是发展历程配图
      if (about.timeline_image) {
        const imgUrl = about.timeline_image;
        DEFAULT_ABOUT_IMAGES.ourJourney = imgUrl;
        DEFAULT_ABOUT_IMAGES.aboutMain = imgUrl; // 首页About Us同步使用
      }
    }
  } catch {}
  return DEFAULT_ABOUT_IMAGES;
}

// 应用About页面图片到指定元素
async function applyAboutImages() {
  const images = await loadAboutImages();
  
  // 首页 About Us 图片 - 使用Our Journey的图片
  const aboutMainImg = document.getElementById('aboutMainImage');
  if (aboutMainImg) {
    aboutMainImg.src = images.aboutMain;
  }
  
  // About页 Our Journey 图片
  const journeyImg = document.getElementById('abt-timeline-img');
  if (journeyImg) {
    journeyImg.src = images.ourJourney;
  }
}

// 加载产品数据
async function fetchProducts() {
  try {
    const response = await fetch(`${API_BASE}/api/products`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load products:', error);
    return null;
  }
}

// 加载翻译
async function fetchTranslations(lang = 'en') {
  try {
    const response = await fetch(`${API_BASE}/api/i18n/${lang}`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load translations:', error);
    return null;
  }
}

// 加载站点设置（SEO）
async function fetchSettings() {
  try {
    const response = await fetch(`${API_BASE}/api/settings`);
    return await response.json();
  } catch (error) {
    console.error('Failed to load settings:', error);
    return null;
  }
}

/**
 * 初始化页面 SEO 标签
 * @param {object} options
 *   pageTitle   - 当前页面标题（如 "About Us"）；传入则拼接为 "About Us | {site_name}"
 *   description - 当前页面描述；不传则 fallback 到 settings.seo_description
 *   ogImage     - og:image URL（可选）
 */
async function initSEO(options) {
  options = options || {};
  const res = await fetchSettings();
  if (!res || !res.data) return;
  const s = res.data;

  // --- <title> ---
  let title = '';
  if (options.pageTitle) {
    title = options.pageTitle + (s.site_name ? ' | ' + s.site_name : '');
  } else {
    title = s.seo_title || s.site_name || document.title;
  }
  document.title = title;

  // --- meta description ---
  const desc = options.description || s.seo_description || '';
  let metaDesc = document.querySelector('meta[name="description"]');
  if (!metaDesc) {
    metaDesc = document.createElement('meta');
    metaDesc.name = 'description';
    document.head.appendChild(metaDesc);
  }
  if (desc) metaDesc.setAttribute('content', desc);

  // --- og:title ---
  let ogTitle = document.querySelector('meta[property="og:title"]');
  if (!ogTitle) {
    ogTitle = document.createElement('meta');
    ogTitle.setAttribute('property', 'og:title');
    document.head.appendChild(ogTitle);
  }
  ogTitle.setAttribute('content', title);

  // --- og:description ---
  let ogDesc = document.querySelector('meta[property="og:description"]');
  if (!ogDesc) {
    ogDesc = document.createElement('meta');
    ogDesc.setAttribute('property', 'og:description');
    document.head.appendChild(ogDesc);
  }
  if (desc) ogDesc.setAttribute('content', desc);

  // --- og:image (可选) ---
  if (options.ogImage) {
    let ogImg = document.querySelector('meta[property="og:image"]');
    if (!ogImg) {
      ogImg = document.createElement('meta');
      ogImg.setAttribute('property', 'og:image');
      document.head.appendChild(ogImg);
    }
    ogImg.setAttribute('content', options.ogImage);
  }
}

/**
 * 动态加载产品分类到导航栏 Products 下拉菜单
 * 查找 #nav-product-dropdown 元素，从 /api/categories 获取分类列表并填充
 * 翻译方式与产品页 tab 一致：用 autoTranslate.pickLang 异步翻译
 */
async function loadNavProductDropdown() {
  const dropdown = document.getElementById('nav-product-dropdown');
  if (!dropdown) {
    console.warn('[Dropdown DEBUG] #nav-product-dropdown NOT FOUND on this page');
    return;
  }
  console.log('[Dropdown DEBUG] dropdown element found:', dropdown);

  try {
    console.log('[Dropdown DEBUG] autoTranslate available:', typeof window.autoTranslate !== 'undefined');
    const res = await fetch(`${API_BASE}/api/categories`);
    console.log('[Dropdown DEBUG] fetch status=', res.status);
    if (!res.ok) return;
    const cats = await res.json();
    const list = Array.isArray(cats) ? cats : (cats.data || []);
    console.log('[Dropdown DEBUG] categories count:', list.length);
    if (list.length === 0) return;

    // 按 sort_order 排序
    list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const isSelfPage = dropdown.hasAttribute('data-self-page');
    const prefix = isSelfPage ? '/products#' : '/products#';
    console.log('[Dropdown DEBUG] prefix:', prefix, 'isSelfPage:', isSelfPage);

    // 获取当前语言
    function getLang() {
      try { return localStorage.getItem('jinyu_lang') || localStorage.getItem('lang') || 'en'; } catch(e) { return 'en'; }
    }
    const lang = getLang();

    // 用 autoTranslate.pickLang 翻译每个分类名称（与产品页 tab 一致）
    const translated = await Promise.all(list.map(async cat => {
      let name;
      if (window.autoTranslate) {
        name = await window.autoTranslate.pickLang(cat, 'name', lang);
      }
      if (!name) name = cat.name_en || cat.name || String(cat.id);
      const slug = String(cat.id);
      return `<a href="${prefix}${slug}">${name}</a>`;
    }));

    console.log('[Dropdown DEBUG] dropdown innerHTML set, links count:', translated.length);
    dropdown.innerHTML = translated.join('');
    console.log('[Dropdown DEBUG] dropdown children after set:', dropdown.children.length);

    // 如果在 products 页面自身（data-self-page），点击下拉项时同步切换 tab 内容
    if (isSelfPage && typeof window.switchCat === 'function') {
      dropdown.querySelectorAll('a').forEach(function(link) {
        link.addEventListener('click', function(e) {
          e.preventDefault();
          // 清除其他项的高亮
          dropdown.querySelectorAll('a').forEach(function(a) { a.classList.remove('dd-active'); });
          this.classList.add('dd-active');
          const hash = this.getAttribute('href').replace('/products#', '');
          if (hash) window.switchCat(hash);
        });
      });
    }
  } catch (e) {
    console.error('[Dropdown DEBUG] failed:', e);
  }
}

// 提交联系表单
async function submitContact(formData) {
  try {
    const response = await fetch(`${API_BASE}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    return await response.json();
  } catch (error) {
    console.error('Failed to submit form:', error);
    return { success: false, error: 'Network error' };
  }
}

// ========== 社交媒体图标（从后台动态加载） ==========

var _socialIconSvgMap = {
  facebook: '<path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>',
  instagram: '<linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f09433"/><stop offset=".25" stop-color="#e6683c"/><stop offset=".5" stop-color="#dc2743"/><stop offset=".75" stop-color="#cc2366"/><stop offset="1" stop-color="#bc1888"/></linearGradient><path fill="url(#ig)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>',
  youtube: '<path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>',
  linkedin: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
  twitter: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>',
  whatsapp: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.001 0C5.374 0 .108 5.365.001 12.01L0 12.003c0 2.166.57 4.2 1.567 5.96L0 24l6.192-1.62A11.94 11.94 0 0012.002 24c6.626 0 11.998-5.367 11.998-11.999 0-3.175-1.237-6.158-3.482-8.4z"/>',
  tiktok: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
  pinterest: '<path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12.017 24c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641 0 12.017 0z"/>'
};

// 品牌色映射（用于 footer 彩色图标）
var _socialBrandColors = {
  facebook:  '#1877F2',
  instagram: null,  // 渐变，用 currentColor 已包含
  youtube:   '#FF0000',
  linkedin:  '#0A66C2',
  twitter:   '#000000',
  whatsapp:  '#25D366',
  tiktok:    '#010101',
  pinterest: '#E60023'
};

/**
 * 从后台加载社交链接，渲染到指定容器
 * @param {string|HTMLElement} container - 容器元素或选择器
 * @param {object} opts
 *   opts.className  - 链接外层 class（默认 'nav-social-icon'）
 *   opts.showName   - 是否显示文字标签（默认 false）
 *   opts.maxCount   - 最多显示几个图标（默认不限）
 *   opts.brandColor - 是否使用品牌色（默认 false，用 currentColor）
 */
function loadSocialIcons(container, opts) {
  if (!container) return;
  var el = typeof container === 'string' ? document.querySelector(container) : container;
  if (!el) { console.warn('[loadSocialIcons] container not found:', container); return; }
  var cls = (opts && opts.className) || 'nav-social-icon';
  var showName = !!(opts && opts.showName);
  var maxCount = (opts && opts.maxCount) || 0;
  var brandColor = !!(opts && opts.brandColor);

  fetch(API_BASE + '/api/social-links')
    .then(function(r) { return r.json(); })
    .then(function(links) {
      if (!Array.isArray(links) || links.length === 0) {
        el.innerHTML = '';
        return;
      }
      // 按 sort_order 排序，只取 enabled 的
      links.sort(function(a, b) { return (a.sort_order || 0) - (b.sort_order || 0); });
      var enabled = links.filter(function(l) { return l.enabled !== false; });
      // 限制最大数量（用于导航栏）
      if (maxCount > 0) enabled = enabled.slice(0, maxCount);

      el.innerHTML = enabled.map(function(link) {
        var svgPath = (_socialIconSvgMap[link.icon] || _socialIconSvgMap.facebook);
        // 确定图标颜色
        var fillColor = 'currentColor';
        if (brandColor && _socialBrandColors[link.icon]) {
          fillColor = _socialBrandColors[link.icon];
        }
        var svgTag = '<svg width="20" height="20" viewBox="0 0 24 24" fill="' + fillColor + '" xmlns="http://www.w3.org/2000/svg">' + svgPath + '</svg>';
        var label = showName ? (' <span>' + (link.name || '') + '</span>') : '';
        return '<a href="' + (link.url || '#') + '" target="_blank" rel="noopener" class="' + cls + ' ' + (link.icon || '') + '" title="' + (link.name || '') + '">' + svgTag + label + '</a>';
      }).join('');
    })
    .catch(function(err) { console.warn('[loadSocialIcons] fetch failed:', err); });
}

window.loadSocialIcons = loadSocialIcons;
