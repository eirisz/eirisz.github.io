// Boo, drawn as pixel art from the same grid as the portfolio's project icon.
const GHOST = [
  "....kkkk....",
  "..kkwwwwkk..",
  ".kwwwwwwwwk.",
  "kwwkwwwwkwwk",
  "kwwkwwwwkwwk",
  "kwwwwwwwwwwk",
  "kbbwwwwwwbbk",
  "kwwwwkkwwwwk",
  "kwwwwwwwwwwk",
  "kwwwwwwwwwwk",
  "kww.kww.kwwk",
  "kk...k...kk."
];
const COLORS = { k: "#0a0a0a", w: "#ffffff", b: "#ff6fb5" };
document.querySelectorAll("svg[data-sprite='ghost']").forEach((svg) => {
  svg.setAttribute("viewBox", `0 0 ${GHOST[0].length} ${GHOST.length}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.innerHTML = GHOST.flatMap((row, y) => [...row].map((ch, x) =>
    COLORS[ch] ? `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${COLORS[ch]}"/>` : ""
  )).join("");
});
