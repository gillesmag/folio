// Runs inside the reader web view. Mirrors the web app's client behaviour and talks to the
// app over the `folio` message handler. Native code calls the functions on `window.folio`.
(function () {
  const post = (type, payload) => {
    try {
      window.webkit.messageHandlers.folio.postMessage(Object.assign({ type: type }, payload || {}));
    } catch (e) {}
  };

  const article = document.querySelector('.folio-doc');
  if (!article) return;
  const blocks = () => article.querySelectorAll('[data-block-id]');

  // A tap on a block targets it for a comment; a tap anywhere else clears the target.
  document.addEventListener('click', (e) => {
    if (e.target.closest('a, input, button, summary, details, textarea')) return;
    const block = e.target.closest('[data-block-id]');
    post('blockTap', { blockId: block ? block.dataset.blockId : null });
  });

  let mermaidRun = 0;
  function renderMermaid(dark) {
    if (!window.mermaid) return;
    const nodes = article.querySelectorAll('pre.mermaid');
    if (!nodes.length) return;
    // SVG text labels only: no HTML (and so no images or anchors) can appear inside a node.
    mermaid.initialize({
      startOnLoad: false,
      theme: dark ? 'dark' : 'neutral',
      securityLevel: 'strict',
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
      dompurifyConfig: {
        FORBID_TAGS: ['img', 'a', 'video', 'audio', 'iframe', 'object', 'embed', 'form', 'input', 'style', 'svg', 'math'],
        ALLOW_DATA_ATTR: false
      }
    });
    const run = ++mermaidRun;
    (async () => {
      let i = 0;
      for (const node of nodes) {
        if (node.dataset.source === undefined) node.dataset.source = node.textContent || '';
        const source = node.dataset.source;
        try {
          const { svg } = await mermaid.render('folio-mermaid-' + run + '-' + i++, source);
          if (run !== mermaidRun) return;
          node.innerHTML = svg;
          node.classList.remove('mermaid-failed');
          node.removeAttribute('title');
        } catch (err) {
          node.textContent = source;
          node.classList.add('mermaid-failed');
          node.setAttribute('title', 'This diagram could not be rendered');
        }
      }
    })();
  }

  window.folio = {
    select(id) {
      for (const el of blocks()) el.classList.toggle('selected', id !== null && el.dataset.blockId === id);
    },
    setComments(map) {
      for (const el of blocks()) {
        const n = map[el.dataset.blockId];
        if (n) el.dataset.comments = String(n);
        else delete el.dataset.comments;
      }
    },
    scrollTo(id) {
      const el =
        article.querySelector('[data-block-id="' + CSS.escape(id) + '"]') || document.getElementById(id);
      if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
    setTheme(dark, tokens) {
      document.documentElement.classList.toggle('dark', dark);
      for (const key in tokens) article.style.setProperty(key, tokens[key]);
      renderMermaid(dark);
    },
    setFontSize(px) {
      document.documentElement.style.fontSize = px + 'px';
    }
  };

  // Which section is on screen, for the contents sheet.
  const headings = article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]');
  if (headings.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) post('heading', { id: visible[0].target.id });
      },
      { rootMargin: '-10% 0px -75% 0px', threshold: 0 }
    );
    headings.forEach((h) => observer.observe(h));
  }

  // Whether the document's own title is on screen; the bar shows it once it is not.
  const h1 = article.querySelector('h1');
  if (h1) {
    new IntersectionObserver((entries) => post('titleVisible', { visible: entries[0].isIntersecting }), {
      threshold: 0
    }).observe(h1);
  } else {
    post('titleVisible', { visible: false });
  }

  renderMermaid(document.documentElement.classList.contains('dark'));
  post('ready', { height: document.body.scrollHeight });
})();
