export function faceHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>mcpu</title>
  <style>
    body { font: 15px/1.4 ui-sans-serif, system-ui; margin: 0; color: #111; }
    main { display: grid; grid-template-columns: 16rem 1fr; min-height: 100vh; }
    nav { border-right: 1px solid #ddd; padding: 1rem; }
    article { padding: 1rem; white-space: pre-wrap; font-family: ui-monospace, monospace; }
    button { display: block; width: 100%; text-align: left; background: none; border: 0; padding: 0.25rem 0; cursor: pointer; }
    button[aria-current="true"] { font-weight: 700; }
  </style>
</head>
<body>
  <main>
    <nav id="tree"></nav>
    <article id="file"></article>
  </main>
  <script>
    const tree = document.getElementById("tree");
    const file = document.getElementById("file");
    async function show(path) {
      const res = await fetch("/read?path=" + encodeURIComponent(path));
      const data = await res.json();
      file.textContent = data.contents ?? data.error ?? "";
      for (const btn of tree.querySelectorAll("button")) {
        btn.setAttribute("aria-current", btn.dataset.path === path ? "true" : "false");
      }
    }
    async function boot() {
      const res = await fetch("/ls");
      const data = await res.json();
      for (const path of data.files ?? []) {
        const btn = document.createElement("button");
        btn.textContent = path;
        btn.dataset.path = path;
        btn.addEventListener("click", () => show(path));
        tree.appendChild(btn);
      }
      if (data.files?.includes("README.md")) show("README.md");
    }
    boot();
  </script>
</body>
</html>
`;
}
