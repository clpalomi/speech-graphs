const MAX_WORDS = 1000;
const MAX_RENDERS = 20;
const RENDER_COUNTER_KEY = "speechGraphRenderCount";

const exampleText = `Paste your text here`;

const textArea = document.querySelector("#speech-text");
const renderButton = document.querySelector("#render-button");
const clearButton = document.querySelector("#clear-button");
const loadExampleButton = document.querySelector("#load-example");
const graphEl = document.querySelector("#graph");
const metricsList = document.querySelector("#metrics-list");
const statusEl = document.querySelector("#status");
document.querySelector("#render-limit").textContent = String(MAX_RENDERS);

const metricLabels = [
  ["Entities", "entities"],
  ["Mentions", "mentions"],
  ["Edges", "edges"],
  ["Density", "density"],
  ["Global efficiency", "efficiency"],
  ["Transitivity", "transitivity"],
  ["Average clustering", "averageClustering"],
  ["Average path length", "averagePathLength"],
  ["Diameter", "diameter"],
  ["Mentions / word", "mentionsPerWord"],
];

function getRenderCount() {
  return Number(sessionStorage.getItem(RENDER_COUNTER_KEY) || 0);
}

function setRenderCount(value) {
  sessionStorage.setItem(RENDER_COUNTER_KEY, String(value));
  const remaining = Math.max(0, MAX_RENDERS - value);
  renderButton.disabled = remaining === 0;
  setStatus(`${remaining} render${remaining === 1 ? "" : "s"} remaining in this browser session.`);
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function countWords(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function getEntities(text) {
  const pattern = /\[(.*?)\](\d+)/g;
  return Array.from(text.matchAll(pattern), (match, position) => ({
    mention: match[1].trim() || `entity ${match[2]}`,
    id: Number(match[2]),
    position,
  }));
}

function buildGraph(entities) {
  const nodeMap = new Map();
  const edgeSet = new Set();

  for (const entity of entities) {
    if (!nodeMap.has(entity.id)) {
      nodeMap.set(entity.id, { id: entity.id, mentions: [], recurrence: 0 });
    }
    const node = nodeMap.get(entity.id);
    node.recurrence += 1;
    if (!node.mentions.includes(entity.mention)) node.mentions.push(entity.mention);
  }

  for (let index = 0; index < entities.length - 1; index += 1) {
    const source = entities[index].id;
    const target = entities[index + 1].id;
    edgeSet.add(`${source}->${target}`);
  }

  const nodes = Array.from(nodeMap.values()).sort((a, b) => a.id - b.id);
  const edges = Array.from(edgeSet, (key) => {
    const [source, target] = key.split("->").map(Number);
    return { source, target };
  });

  return { nodes, edges };
}

function adjacency(nodes, edges, directed = true) {
  const map = new Map(nodes.map((node, index) => [node.id, index]));
  const matrix = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(false));
  for (const edge of edges) {
    const source = map.get(edge.source);
    const target = map.get(edge.target);
    matrix[source][target] = true;
    if (!directed) matrix[target][source] = true;
  }
  return matrix;
}

function shortestPaths(matrix, start) {
  const distances = Array(matrix.length).fill(Infinity);
  const queue = [start];
  distances[start] = 0;

  while (queue.length) {
    const current = queue.shift();
    matrix[current].forEach((connected, next) => {
      if (connected && distances[next] === Infinity) {
        distances[next] = distances[current] + 1;
        queue.push(next);
      }
    });
  }
  return distances;
}

function calculateMetrics(graph, wordCount) {
  const { nodes, edges } = graph;
  const n = nodes.length;
  const directedPossibleEdges = n > 1 ? n * (n - 1) : 0;
  const nonLoopEdges = edges.filter((edge) => edge.source !== edge.target).length;
  const undirected = adjacency(nodes, edges, false);

  let reciprocalDistanceSum = 0;
  let reachablePairs = 0;
  let pathLengthSum = 0;
  let maxDistance = 0;

  for (let source = 0; source < n; source += 1) {
    const distances = shortestPaths(undirected, source);
    for (let target = source + 1; target < n; target += 1) {
      const distance = distances[target];
      if (distance !== Infinity) {
        reciprocalDistanceSum += 1 / distance;
        pathLengthSum += distance;
        reachablePairs += 1;
        maxDistance = Math.max(maxDistance, distance);
      }
    }
  }

  let triangles = 0;
  let connectedTriples = 0;
  let clusteringSum = 0;

  for (let i = 0; i < n; i += 1) {
    const neighbors = [];
    for (let j = 0; j < n; j += 1) {
      if (i !== j && undirected[i][j]) neighbors.push(j);
    }

    const degree = neighbors.length;
    connectedTriples += degree * (degree - 1) / 2;

    let neighborLinks = 0;
    for (let a = 0; a < neighbors.length; a += 1) {
      for (let b = a + 1; b < neighbors.length; b += 1) {
        if (undirected[neighbors[a]][neighbors[b]]) neighborLinks += 1;
      }
    }

    triangles += neighborLinks;
    clusteringSum += degree > 1 ? (2 * neighborLinks) / (degree * (degree - 1)) : 0;
  }

  const possiblePairs = n > 1 ? n * (n - 1) / 2 : 0;
  const mentions = nodes.reduce((sum, node) => sum + node.recurrence, 0);
  const isConnected = n <= 1 || reachablePairs === possiblePairs;

  return {
    entities: n,
    mentions,
    edges: edges.length,
    density: directedPossibleEdges ? nonLoopEdges / directedPossibleEdges : 0,
    efficiency: possiblePairs ? reciprocalDistanceSum / possiblePairs : 0,
    transitivity: connectedTriples ? triangles / connectedTriples : 0,
    averageClustering: n ? clusteringSum / n : 0,
    averagePathLength: isConnected && reachablePairs ? pathLengthSum / reachablePairs : "Disconnected",
    diameter: isConnected ? maxDistance : "Disconnected",
    mentionsPerWord: wordCount ? mentions / wordCount : 0,
  };
}

function formatMetric(value) {
  return typeof value === "number" ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : value;
}

function renderMetrics(metrics) {
  metricsList.innerHTML = metricLabels.map(([label, key]) => `
    <div><dt>${label}</dt><dd>${formatMetric(metrics[key])}</dd></div>
  `).join("");
}

function renderGraph({ nodes, edges }) {
  const width = 860;
  const height = 520;
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.34;
  const maxRecurrence = Math.max(...nodes.map((node) => node.recurrence), 1);
  const positions = new Map();

  nodes.forEach((node, index) => {
    const angle = nodes.length === 1 ? -Math.PI / 2 : (2 * Math.PI * index / nodes.length) - Math.PI / 2;
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  });

  graphEl.classList.remove("empty");
  graphEl.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Directed graph of annotated speech entities">
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--edge)"></path>
        </marker>
      </defs>
      <g class="edges">
        ${edges.map((edge) => renderEdge(edge, positions)).join("")}
      </g>
      <g class="nodes">
        ${nodes.map((node) => renderNode(node, positions.get(node.id), maxRecurrence)).join("")}
      </g>
    </svg>
  `;
}

function renderEdge(edge, positions) {
  const source = positions.get(edge.source);
  const target = positions.get(edge.target);

  if (edge.source === edge.target) {
    return `<path class="edge" d="M ${source.x - 8} ${source.y - 18} C ${source.x - 60} ${source.y - 70}, ${source.x + 60} ${source.y - 70}, ${source.x + 8} ${source.y - 18}" fill="none" stroke-width="2" marker-end="url(#arrow)"></path>`;
  }

  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const distance = Math.hypot(dx, dy) || 1;
  const offset = 28;
  const startX = source.x + (dx / distance) * offset;
  const startY = source.y + (dy / distance) * offset;
  const endX = target.x - (dx / distance) * offset;
  const endY = target.y - (dy / distance) * offset;
  const curve = 0.12;
  const midX = (startX + endX) / 2 - dy * curve;
  const midY = (startY + endY) / 2 + dx * curve;

  return `<path class="edge" d="M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}" fill="none" stroke-width="2" marker-end="url(#arrow)"></path>`;
}

function renderNode(node, position, maxRecurrence) {
  const r = 18 + (node.recurrence / maxRecurrence) * 14;
  const label = node.mentions[0].replace(/[<>&"]/g, "").slice(0, 28);
  return `
    <g class="node" transform="translate(${position.x} ${position.y})">
      <title>Entity ${node.id}: ${node.recurrence} mention(s). Example: ${label}</title>
      <circle r="${r}"></circle>
      <text>${node.id}</text>
      <text class="label">${node.recurrence}×</text>
    </g>
  `;
}

function validate(text) {
  const words = countWords(text);
  if (!text.trim()) return { ok: false, message: "Paste annotated speech before rendering." };
  if (words > MAX_WORDS) return { ok: false, message: `This text has ${words} words. Please keep it at ${MAX_WORDS} words or fewer.` };

  const entities = getEntities(text);
  if (entities.length < 2) return { ok: false, message: "Add at least two entity annotations such as [ich]1 [die Familie]3." };
  return { ok: true, words, entities };
}

function handleRender() {
  const count = getRenderCount();
  if (count >= MAX_RENDERS) {
    setStatus("Render limit reached for this browser session. Open a new session to continue.", true);
    renderButton.disabled = true;
    return;
  }

  const result = validate(textArea.value);
  if (!result.ok) {
    setStatus(result.message, true);
    return;
  }

  const graph = buildGraph(result.entities);
  renderGraph(graph);
  renderMetrics(calculateMetrics(graph, result.words));
  setRenderCount(count + 1);
}

loadExampleButton.addEventListener("click", () => {
  textArea.value = exampleText;
  setStatus("Example loaded. Click Render graph.");
});

clearButton.addEventListener("click", () => {
  textArea.value = "";
  graphEl.classList.add("empty");
  graphEl.innerHTML = "<p>Render a sample to see the speech graph.</p>";
  renderMetrics(Object.fromEntries(metricLabels.map(([, key]) => [key, "—"])));
  setStatus("Text cleared. No pasted text was saved.");
});

renderButton.addEventListener("click", handleRender);
setRenderCount(getRenderCount());
