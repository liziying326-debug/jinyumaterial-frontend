/**
 * Mobile Menu — onclick + classList.toggle
 *
 * Each page's <div id="hamburger"> MUST have:  onclick="toggleMobileMenu()"
 * HTML requires: #hamburger, #mobile-nav-overlay, #mobileBackdrop, #mobileNavList, #mobileLangSwitcher
 */
document.addEventListener('DOMContentLoaded', function () {
  var overlay   = document.getElementById('mobile-nav-overlay');
  var backdrop  = document.getElementById('mobileBackdrop');
  var hamburger = document.getElementById('hamburger');
  var navList   = document.getElementById('mobileNavList');
  var langArea  = document.getElementById('mobileLangSwitcher');
  var navMenu   = document.getElementById('navMenu');

  /* =============================================
     DESKTOP DROPDOWN — click to expand / collapse
     ============================================= */
  function initDesktopDropdowns() {
    if (!navMenu) return;

    // Click on nav-link that has a dropdown → toggle open state
    navMenu.addEventListener('click', function (e) {
      var link = e.target.closest('.nav-link');
      if (!link) return;
      var item = link.parentElement;
      var dd = item.querySelector('.dropdown');
      if (!dd) return;

      e.preventDefault();
      e.stopPropagation();

      var wasOpen = item.classList.contains('open');
      // Close all others
      navMenu.querySelectorAll('.nav-item.open').forEach(function (oi) {
        if (oi !== item) {
          oi.classList.remove('open');
          oi.querySelector('.nav-link').classList.remove('mobile-open');
        }
      });
      // Toggle current
      item.classList.toggle('open', !wasOpen);
      link.classList.toggle('mobile-open', !wasOpen);
    });

    // Click anywhere outside nav → close all
    document.addEventListener('click', function (e) {
      if (!navMenu.contains(e.target)) {
        navMenu.querySelectorAll('.nav-item.open').forEach(function (item) {
          item.classList.remove('open');
          var link = item.querySelector('.nav-link');
          if (link) link.classList.remove('mobile-open');
        });
      }
    });

    // ESC → close all
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        navMenu.querySelectorAll('.nav-item.open').forEach(function (item) {
          item.classList.remove('open');
          var link = item.querySelector('.nav-link');
          if (link) link.classList.remove('mobile-open');
        });
      }
    });
  }

  /* =============================================
     MOBILE MENU
     ============================================= */
  function initMobileMenu() {
    if (!overlay || !backdrop || !hamburger || !navList) return;

    /* ── Build language buttons ─────────────────────────────────── */
    function buildLangSwitcher() {
      if (!langArea) return;
      var langs = [
        { code: 'en', label: 'EN' },
        { code: 'zh', label: '中文' },
        { code: 'vi', label: 'VI' },
        { code: 'tl', label: 'TL' }
      ];
      var current = (window.i18n && window.i18n.currentLang) || localStorage.getItem('jinyu_lang') || 'en';

      langArea.innerHTML = '';
      langs.forEach(function (l) {
        var btn = document.createElement('button');
        btn.className = 'mobile-lang-btn' + (l.code === current ? ' active' : '');
        btn.textContent = l.label;
        btn.setAttribute('data-lang', l.code);
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          if (window.i18n && typeof window.i18n.changeLanguage === 'function') {
            window.i18n.changeLanguage(l.code);
          }
          langArea.querySelectorAll('.mobile-lang-btn').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-lang') === l.code);
          });
        });
        langArea.appendChild(btn);
      });
    }

    /* ── Populate nav items (always re-sync from desktop nav) ───── */
    function populateNav() {
      var src = document.getElementById('navMenu');
      if (!src) return;
      navList.innerHTML = src.innerHTML;
      navList.querySelectorAll('.dropdown').forEach(function (dd) {
        dd.classList.remove('mobile-show');
      });
      navList.querySelectorAll('.nav-link').forEach(function (link) {
        link.classList.remove('mobile-open');
      });
    }

    /* ── Open / Close ───────────────────────────────────────────── */
    function openMenu() {
      populateNav();
      buildLangSwitcher();

      if (langArea && window.i18n) {
        var cur = window.i18n.currentLang || localStorage.getItem('jinyu_lang') || 'en';
        langArea.querySelectorAll('.mobile-lang-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-lang') === cur);
        });
      }
      overlay.classList.add('show');
      backdrop.classList.add('show');
      hamburger.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      overlay.classList.remove('show');
      backdrop.classList.remove('show');
      hamburger.classList.remove('active');
      document.body.style.overflow = '';
      // Reset all dropdown states so next open starts fresh
      navList.querySelectorAll('.dropdown.mobile-show').forEach(function (dd) {
        dd.classList.remove('mobile-show');
      });
      navList.querySelectorAll('.nav-link.mobile-open').forEach(function (link) {
        link.classList.remove('mobile-open');
      });
    }

    /* ── Global toggle (onclick) ────────────────────────────────── */
    window.toggleMobileMenu = function () {
      if (overlay.classList.contains('show')) {
        closeMenu();
      } else {
        openMenu();
      }
    };

    /* ── Dropdown toggle inside mobile nav ──────────────────────── */
    navList.addEventListener('click', function (e) {
      var link = e.target.closest('.nav-link');
      if (!link) return;
      var item = link.parentElement;
      var dd = item.querySelector('.dropdown');
      if (dd) {
        e.preventDefault();
        e.stopPropagation();
        var isOpen = dd.classList.contains('mobile-show');
        navList.querySelectorAll('.dropdown.mobile-show').forEach(function (other) {
          if (other !== dd) {
            other.classList.remove('mobile-show');
            var otherLink = other.parentElement && other.parentElement.querySelector('.nav-link');
            if (otherLink) otherLink.classList.remove('mobile-open');
          }
        });
        dd.classList.toggle('mobile-show', !isOpen);
        link.classList.toggle('mobile-open', !isOpen);
      }
    });

    /* ── Dropdown item click → close menu and navigate ─────────── */
    navList.addEventListener('click', function (e) {
      var subLink = e.target.closest('.dropdown a');
      if (!subLink) return;
      // Close mobile menu, let default navigation happen
      closeMenu();
    });

    /* ── Backdrop click → close ─────────────────────────────────── */
    backdrop.addEventListener('click', function () {
      closeMenu();
    });

    /* ── ESC → close ────────────────────────────────────────────── */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('show')) {
        closeMenu();
      }
    });

    /* ── Resize to desktop → close ──────────────────────────────── */
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1100 && overlay.classList.contains('show')) {
        closeMenu();
      }
    });
  }

  /* =============================================
     INIT — detect screen size on load + on resize
     ============================================= */
  function isDesktop() {
    return window.innerWidth > 1100;
  }

  initDesktopDropdowns();
  initMobileMenu();
});
