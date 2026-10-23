# LoG4Science website

Static site for the ELLIS UnConference 2026 session "Learning on Graphs for Scientific Discovery". No build step.

## Preview locally
```
python3 -m http.server 8000
```
Then open http://localhost:8000.

## Editing
- Content: `index.html` (sections: overview, program, speakers, cfp [Call for Posters], organizers).
- Styling and design tokens: `assets/css/style.css` (`:root` variables).
- Person card links: replace the `#TODO-<slug>` hrefs in `index.html` with real URLs.

## Photos instead of monograms
Put images in `images/people/` (e.g. `daza.jpg`) and in the person's card replace
`<span class="monogram t2">DD</span>` with `<img class="monogram" src="images/people/daza.jpg" alt="">`.

## Hero graph
`assets/js/graph.js` has a `CONFIG` object at the top; tune `messageSpeed` (px/s) and `waitTime` (ms, or `[min, max]`).

## Deploy
GitHub Pages serving the root of `main`.
