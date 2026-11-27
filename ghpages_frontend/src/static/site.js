// udi-custom-trac GitHub Pages — progressive enhancements.
// The site works without this script: the menu links stay reachable and the
// code blocks can still be selected by hand.
(function () {
  'use strict';

  var header = document.querySelector('[data-header]');
  var toggle = document.querySelector('[data-menu-toggle]');
  if (header && toggle) {
    toggle.addEventListener('click', function () {
      var open = header.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for non-secure contexts (for example plain http on a LAN).
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      var ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      document.body.removeChild(area);
      return ok ? resolve() : reject(new Error('copy failed'));
    });
  }

  document.querySelectorAll('[data-copy]').forEach(function (button) {
    var label = button.textContent;
    button.addEventListener('click', function () {
      var target = document.getElementById(button.getAttribute('data-copy'));
      if (!target) {
        return;
      }
      copyText(target.textContent).then(
        function () { button.textContent = 'コピーしました'; },
        function () { button.textContent = 'コピーできませんでした'; }
      ).then(function () {
        window.setTimeout(function () { button.textContent = label; }, 1800);
      });
    });
  });
})();
