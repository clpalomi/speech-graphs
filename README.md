# speech-graphs
Speech graphs visualization and metric calculation
# Speech Graphs

Speech Graphs is a minimalist, browser-only webpage for rendering entity-transition graphs from annotated speech. It is designed for quick inspection of discourse samples where entity mentions are marked in text with bracketed spans followed by an integer index.

## What the page does

- Parses annotations in the form `[mention]i`, for example `[ich]1` or `[ne Familie]3`.
- Ignores the natural language of the text and uses only the sequence of entity indexes.
- Creates one graph node for each entity index.
- Creates an unweighted directed edge for each consecutive pair of entity mentions.
- Sizes nodes by recurrence count.
- Calculates graph metrics in the browser.
- Keeps pasted text local to the page. Text is not sent to a backend and is not saved in browser storage.

## Quick start

Open `index.html` in a modern browser, paste annotated text, and click **Render graph**.

```text

```

## Annotation format

Use bracketed text followed immediately by a number:

```text
[entity mention]1 [another mention]2 [same first entity]1
```

The mention label inside brackets is used only as a human-readable example in the graph tooltip. The number is the entity identity. For the example above, the entity sequence is `1 → 2 → 1`.

## Limits and privacy

- Input is limited to **1000 words**.
- Rendering is limited to **20 renders per browser session**.
- The render counter is stored in `sessionStorage` as a number only.
- Pasted text is never written to `localStorage`, `sessionStorage`, cookies, or a server.

Because this is a static webpage, the render limit is a convenience limit for each browser session rather than a secure quota. If a stricter per-connection or per-user limit is required, add a small backend that accepts only derived graph data or performs parsing server-side without retaining text.

## Calculations

The browser implementation mirrors the previous Python workflow:

1. Extract mentions with a regular expression equivalent to `\[(.*?)\](\d+)`.
2. Count recurrence per entity index.
3. Build directed transitions from consecutive entity indexes.
4. Render unique directed edges without weights.
5. Calculate metrics using an undirected projection when required by the metric.

Metrics shown on the page:

- Entity count
- Mention count
- Unique directed edge count
- Directed density, excluding self-loops from the possible-edge denominator
- Global efficiency on the undirected projection
- Transitivity on the undirected projection
- Average clustering on the undirected projection
- Average shortest path length when the undirected graph is connected
- Diameter when the undirected graph is connected
- Mentions per word

## Why calculations run in the browser

For the current requirement, client-side calculation is the simplest and most private option:

- There is no server to store or log sensitive speech text.
- Rendering is immediate for small samples such as the 1000-word limit.
- The graph is reproducible from the pasted annotation sequence.

For larger corpora, collaborative use, or enforceable quotas, a backend would be better. A good production architecture would parse text in a short-lived request, immediately discard the text, return only nodes, edges, and metrics, and enforce rate limits by IP address or authenticated user.

## Project files

- `index.html` defines the page content, instructions, input form, graph container, and metrics panel.
- `styles.css` provides the elegant minimalist visual style.
- `script.js` parses annotations, enforces limits, computes metrics, and renders the SVG graph.
