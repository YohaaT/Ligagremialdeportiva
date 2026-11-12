(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // ---------- Temas ----------
  // Selector temporal mientras LGD elige el tema definitivo. Cada imagen con
  // data-src-<tema> cambia su archivo al cambiar el tema (logo y esfera).
  const THEMES = [
    { id: 'oliva', name: 'Oliva cobre', swatch: 'linear-gradient(135deg,#283618 50%,#dda15e 50%)' },
    { id: 'amatista', name: 'Amatista y turquesa', swatch: 'linear-gradient(135deg,#3c1642 50%,#1dd3b0 50%)' },
  ];
  const THEME_KEY = 'lgd-tema';

  function applyThemeImages(theme) {
    document.querySelectorAll('[data-src-' + theme + ']').forEach((img) => {
      const src = img.getAttribute('data-src-' + theme);
      const srcset = img.getAttribute('data-srcset-' + theme);
      if (srcset && img.getAttribute('srcset') !== srcset) img.setAttribute('srcset', srcset);
      if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    });
  }

  function setTheme(theme, persist) {
    if (!THEMES.some((t) => t.id === theme)) theme = THEMES[0].id;
    root.dataset.theme = theme;
    applyThemeImages(theme);
    document.querySelectorAll('[data-theme-option]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.themeOption === theme));
    });
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch { /* sin almacenamiento */ }
    }
  }

  function buildThemePicker() {
    const picker = document.createElement('div');
    picker.className = 'theme-picker';
    picker.innerHTML =
      '<div class="theme-options" id="theme-options" hidden><p>Vista previa de colores</p>' +
      THEMES.map((t) => '<button type="button" data-theme-option="' + t.id + '" aria-pressed="false"><span style="background:' + t.swatch + '"></span>' + t.name + '</button>').join('') +
      '</div><button type="button" class="theme-toggle" aria-expanded="false" aria-controls="theme-options"><i></i>Tema</button>';
    document.body.appendChild(picker);
    const toggle = picker.querySelector('.theme-toggle');
    const panel = picker.querySelector('.theme-options');
    const close = () => { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    panel.addEventListener('click', (event) => {
      const option = event.target.closest('[data-theme-option]');
      if (!option) return;
      setTheme(option.dataset.themeOption, true);
      close();
      toggle.focus();
    });
    document.addEventListener('click', (event) => { if (!picker.contains(event.target)) close(); });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { close(); toggle.focus(); } });
  }

  buildThemePicker();
  setTheme(root.dataset.theme, false);

  // ---------- Menú móvil ----------
  const navToggle = document.querySelector('.nav-toggle');
  if (navToggle) {
    const setOpen = (open) => {
      document.body.classList.toggle('nav-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    };
    navToggle.addEventListener('click', () => setOpen(!document.body.classList.contains('nav-open')));
    document.querySelectorAll('.nav-panel a').forEach((link) => link.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') setOpen(false); });
  }

  // ---------- Aparición al hacer scroll ----------
  const revealItems = [...document.querySelectorAll('[data-reveal]')];
  if (reducedMotion || !('IntersectionObserver' in window)) {
    revealItems.forEach((el) => el.classList.add('is-in'));
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealItems.forEach((el) => observer.observe(el));
  }

  // ---------- Parallax de esfera y tarjetas ----------
  // Cada elemento con data-depth se desplaza según el puntero y el scroll.
  const layers = [...document.querySelectorAll('[data-depth]')];
  if (layers.length && !reducedMotion) {
    let pointerX = 0;
    let pointerY = 0;
    let frame = 0;
    const render = () => {
      frame = 0;
      layers.forEach((el) => {
        const depth = parseFloat(el.dataset.depth) || 0;
        const rect = el.getBoundingClientRect();
        const centerOffset = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
        const scrollY = -centerOffset * depth * 60;
        el.style.setProperty('--px', (pointerX * depth * 18).toFixed(1) + 'px');
        el.style.setProperty('--py', (pointerY * depth * 18 + scrollY).toFixed(1) + 'px');
      });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(render); };
    if (finePointer) {
      window.addEventListener('pointermove', (event) => {
        pointerX = event.clientX / window.innerWidth - 0.5;
        pointerY = event.clientY / window.innerHeight - 0.5;
        schedule();
      }, { passive: true });
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    schedule();
  }

  // ---------- Pestañas ----------
  document.querySelectorAll('[data-tabs]').forEach((group) => {
    const buttons = [...group.querySelectorAll('[role="tab"]')];
    const select = (button, focus) => {
      buttons.forEach((b) => {
        const selected = b === button;
        b.setAttribute('aria-selected', String(selected));
        b.tabIndex = selected ? 0 : -1;
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        if (panel) panel.hidden = !selected;
      });
      if (focus) button.focus();
      group.dispatchEvent(new CustomEvent('tabchange', { detail: button.dataset.tab }));
    };
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => select(button, false));
      button.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
        select(next, true);
      });
    });
  });

  // CTA del bloque «La Liga en movimiento» cambia según la pestaña activa.
  document.querySelectorAll('[data-tab-cta]').forEach((cta) => {
    const group = document.querySelector(cta.dataset.tabCta);
    if (!group) return;
    group.addEventListener('tabchange', (event) => {
      const target = cta.querySelector('[data-for="' + event.detail + '"]');
      if (!target) return;
      cta.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el !== target; });
    });
  });

  // ---------- Carrusel de logos ----------
  document.querySelectorAll('.logo-track').forEach((track) => {
    if (track.dataset.ready) return;
    [...track.children].forEach((item) => {
      const clone = item.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.querySelectorAll('img').forEach((img) => { img.alt = ''; });
      track.appendChild(clone);
    });
    track.style.setProperty('--marquee-time', Math.max(24, track.children.length * 3) + 's');
    track.dataset.ready = 'true';
  });

  // ---------- Inclinación 3D al pasar el cursor ----------
  if (finePointer && !reducedMotion) {
    document.querySelectorAll('[data-tilt]').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width - 0.5;
        const y = (event.clientY - rect.top) / rect.height - 0.5;
        card.style.transform = 'perspective(900px) rotateY(' + (x * 8).toFixed(2) + 'deg) rotateX(' + (-y * 8).toFixed(2) + 'deg) translateY(-4px)';
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    });
  }

  // ---------- Datos dinámicos ----------
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Agenda publicada desde el panel (misma API que el sitio anterior).
  const agenda = document.querySelector('#agenda-eventos-list');
  if (agenda) {
    (async () => {
      try {
        const response = await fetch('/api/activities', { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok || !data.activities || !data.activities.length) {
          agenda.innerHTML = '<p>No hay eventos publicados en este momento. Vuelve pronto o síguenos en Instagram.</p>';
          return;
        }
        agenda.innerHTML = data.activities.map((event) => {
          const starts = Date.parse(event.starts_at);
          const closed = Number.isFinite(starts) && starts <= Date.now();
          const when = Number.isFinite(starts) ? new Date(starts).toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' }) : '';
          const media = event.media && event.media[0];
          return '<article data-reveal>' +
            (media ? '<img src="' + escapeHtml(media.url) + '" alt="' + escapeHtml(media.alt || event.title) + '" loading="lazy">' : '') +
            '<div><b>' + escapeHtml(event.title) + '</b>' +
            (event.description ? '<p>' + escapeHtml(event.description) + '</p>' : '') +
            '<p class="muted">' + escapeHtml([event.venue, when].filter(Boolean).join(' · ')) + '</p>' +
            (closed
              ? '<span class="btn btn-ink" aria-disabled="true">Inscripciones cerradas</span>'
              : '<a class="btn btn-accent" href="./cuenta.html">Inscribirme</a>') +
            '</div></article>';
        }).join('');
        agenda.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-in'));
      } catch {
        agenda.innerHTML = '<p>No se pudo cargar la agenda. Inténtalo de nuevo en unos minutos.</p>';
      }
    })();
  }

  // Universidades del catálogo editable por superadministración.
  const universities = document.querySelector('[data-universities]');
  if (universities) {
    (async () => {
      try {
        const response = await fetch('/api/catalogs/universities', { headers: { Accept: 'application/json' } });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.universities) || !data.universities.length) return;
        universities.innerHTML = data.universities.map((u) => '<li>' + escapeHtml(u.name) + '</li>').join('');
      } catch { /* se conserva la lista estática */ }
    })();
  }
})();
