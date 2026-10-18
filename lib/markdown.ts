/** Tiny markdown → HTML for AI chat bubbles (sanitised). */
export function renderMarkdown(src: string): string {
  let html = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Fenced code blocks
  html = html.replace(/```([\s\S]*?)```/g, (_m, code) => `<pre><code>${code.replace(/^\n/, "")}</code></pre>`);
  // Inline code
  html = html.replace(/`([^`\n]+)`/g, (_m, c) => `<code>${c}</code>`);
  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  // Bold / italic
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
  // Lists
  html = html.replace(/(?:^|\n)((?:- .+(?:\n|$))+)/g, (_m, block) => {
    const items = block.trim().split("\n").map((l: string) => `<li>${l.replace(/^- /, "")}</li>`).join("");
    return `\n<ul>${items}</ul>`;
  });
  html = html.replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g, (_m, block) => {
    const items = block.trim().split("\n").map((l: string) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("");
    return `\n<ol>${items}</ol>`;
  });
  // Blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>");
  // Paragraphs
  html = html
    .split(/\n{2,}/)
    .map((p) => (p.startsWith("<") ? p : `<p>${p.replace(/\n/g, "<br/>")}</p>`))
    .join("\n");

  return html;
}
