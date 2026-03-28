import "./style.css";
// ===== SECTION 1: Types + global state + core helpers =====

type NodeType =
  | "SWITCH"
  | "BUTTON"
  | "POWER"
  | "OUTPUT"
  | "LED"
  | "SPEAKER"
  | "DISPLAY"
  | "CLOCK"
  | "BUFFER"
  | "KEY"
  | "AND"
  | "OR"
  | "NAND"
  | "NOR"
  | "XOR"
  | "NOT"
  | "IC";

interface NodeData {
  id: number;
  type: NodeType;
  x: number;
  y: number;
  value: boolean;
  rotation?: number;
  icDefId?: number;
  lightColor?: string;
  clockDelayMs?: number;
  bufferDelayMs?: number;
  keyChar?: string; // single char, e.g. "a"
  keyMode?: "toggle" | "hold" | "pulse";
  speakerFrequencyHz?: number;
  displayWidth?: number;
  displayHeight?: number;
}

type PortKind = "input" | "output";

interface Wire {
  id: number;
  fromNodeId: number;
  toNodeId: number;
  fromPortId: string;
  toPortId: string;
  isActive: boolean;
}

interface WireDragState {
  fromNodeId: number;
  fromPortId: string;
  startX: number;
  startY: number;
  pathEl: SVGPathElement;
  originPort: HTMLDivElement;
}

interface NoteData {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
}

interface ICDefinition {
  id: number;
  name: string;
  nodes: NodeData[];
  wires: {
    fromNodeId: number;
    toNodeId: number;
    fromPortId: string;
    toPortId: string;
  }[];
  inputNodeIds: number[];
  outputNodeIds: number[];
  ledNodeIds: number[];
}

const GRID_SIZE = 24;
const DEFAULT_LIGHT_COLOR = "#27ae60";
const DEFAULT_SPEAKER_FREQUENCY_HZ = 440;
const MIN_SPEAKER_FREQUENCY_HZ = 60;
const MAX_SPEAKER_FREQUENCY_HZ = 2000;
const DEFAULT_DISPLAY_WIDTH = 4;
const DEFAULT_DISPLAY_HEIGHT = 4;
const MIN_DISPLAY_SIDE = 1;
const DISPLAY_HEADER_HEIGHT = 24;
const DISPLAY_BODY_PADDING_X = 12;
const DISPLAY_BODY_PADDING_Y = 10;
const DISPLAY_PORT_SIZE = 10;
const DISPLAY_PORT_GAP = 4;
const DISPLAY_SCREEN_PIXEL_SIZE = 14;
const DISPLAY_SCREEN_PIXEL_GAP = 3;
const DISPLAY_SCREEN_FRAME = 12;
const DISPLAY_SECTION_GAP = 14;
const WORKSPACE_BASE_WIDTH = 3200;
const WORKSPACE_BASE_HEIGHT = 6200;
const MIN_WORKSPACE_ZOOM = 0.35;
const MAX_WORKSPACE_ZOOM = 2.5;

function snapCoord(v: number): number {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

let nextNodeId = 1;
let nextWireId = 1;
let nextICId = 1;
let nextNoteId = 1;

const nodes = new Map<number, NodeData>();
const wires: Wire[] = [];
const icDefinitions: ICDefinition[] = [];
const notes = new Map<number, NoteData>();
const nodeElements = new Map<number, HTMLDivElement>();
const portElements = new Map<string, HTMLDivElement>();
const wirePathElements = new Map<number, SVGPathElement>();

let dragState: WireDragState | null = null;
let hoveredDisplayPortId: string | null = null;

const selectedNodeIds = new Set<number>();
const selectedWireIds = new Set<number>();
const selectedNoteIds = new Set<number>();

let clipboardNodes: NodeData[] | null = null;
let clipboardNotes: NoteData[] | null = null;
let clipboardWires:
  | {
      fromNodeId: number;
      toNodeId: number;
      fromPortId: string;
      toPortId: string;
    }[]
  | null = null;
let lastPasteOffset = 0;

let contextMenuEl: HTMLDivElement | null = null;

let isMarquee = false;
let marqueeStart: { x: number; y: number } | null = null;
let marqueeRectEl: HTMLDivElement | null = null;

type Mode = "main" | "ic-edit";
let mode: Mode = "main";
let editingICId: number | null = null;
let icEditorBar: HTMLDivElement | null = null;
let mainNodesSnapshot: Map<number, NodeData> | null = null;
let mainWiresSnapshot: Wire[] | null = null;
let mainNotesSnapshot: Map<number, NoteData> | null = null;

let activePaletteDragNodeId: number | null = null;
let paletteDragPayload: { type?: NodeType; icId?: number } | null = null;

let icOutputValues = new Map<string, boolean>();

// dynamic behaviours
const clockTimers = new Map<number, number>();
const bufferLastInput = new Map<number, boolean>();
const bufferTimeouts = new Map<number, Set<number>>();
const speakerVoices = new Map<
  number,
  { oscillator: OscillatorNode; gain: GainNode }
>();

let audioContext: AudioContext | null = null;

// panning
let isPanning = false;
let panStart:
  | { x: number; y: number; scrollLeft: number; scrollTop: number }
  | null = null;

// preview mode
let previewMode = false;
let workspaceZoom = 1;
let deferWireRendering = false;
let wireGeometryDirty = true;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="cirkit-app">
    <aside class="sidebar">
      <h1 class="logo">CIRKIT</h1>
      <div class="palette">
        <!-- SOURCES -->
        <button class="palette-item" data-node-type="POWER">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">POWER</span></div>
            <div class="node-body"><div class="power-icon"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="SWITCH">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">SWITCH</span></div>
            <div class="node-body">
              <div class="switch-shell"><div class="switch-knob"></div></div>
            </div>
          </div>
        </button>
   <button class="palette-item" data-node-type="BUTTON">
  <div class="palette-node">
    <div class="node-header"><span class="node-title">BUTTON</span></div>
    <div class="node-body">
      <div class="switch-shell"><div class="switch-knob"></div></div>
    </div>
  </div>
</button>

        <button class="palette-item" data-node-type="KEY">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">KEY</span></div>
            <div class="node-body">
              <div class="keycap"></div>
            </div>
          </div>
        </button>

        <!-- OUTPUTS -->
        <button class="palette-item" data-node-type="OUTPUT">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">OUTPUT</span></div>
            <div class="node-body">
              <div class="output-lamp"><div class="output-core"></div></div>
            </div>
          </div>
        </button>
        <button class="palette-item" data-node-type="LED">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">LED</span></div>
            <div class="node-body">
              <div class="output-lamp"><div class="output-core"></div></div>
            </div>
          </div>
        </button>
        <button class="palette-item" data-node-type="SPEAKER">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">SPEAKER</span></div>
            <div class="node-body">
              <div class="speaker-icon">
                <div class="speaker-box"></div>
                <div class="speaker-cone"></div>
                <div class="speaker-wave speaker-wave-1"></div>
                <div class="speaker-wave speaker-wave-2"></div>
              </div>
            </div>
          </div>
        </button>
        <button class="palette-item" data-node-type="DISPLAY">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">DISPLAY</span></div>
            <div class="node-body">
              <div class="palette-display-icon">
                <div class="palette-display-pixel is-on"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel is-on"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel is-on"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel is-on"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel"></div>
                <div class="palette-display-pixel is-on"></div>
                <div class="palette-display-pixel"></div>
              </div>
            </div>
          </div>
        </button>

        <!-- TIMING -->
        <button class="palette-item" data-node-type="CLOCK">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">CLOCK</span></div>
            <div class="node-body"><div class="clock-icon"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="BUFFER">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">BUFFER</span></div>
            <div class="node-body"><div class="gate-shape gate-buffer"></div></div>
          </div>
        </button>

        <!-- LOGIC -->
        <button class="palette-item" data-node-type="AND">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">AND</span></div>
            <div class="node-body"><div class="gate-shape gate-and"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="OR">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">OR</span></div>
            <div class="node-body"><div class="gate-shape gate-or"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="NAND">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">NAND</span></div>
            <div class="node-body"><div class="gate-shape gate-nand"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="NOR">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">NOR</span></div>
            <div class="node-body"><div class="gate-shape gate-nor"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="XOR">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">XOR</span></div>
            <div class="node-body"><div class="gate-shape gate-xor"></div></div>
          </div>
        </button>
        <button class="palette-item" data-node-type="NOT">
          <div class="palette-node">
            <div class="node-header"><span class="node-title">NOT</span></div>
            <div class="node-body"><div class="gate-shape gate-not"></div></div>
          </div>
        </button>
        <!-- IC palette items appended here -->
      </div>
    </aside>
    <main class="workspace-wrapper">
      <div class="top-toolbar">
        <button class="preview-toggle" type="button" title="Run the circuit / enable key inputs">Simulate: OFF</button>
        <div class="toolbar-spacer"></div>
        <button class="tutorial-button" type="button" title="Open an interactive tutorial in a new tab">Open Tutorial</button>
        <button class="save-button" type="button" title="Download a .json save file to your computer">Download File</button>
        <button class="load-button" type="button" title="Import a .json save file from your computer">Import File</button>
      </div>

      <div id="workspace-zoom-shell" class="workspace-zoom-shell">
        <div id="workspace" class="workspace">
          <svg id="wire-layer" class="wire-layer"></svg>
        </div>
      </div>
    </main>
  </div>
`;

const workspaceWrapper =
  document.querySelector<HTMLDivElement>(".workspace-wrapper")!;
const workspaceZoomShell =
  document.querySelector<HTMLDivElement>("#workspace-zoom-shell")!;
const workspace = document.querySelector<HTMLDivElement>("#workspace")!;
const wireLayer = document.querySelector<SVGSVGElement>("#wire-layer")!;
const palette = document.querySelector<HTMLDivElement>(".palette")!;
const previewToggle =
  document.querySelector<HTMLButtonElement>(".preview-toggle")!;
const zoomResetButton =
  document.querySelector<HTMLButtonElement>(".zoom-reset");
const tutorialButton =
  document.querySelector<HTMLButtonElement>(".tutorial-button")!;
const saveButton = document.querySelector<HTMLButtonElement>(".save-button")!;
const loadButton = document.querySelector<HTMLButtonElement>(".load-button")!;

const transparentDragImage = (() => {
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  return img;
})();
const editingIndicator = document.createElement("div");
editingIndicator.className = "editing-indicator";
// minimal inline styling so it looks fine even without CSS changes
editingIndicator.style.marginLeft = "10px";
editingIndicator.style.fontSize = "12px";
editingIndicator.style.color = "#6b7280";
editingIndicator.style.userSelect = "none";
editingIndicator.textContent = ""; // hidden/blank by default

const unsavedWarning = document.createElement("div");
unsavedWarning.className = "unsaved-warning";
unsavedWarning.hidden = true;

// put it right after the simulate button
previewToggle.insertAdjacentElement("afterend", editingIndicator);
editingIndicator.insertAdjacentElement("afterend", unsavedWarning);

function setEditingLabel(title: string | null) {
  if (!title) {
    editingIndicator.textContent = "";
    return;
  }
  editingIndicator.textContent = `Editing: ${title}`;
}

let workspaceDirty = false;

function hasWorkspaceContent(): boolean {
  return (
    nodes.size > 0 ||
    wires.length > 0 ||
    notes.size > 0 ||
    icDefinitions.length > 0
  );
}

function updateUnsavedWarning() {
  const shouldShow = workspaceDirty && hasWorkspaceContent();
  unsavedWarning.hidden = !shouldShow;
  if (!shouldShow) {
    unsavedWarning.textContent = "";
    return;
  }

  unsavedWarning.textContent = currentUser
    ? "Changes you make may not be saved to your account."
    : "Changes you make may not be saved. Sign in or download a file.";
}

function markWorkspaceChanged() {
  workspaceDirty = true;
  updateUnsavedWarning();
}

function clearWorkspaceChanged() {
  workspaceDirty = false;
  updateUnsavedWarning();
}

function setPreviewMode(nextPreviewMode: boolean) {
  previewMode = nextPreviewMode;
  previewToggle.textContent = previewMode ? "Simulate: ON" : "Simulate: OFF";
}

function workspaceCoordsFromClientPoint(
  clientX: number,
  clientY: number
): { x: number; y: number } {
  const rect = workspace.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / workspaceZoom,
    y: (clientY - rect.top) / workspaceZoom,
  };
}

function workspaceCoordsFromClient(
  ev: MouseEvent | DragEvent
): { x: number; y: number } {
  return workspaceCoordsFromClientPoint(ev.clientX, ev.clientY);
}

function workspaceRectFromClientRect(rect: Pick<DOMRect, "left" | "top" | "width" | "height">) {
  const workspaceRect = workspace.getBoundingClientRect();
  return {
    x: (rect.left - workspaceRect.left) / workspaceZoom,
    y: (rect.top - workspaceRect.top) / workspaceZoom,
    width: rect.width / workspaceZoom,
    height: rect.height / workspaceZoom,
  };
}

function visibleWorkspaceCenter(): { x: number; y: number } {
  const wrapperRect = workspaceWrapper.getBoundingClientRect();
  return workspaceCoordsFromClientPoint(
    wrapperRect.left + wrapperRect.width / 2,
    wrapperRect.top + wrapperRect.height / 2
  );
}

function getNodeRotation(node: Pick<NodeData, "rotation">): number {
  const raw = node.rotation ?? 0;
  const normalized = ((Math.round(raw / 90) * 90) % 360 + 360) % 360;
  return normalized;
}

function getNodeLayoutSize(node: Pick<NodeData, "type" | "icDefId" | "displayWidth" | "displayHeight">): {
  w: number;
  h: number;
} {
  if (node.type === "IC") {
    const def = node.icDefId != null ? icDefinitions.find((d) => d.id === node.icDefId) : undefined;
    const inCount = def?.inputNodeIds.length ?? 0;
    const outCount = def?.outputNodeIds.length ?? 0;
    const ledCount = def?.ledNodeIds.length ?? 0;
    const rows = Math.max(inCount, outCount, ledCount, 1);
    const bodyHeight = Math.max(40, rows * 18 + 8);
    return { w: 140, h: 24 + bodyHeight };
  }
  if (node.type === "DISPLAY") {
    const layout = getDisplayLayout(node);
    return { w: layout.nodeWidth, h: layout.nodeHeight };
  }
  return { w: 120, h: 64 };
}

function updateZoomButtonLabel() {
  if (!zoomResetButton) return;
  zoomResetButton.textContent = `${Math.round(workspaceZoom * 100)}%`;
}

function applyWorkspaceZoom() {
  workspaceZoomShell.style.width = `${WORKSPACE_BASE_WIDTH * workspaceZoom}px`;
  workspaceZoomShell.style.height = `${WORKSPACE_BASE_HEIGHT * workspaceZoom}px`;
  workspace.style.transform = `scale(${workspaceZoom})`;
  updateZoomButtonLabel();
}

function setWorkspaceZoom(nextZoom: number, clientX?: number, clientY?: number) {
  const clamped = clamp(nextZoom, MIN_WORKSPACE_ZOOM, MAX_WORKSPACE_ZOOM);
  if (Math.abs(clamped - workspaceZoom) < 0.001) return;

  const wrapperRect = workspaceWrapper.getBoundingClientRect();
  const focusClientX = clientX ?? wrapperRect.left + wrapperRect.width / 2;
  const focusClientY = clientY ?? wrapperRect.top + wrapperRect.height / 2;
  const focus = workspaceCoordsFromClientPoint(focusClientX, focusClientY);

  workspaceZoom = clamped;
  applyWorkspaceZoom();

  const rectAfterZoom = workspace.getBoundingClientRect();
  workspaceWrapper.scrollLeft +=
    rectAfterZoom.left + focus.x * workspaceZoom - focusClientX;
  workspaceWrapper.scrollTop +=
    rectAfterZoom.top + focus.y * workspaceZoom - focusClientY;
}

function cacheNodeElement(nodeId: number, el: HTMLDivElement) {
  nodeElements.set(nodeId, el);
}

function uncacheNodeElement(nodeId: number) {
  const el =
    nodeElements.get(nodeId) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${nodeId}"]`) ??
    null;
  if (el) {
    el.querySelectorAll<HTMLDivElement>(".node-port").forEach((port) => {
      const portId = port.dataset.portId;
      if (portId) portElements.delete(portId);
    });
  }
  nodeElements.delete(nodeId);
}

function markWireGeometryDirty() {
  wireGeometryDirty = true;
}

function withDeferredWireRendering(fn: () => void) {
  const prev = deferWireRendering;
  deferWireRendering = true;
  try {
    fn();
  } finally {
    deferWireRendering = prev;
  }
  if (!deferWireRendering) {
    renderAllWires(true);
  }
}

function clearCachedWorkspaceDom() {
  nodeElements.clear();
  portElements.clear();
  wirePathElements.clear();
  wireLayer.querySelectorAll<SVGPathElement>(".wire-path").forEach((path) => path.remove());
  hoveredDisplayPortId = null;
  wireGeometryDirty = true;
}

function applyNodeTransform(el: HTMLDivElement, node: NodeData) {
  const rotation = getNodeRotation(node);
  el.style.setProperty("--node-rotation", `${rotation}deg`);
  el.style.transform = `translate(${node.x}px, ${node.y}px) rotate(${rotation}deg)`;
}

applyWorkspaceZoom();

function getSpeakerFrequency(node: Pick<NodeData, "speakerFrequencyHz">): number {
  const raw = node.speakerFrequencyHz ?? DEFAULT_SPEAKER_FREQUENCY_HZ;
  return clamp(Math.round(raw), MIN_SPEAKER_FREQUENCY_HZ, MAX_SPEAKER_FREQUENCY_HZ);
}

function getDisplaySize(
  node: Pick<NodeData, "displayWidth" | "displayHeight">
): { width: number; height: number } {
  const width = Math.max(
    MIN_DISPLAY_SIDE,
    Math.round(node.displayWidth ?? DEFAULT_DISPLAY_WIDTH)
  );
  const height = Math.max(
    MIN_DISPLAY_SIDE,
    Math.round(node.displayHeight ?? DEFAULT_DISPLAY_HEIGHT)
  );
  return { width, height };
}

interface DisplayLayout {
  width: number;
  height: number;
  pixelCount: number;
  inputGridWidth: number;
  inputGridHeight: number;
  screenWidth: number;
  screenHeight: number;
  contentWidth: number;
  contentHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  inputOffsetY: number;
  screenOffsetY: number;
}

function getDisplayLayout(node: Pick<NodeData, "displayWidth" | "displayHeight">): DisplayLayout {
  const { width, height } = getDisplaySize(node);
  const inputGridWidth = width * DISPLAY_PORT_SIZE + Math.max(0, width - 1) * DISPLAY_PORT_GAP;
  const inputGridHeight =
    height * DISPLAY_PORT_SIZE + Math.max(0, height - 1) * DISPLAY_PORT_GAP;
  const screenWidth =
    width * DISPLAY_SCREEN_PIXEL_SIZE +
    Math.max(0, width - 1) * DISPLAY_SCREEN_PIXEL_GAP +
    DISPLAY_SCREEN_FRAME;
  const screenHeight =
    height * DISPLAY_SCREEN_PIXEL_SIZE +
    Math.max(0, height - 1) * DISPLAY_SCREEN_PIXEL_GAP +
    DISPLAY_SCREEN_FRAME;
  const contentWidth = inputGridWidth + DISPLAY_SECTION_GAP + screenWidth;
  const contentHeight = Math.max(inputGridHeight, screenHeight);

  return {
    width,
    height,
    pixelCount: width * height,
    inputGridWidth,
    inputGridHeight,
    screenWidth,
    screenHeight,
    contentWidth,
    contentHeight,
    nodeWidth: Math.max(156, DISPLAY_BODY_PADDING_X * 2 + contentWidth),
    nodeHeight: DISPLAY_HEADER_HEIGHT + DISPLAY_BODY_PADDING_Y * 2 + contentHeight,
    inputOffsetY: (contentHeight - inputGridHeight) / 2,
    screenOffsetY: (contentHeight - screenHeight) / 2,
  };
}

function getDisplayPortId(nodeId: number, index: number): string {
  return `${nodeId}:in:${index}`;
}

function getDisplayPixelCoordinates(
  node: Pick<NodeData, "x" | "y" | "displayWidth" | "displayHeight">,
  index: number
): { x: number; y: number } {
  const layout = getDisplayLayout(node);
  const col = index % layout.width;
  const row = Math.floor(index / layout.width);
  return {
    x:
      node.x +
      DISPLAY_BODY_PADDING_X +
      col * (DISPLAY_PORT_SIZE + DISPLAY_PORT_GAP) +
      DISPLAY_PORT_SIZE / 2,
    y:
      node.y +
      DISPLAY_HEADER_HEIGHT +
      DISPLAY_BODY_PADDING_Y +
      layout.inputOffsetY +
      row * (DISPLAY_PORT_SIZE + DISPLAY_PORT_GAP) +
      DISPLAY_PORT_SIZE / 2,
  };
}

function ensureAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  const AudioContextCtor =
    window.AudioContext ??
    ((window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
      null);
  if (!AudioContextCtor) return null;
  audioContext = new AudioContextCtor();
  return audioContext;
}

function nudgeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  void ctx.resume().catch(() => {});
}

function stopSpeakerVoice(nodeId: number) {
  const voice = speakerVoices.get(nodeId);
  if (!voice) return;
  speakerVoices.delete(nodeId);
  try {
    voice.gain.gain.cancelScheduledValues(0);
    voice.gain.gain.setValueAtTime(0, voice.gain.context.currentTime);
    voice.oscillator.stop();
  } catch {}
  voice.oscillator.disconnect();
  voice.gain.disconnect();
}

function ensureSpeakerVoice(node: NodeData) {
  const existing = speakerVoices.get(node.id);
  if (existing) return existing;
  const ctx = ensureAudioContext();
  if (!ctx) return null;

  const oscillator = ctx.createOscillator();
  oscillator.type = "square";
  oscillator.frequency.setValueAtTime(getSpeakerFrequency(node), ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();

  const voice = { oscillator, gain };
  speakerVoices.set(node.id, voice);
  return voice;
}

function rerenderNode(node: NodeData) {
  const existing = nodeElements.get(node.id) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
  uncacheNodeElement(node.id);
  existing?.remove();
  markWireGeometryDirty();
  renderNode(node);
}

function pruneDisplayWires(node: NodeData) {
  if (node.type !== "DISPLAY") return;
  const maxInputs = getDisplayLayout(node).pixelCount;
  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    if (wire.toNodeId !== node.id) continue;
    const [, role, suffix] = wire.toPortId.split(":");
    const index = Number(suffix);
    const keep =
      role === "in" &&
      Number.isFinite(index) &&
      index >= 0 &&
      index < maxInputs;
    if (keep) continue;
    selectedWireIds.delete(wire.id);
    wires.splice(i, 1);
  }
}

function setDisplayPortHover(portId: string | null, hovered: boolean) {
  if (!portId) return;
  const port = portElements.get(portId) ?? findPortElementById(portId);
  if (!port) return;
  const nodeId = Number(port.dataset.nodeId);
  const pixelIndex = Number(port.dataset.pixelIndex ?? portId.split(":")[2] ?? "-1");
  if (!Number.isFinite(nodeId) || !Number.isFinite(pixelIndex) || pixelIndex < 0) return;

  const displayEl = nodeElements.get(nodeId) ?? workspace.querySelector<HTMLDivElement>(`[data-node-id="${nodeId}"]`);
  const pixelEl = displayEl?.querySelector<HTMLDivElement>(`.display-pixel[data-pixel-index="${pixelIndex}"]`) ?? null;
  port.classList.toggle("is-hovered", hovered);
  pixelEl?.classList.toggle("is-hovered", hovered);

  if (hovered) hoveredDisplayPortId = portId;
  else if (hoveredDisplayPortId === portId) hoveredDisplayPortId = null;
}

function initializeNodeDynamicBehavior(node: NodeData) {
  if (node.type === "CLOCK") {
    if (!node.clockDelayMs) node.clockDelayMs = 100;
    if (!clockTimers.has(node.id)) {
      const delay = node.clockDelayMs;
      const timer = window.setInterval(() => {
        node.value = !node.value;
        recomputeSignals();
      }, delay);
      clockTimers.set(node.id, timer);
    }
  } else if (node.type === "BUFFER") {
    if (!node.bufferDelayMs) node.bufferDelayMs = 100;
    if (!bufferLastInput.has(node.id)) {
      bufferLastInput.set(node.id, false);
    }
  }
}

function clearBufferTimeouts(nodeId: number) {
  const pending = bufferTimeouts.get(nodeId);
  if (!pending) return;
  pending.forEach((timeoutId) => clearTimeout(timeoutId));
  bufferTimeouts.delete(nodeId);
}

function teardownNodeDynamicBehavior(nodeId: number) {
  const t = clockTimers.get(nodeId);
  if (t != null) {
    clearInterval(t);
    clockTimers.delete(nodeId);
  }
  clearBufferTimeouts(nodeId);
  bufferLastInput.delete(nodeId);
  stopSpeakerVoice(nodeId);
}

function createNode(type: NodeType, x: number, y: number): NodeData {
  const node: NodeData = {
    id: nextNodeId++,
    type,
    x: snapCoord(x),
    y: snapCoord(y),
    value: false,
    rotation: 0,
  };

  if (type === "OUTPUT" || type === "LED") {
    node.lightColor = DEFAULT_LIGHT_COLOR;
  }
  if (type === "POWER") {
    node.value = true;
  }
  if (type === "CLOCK") {
    node.clockDelayMs = 100;
  }
  if (type === "BUFFER") {
    node.bufferDelayMs = 100;
  }
  if (type === "KEY") {
    node.keyChar = "a";
    node.keyMode = "toggle";
  }
  if (type === "SPEAKER") {
    node.speakerFrequencyHz = DEFAULT_SPEAKER_FREQUENCY_HZ;
  }
  if (type === "DISPLAY") {
    node.displayWidth = DEFAULT_DISPLAY_WIDTH;
    node.displayHeight = DEFAULT_DISPLAY_HEIGHT;
  }

  nodes.set(node.id, node);
  renderNode(node);
  initializeNodeDynamicBehavior(node);
  markWorkspaceChanged();
  return node;
}

function applyNoteLayout(note: NoteData, el: HTMLDivElement) {
  el.style.transform = `translate(${note.x}px, ${note.y}px)`;
  el.style.width = `${note.width}px`;
  el.style.height = `${note.height}px`;
}

function handleNoteSelection(noteId: number, ev: MouseEvent) {
  if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
    clearSelection();
  }
  if (selectedNoteIds.has(noteId)) {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      selectedNoteIds.delete(noteId);
    }
  } else {
    selectedNoteIds.add(noteId);
  }
  updateSelectionStyles();
}

function renderNote(note: NoteData) {
  let el = workspace.querySelector<HTMLDivElement>(`[data-note-id="${note.id}"]`);
  if (!el) {
    el = document.createElement("div");
    el.className = "workspace-note";
    el.dataset.noteId = String(note.id);
    el.innerHTML = `
      <textarea class="workspace-note-text" placeholder="Write here..."></textarea>
      <button class="workspace-note-resize" type="button" aria-label="Resize note"></button>
    `;

    const textarea = el.querySelector<HTMLTextAreaElement>(".workspace-note-text")!;
    textarea.value = note.text;
    textarea.addEventListener("input", () => {
      note.text = textarea.value;
      markWorkspaceChanged();
    });
    textarea.addEventListener("mousedown", (ev) => {
      if (previewMode) return;
      ev.stopPropagation();
      handleNoteSelection(note.id, ev);
    });

    const beginDrag = (ev: MouseEvent) => {
      if (previewMode || ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      if (target.closest(".workspace-note-text") || target.closest(".workspace-note-resize")) {
        return;
      }

      handleNoteSelection(note.id, ev);
      ev.preventDefault();
      ev.stopPropagation();

      const pos = workspaceCoordsFromClient(ev);
      const startX = pos.x;
      const startY = pos.y;
      const dragOrigins = new Map<number, { x: number; y: number }>();
      const movingIds =
        selectedNoteIds.size > 0 && selectedNoteIds.has(note.id)
          ? Array.from(selectedNoteIds)
          : [note.id];

      movingIds.forEach((id) => {
        const current = notes.get(id);
        if (current) dragOrigins.set(id, { x: current.x, y: current.y });
      });

      function onMove(moveEv: MouseEvent) {
        const movePos = workspaceCoordsFromClient(moveEv);
        const dx = movePos.x - startX;
        const dy = movePos.y - startY;

        dragOrigins.forEach((origin, id) => {
          const current = notes.get(id);
          if (!current) return;
          current.x = snapCoord(origin.x + dx);
          current.y = snapCoord(origin.y + dy);
          const currentEl = workspace.querySelector<HTMLDivElement>(`[data-note-id="${id}"]`);
          if (currentEl) applyNoteLayout(current, currentEl);
        });
        markWorkspaceChanged();
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    };

    el.addEventListener("mousedown", beginDrag);

    const resizeHandle = el.querySelector<HTMLButtonElement>(".workspace-note-resize")!;
    resizeHandle.addEventListener("mousedown", (ev) => {
      if (previewMode || ev.button !== 0) return;

      handleNoteSelection(note.id, ev);
      ev.preventDefault();
      ev.stopPropagation();

      const startX = ev.clientX;
      const startY = ev.clientY;
      const startWidth = note.width;
      const startHeight = note.height;

      function onMove(moveEv: MouseEvent) {
        note.width = Math.max(180, startWidth + (moveEv.clientX - startX));
        note.height = Math.max(110, startHeight + (moveEv.clientY - startY));
        applyNoteLayout(note, el!);
        markWorkspaceChanged();
      }

      function onUp() {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });

    workspace.appendChild(el);
  }

  applyNoteLayout(note, el);
  const textarea = el.querySelector<HTMLTextAreaElement>(".workspace-note-text");
  if (textarea && document.activeElement !== textarea && textarea.value !== note.text) {
    textarea.value = note.text;
  }
}

function createNote(
  x: number,
  y: number,
  text = "",
  width = 230,
  height = 150
): NoteData {
  const note: NoteData = {
    id: nextNoteId++,
    x: snapCoord(x),
    y: snapCoord(y),
    width,
    height,
    text,
  };
  notes.set(note.id, note);
  renderNote(note);
  markWorkspaceChanged();
  return note;
}

function createNoteAtClientPosition(clientX: number, clientY: number, text = "") {
  const pos = workspaceCoordsFromClientPoint(clientX, clientY);
  const note = createNote(
    pos.x,
    pos.y,
    text
  );
  clearSelection();
  selectedNoteIds.add(note.id);
  updateSelectionStyles();
  window.setTimeout(() => {
    const textarea = workspace.querySelector<HTMLTextAreaElement>(
      `[data-note-id="${note.id}"] .workspace-note-text`
    );
    textarea?.focus();
  }, 0);
  return note;
}
type InlineGateType = "BUFFER" | "NOT" | "AND" | "OR" | "NAND" | "NOR" | "XOR";
type GateSvgVariant = "workspace" | "palette";

interface GateSvgOptions {
  variant?: GateSvgVariant;
  inputAActive?: boolean;
  inputBActive?: boolean;
  outputActive?: boolean;
}

function isInlineGateType(type: NodeType): type is InlineGateType {
  return (
    type === "BUFFER" ||
    type === "NOT" ||
    type === "AND" ||
    type === "OR" ||
    type === "NAND" ||
    type === "NOR" ||
    type === "XOR"
  );
}

function gateSvgMarkup(type: InlineGateType, options: GateSvgOptions = {}): string {
  const variant = options.variant ?? "workspace";
  const inputLeadStart = variant === "palette" ? 6 : -16;
  const outputLeadEnd = variant === "palette" ? 58 : 80;
  const svgClass = `gate-svg gate-svg-${variant}`;
  const leadClass = (role: string, active: boolean) =>
    active ? `gate-lead ${role} gate-lead-active` : `gate-lead ${role}`;
  const lead = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    role: string,
    active = false
  ) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${leadClass(role, active)}" />`;
  const svgOpen =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 40" ` +
    `width="64" height="40" aria-hidden="true" class="${svgClass}" style="display:block;overflow:visible">`;
  const svgClose = `</svg>`;
  const inputA = lead(inputLeadStart, 11, 16, 11, "gate-lead-input-a", options.inputAActive);
  const inputB = lead(inputLeadStart, 29, 16, 29, "gate-lead-input-b", options.inputBActive);
  const singleInput = lead(inputLeadStart, 20, 16, 20, "gate-lead-input-a", options.inputAActive);

  if (type === "AND" || type === "NAND") {
    const body = `<path d="M16 6 H28 A14 14 0 0 1 28 34 H16 Z" class="gate-body" />`;
    const bubble =
      type === "NAND" ? `<circle cx="45" cy="20" r="2.9" class="gate-bubble" />` : "";
    const outStart = type === "NAND" ? 48 : 42;
    const output = lead(outStart, 20, outputLeadEnd, 20, "gate-lead-output", options.outputActive);
    return `${svgOpen}${inputA}${inputB}${body}${bubble}${output}${svgClose}`;
  }

  if (type === "OR" || type === "NOR" || type === "XOR") {
    const rearCurve =
      type === "XOR" ? `<path d="M8 6 C13 12, 13 28, 8 34" class="gate-body" />` : "";
    const body = `<path d="M12 6 C18 11, 18 29, 12 34 C24 34, 39 30.5, 50 20 C39 9.5, 24 6, 12 6" class="gate-body" />`;
    const bubble =
      type === "NOR" ? `<circle cx="50" cy="20" r="2.9" class="gate-bubble" />` : "";
    const outStart = type === "NOR" ? 53 : 49;
    const output = lead(outStart, 20, outputLeadEnd, 20, "gate-lead-output", options.outputActive);
    return `${svgOpen}${inputA}${inputB}${rearCurve}${body}${bubble}${output}${svgClose}`;
  }

  const triangle = `<path d="M16 8 L41 20 L16 32 Z" class="gate-body" />`;
  const bubble =
    type === "NOT" ? `<circle cx="44" cy="20" r="2.9" class="gate-bubble" />` : "";
  const outStart = type === "NOT" ? 47 : 41;
  const output = lead(outStart, 20, outputLeadEnd, 20, "gate-lead-output", options.outputActive);
  return `${svgOpen}${singleInput}${triangle}${bubble}${output}${svgClose}`;
}

function applyGateSvg(el: HTMLElement, type: InlineGateType, options: GateSvgOptions = {}) {
  const shape = el.querySelector<HTMLDivElement>(".gate-shape");
  if (!shape) return;

  // KEEP the gate-* class for sizing/layout
  const typeClass = `gate-${String(type).toLowerCase()}`;
  shape.className = `gate-shape gate-inline-svg ${typeClass}`;

  // Kill any CSS masks/background-icons that might be used by old gate styles
  shape.style.background = "none";
  (shape.style as any).backgroundImage = "none";
  (shape.style as any).webkitMaskImage = "none";
  (shape.style as any).maskImage = "none";
  shape.dataset.gateVariant = options.variant ?? "workspace";
  shape.innerHTML = gateSvgMarkup(type, options);
}



function forceTwoInputPortLayout(el: HTMLDivElement) {
  const a = el.querySelector<HTMLDivElement>(".node-port-input-a");
  const b = el.querySelector<HTMLDivElement>(".node-port-input-b");
  const out = el.querySelector<HTMLDivElement>(".node-port-output");
  if (a) a.style.top = "30%";
  if (b) b.style.top = "70%";
  if (out) out.style.top = "50%";
}

function renderNode(node: NodeData) {
  const cachedEl = nodeElements.get(node.id);
  let el =
    (cachedEl && cachedEl.isConnected ? cachedEl : null) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`) ??
    null;
  if (!el) {
    if (node.type === "IC") {
      el = document.createElement("div");
      el.className = "node node-ic";
      el.dataset.nodeId = String(node.id);

      const def = icDefinitions.find((d) => d.id === node.icDefId);
      const name = def?.name ?? "IC";
      const inCount = def?.inputNodeIds.length ?? 0;
      const outCount = def?.outputNodeIds.length ?? 0;
      const ledCount = def?.ledNodeIds.length ?? 0;
      const rows = Math.max(inCount, outCount, ledCount, 1);
      const bodyHeight = Math.max(40, rows * 18 + 8);

      el.innerHTML = `
        <div class="node-header ic-header">
          <span class="node-title ic-title">${name}</span>
        </div>
        <div class="node-body ic-body" style="height:${bodyHeight}px">
          <div class="ic-leds"></div>
        </div>
      `;
      const body = el.querySelector<HTMLDivElement>(".ic-body")!;
      const ledsContainer =
        body.querySelector<HTMLDivElement>(".ic-leds")!;

      if (def && ledCount > 0) {
        def.ledNodeIds.forEach((_id, idx) => {
          const ledEl = document.createElement("div");
          ledEl.className = "ic-led-indicator";
          ledEl.dataset.ledIndex = String(idx);
          ledsContainer.appendChild(ledEl);
        });
      }

      for (let i = 0; i < inCount; i++) {
        const port = document.createElement("div");
        port.className = "node-port node-port-input ic-port-input";
        port.dataset.icSide = "input";
        port.dataset.icIndex = String(i);
        port.dataset.portId = `${node.id}:in:${i}`;
        body.appendChild(port);
      }
      for (let i = 0; i < outCount; i++) {
        const port = document.createElement("div");
        port.className = "node-port node-port-output ic-port-output";
        port.dataset.icSide = "output";
        port.dataset.icIndex = String(i);
        port.dataset.portId = `${node.id}:out:${i}`;
        body.appendChild(port);
      }

      const inputPorts = Array.from(
        body.querySelectorAll<HTMLDivElement>(".ic-port-input")
      );
      const outputPorts = Array.from(
        body.querySelectorAll<HTMLDivElement>(".ic-port-output")
      );
      inputPorts.forEach((p, idx) => {
        const top = ((idx + 1) / (inputPorts.length + 1)) * 100;
        p.style.top = `${top}%`;
      });
      outputPorts.forEach((p, idx) => {
        const top = ((idx + 1) / (outputPorts.length + 1)) * 100;
        p.style.top = `${top}%`;
      });

      workspace.appendChild(el);
      cacheNodeElement(node.id, el);
      makeDraggableAndSelectable(el, node);
      setupPorts(el, node);
      if (def && def.ledNodeIds.length > 0) {
        applyICLedColors(node, def);
      }
    } else {
      el = document.createElement("div");
      el.dataset.nodeId = String(node.id);

      if (node.type === "SWITCH") {
        el.className = "node node-switch";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">SWITCH</span>
            <span class="node-port-label">Y</span>
          </div>
          <div class="node-body">
            <div class="switch-shell"><div class="switch-knob"></div></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "BUTTON") {
        el.className = "node node-button";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">BUTTON</span>
            <span class="node-port-label">Y</span>
          </div>
          <div class="node-body">
            <div class="switch-shell"><div class="switch-knob"></div></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "POWER") {
        el.className = "node node-power";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">POWER</span>
            <span class="node-port-label">Y</span>
          </div>
          <div class="node-body">
            <div class="power-icon"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "KEY") {
        el.className = "node node-key";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">KEY</span>
            <span class="node-port-label">Y</span>
          </div>
          <div class="node-body">
            <div class="keycap"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "OUTPUT") {
        el.className = "node node-output";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">OUTPUT</span>
            <span class="node-port-label">A</span>
          </div>
          <div class="node-body">
            <div class="output-lamp"><div class="output-core"></div></div>
            <div class="node-port node-port-input"></div>
          </div>
        `;
      } else if (node.type === "LED") {
        el.className = "node node-led";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">LED</span>
          </div>
          <div class="node-body">
            <div class="output-lamp"><div class="output-core"></div></div>
            <div class="node-port node-port-input"></div>
          </div>
        `;
      } else if (node.type === "SPEAKER") {
        el.className = "node node-speaker";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">SPEAKER</span>
            <span class="node-port-label">A</span>
          </div>
          <div class="node-body">
            <div class="speaker-icon">
              <div class="speaker-box"></div>
              <div class="speaker-cone"></div>
              <div class="speaker-wave speaker-wave-1"></div>
              <div class="speaker-wave speaker-wave-2"></div>
            </div>
            <div class="node-port node-port-input"></div>
          </div>
        `;
      } else if (node.type === "DISPLAY") {
        const layout = getDisplayLayout(node);
        el.className = "node node-display";
        el.style.width = `${layout.nodeWidth}px`;
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">DISPLAY</span>
            <span class="node-port-label">${layout.width}x${layout.height}</span>
          </div>
          <div class="node-body node-display-body">
            <div class="display-input-grid"></div>
            <div class="display-screen"></div>
          </div>
        `;

        const body = el.querySelector<HTMLDivElement>(".node-display-body")!;
        const inputGrid = body.querySelector<HTMLDivElement>(".display-input-grid")!;
        const screen = body.querySelector<HTMLDivElement>(".display-screen")!;

        body.style.height = `${layout.contentHeight + DISPLAY_BODY_PADDING_Y * 2}px`;

        inputGrid.style.width = `${layout.inputGridWidth}px`;
        inputGrid.style.height = `${layout.inputGridHeight}px`;
        inputGrid.style.top = `${DISPLAY_BODY_PADDING_Y + layout.inputOffsetY}px`;

        screen.style.width = `${layout.screenWidth}px`;
        screen.style.height = `${layout.screenHeight}px`;
        screen.style.left = `${DISPLAY_BODY_PADDING_X + layout.inputGridWidth + DISPLAY_SECTION_GAP}px`;
        screen.style.top = `${DISPLAY_BODY_PADDING_Y + layout.screenOffsetY}px`;
        screen.style.gridTemplateColumns = `repeat(${layout.width}, ${DISPLAY_SCREEN_PIXEL_SIZE}px)`;

        for (let index = 0; index < layout.pixelCount; index++) {
          const port = document.createElement("div");
          port.className = "node-port node-port-input display-port";
          port.dataset.portId = getDisplayPortId(node.id, index);
          port.dataset.pixelIndex = String(index);
          port.title = `Pixel ${index}`;
          const col = index % layout.width;
          const row = Math.floor(index / layout.width);
          port.style.left = `${col * (DISPLAY_PORT_SIZE + DISPLAY_PORT_GAP)}px`;
          port.style.top = `${row * (DISPLAY_PORT_SIZE + DISPLAY_PORT_GAP) + DISPLAY_PORT_SIZE / 2}px`;
          inputGrid.appendChild(port);

          const pixel = document.createElement("div");
          pixel.className = "display-pixel";
          pixel.dataset.pixelIndex = String(index);
          pixel.addEventListener("mouseenter", () => {
            setDisplayPortHover(getDisplayPortId(node.id, index), true);
          });
          pixel.addEventListener("mouseleave", () => {
            setDisplayPortHover(getDisplayPortId(node.id, index), false);
          });
          screen.appendChild(pixel);
        }
// ===== SECTION 2: Node DOM creation + workspace interactions =====
      } else if (node.type === "CLOCK") {
        el.className = "node node-clock";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">CLOCK</span>
            <button class="node-action-button node-delay-button" type="button">Delay</button>
          </div>
          <div class="node-body">
            <div class="clock-icon"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "BUFFER") {
        el.className = "node node-buffer";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">BUFFER</span>
            <button class="node-action-button node-delay-button" type="button">Delay</button>
          </div>
          <div class="node-body">
            <div class="gate-shape gate-buffer"></div>
            <div class="node-port node-port-input"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
        applyGateSvg(el, "BUFFER", { variant: "workspace" });

      } else if (
        node.type === "AND" ||
        node.type === "OR" ||
        node.type === "NAND" ||
        node.type === "NOR" ||
        node.type === "XOR"
      ) {
        const label = node.type;
        el.className = `node node-${label.toLowerCase()}`;
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">${label}</span>
          </div>
          <div class="node-body">
            <div class="gate-shape gate-${label.toLowerCase()}"></div>
            <div class="node-port node-port-input node-port-input-a"></div>
            <div class="node-port node-port-input node-port-input-b"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
        applyGateSvg(el, node.type, { variant: "workspace" });
        forceTwoInputPortLayout(el);
      
      } else if (node.type === "NOT") {
        el.className = "node node-not";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">NOT</span>
          </div>
          <div class="node-body">
            <div class="gate-shape gate-not"></div>
            <div class="node-port node-port-input"></div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
        applyGateSvg(el, "NOT", { variant: "workspace" });

      }

      workspace.appendChild(el);
      cacheNodeElement(node.id, el);
      makeDraggableAndSelectable(el, node);
      setupPorts(el, node);

      if (node.type === "SWITCH") setupSwitch(el, node);
      if (node.type === "BUTTON") setupButton(el, node);
      if (node.type === "CLOCK" || node.type === "BUFFER") setupDelayButton(el, node);
      if (node.type === "OUTPUT" || node.type === "LED") applyLightColor(node);
    }
  }

  applyNodeTransform(el, node);
  updateSelectionStyles();
  markWireGeometryDirty();
  if (!deferWireRendering) {
    renderAllWires(true);
  }
}

function makeDraggableAndSelectable(el: HTMLDivElement, node: NodeData) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  const dragOrigins = new Map<number, { x: number; y: number }>();

  el.addEventListener("mousedown", (ev) => {
    if (previewMode) return;

    const target = ev.target as HTMLElement;
    const alreadySelected = selectedNodeIds.has(node.id);

    if (ev.button === 0) {
      if (!alreadySelected || ev.shiftKey || ev.metaKey || ev.ctrlKey) {
        handleNodeSelection(node.id, ev);
      }
    }

    if (target.closest(".node-port") || target.closest(".switch-shell")) {
      return;
    }
    if (ev.button !== 0) return;

    dragging = true;
    const pos = workspaceCoordsFromClient(ev);
    startX = pos.x;
    startY = pos.y;

    const movingIds =
      selectedNodeIds.size > 0 && selectedNodeIds.has(node.id)
        ? Array.from(selectedNodeIds)
        : [node.id];

    dragOrigins.clear();
    movingIds.forEach((id) => {
      const n = nodes.get(id);
      if (n) dragOrigins.set(id, { x: n.x, y: n.y });
    });

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });

  function onMove(ev: MouseEvent) {
    if (!dragging) return;
    const pos = workspaceCoordsFromClient(ev);
    const dx = pos.x - startX;
    const dy = pos.y - startY;

    dragOrigins.forEach((origin, id) => {
      const n = nodes.get(id);
      if (!n) return;
      n.x = snapCoord(origin.x + dx);
      n.y = snapCoord(origin.y + dy);
      const nEl = workspace.querySelector<HTMLDivElement>(
        `[data-node-id="${id}"]`
      );
      if (nEl) {
        applyNodeTransform(nEl, n);
      }
    });

    markWorkspaceChanged();
    markWireGeometryDirty();
    renderAllWires(true);
  }

  function onUp() {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }
}

function setupSwitch(el: HTMLDivElement, node: NodeData) {
  const shell = el.querySelector<HTMLDivElement>(".switch-shell")!;
  function updateVisual() {
    shell.classList.toggle("is-on", node.value);
  }
  shell.addEventListener("click", () => {
    node.value = !node.value;
    updateVisual();
    recomputeSignals();
  });
  updateVisual();
}

function setupButton(el: HTMLDivElement, node: NodeData) {
  const shell = el.querySelector<HTMLDivElement>(".switch-shell")!;

  const press = () => {
    if (!node.value) {
      node.value = true;
      shell.classList.add("is-on");
      recomputeSignals();
    }
  };
  const release = () => {
    if (node.value) {
      node.value = false;
      shell.classList.remove("is-on");
      recomputeSignals();
    }
  };

  shell.addEventListener("mousedown", (ev) => {
    ev.preventDefault();
    press();
  });
  shell.addEventListener("mouseup", release);
  shell.addEventListener("mouseleave", release);

  shell.addEventListener("touchstart", (ev) => {
    ev.preventDefault();
    press();
  });
  shell.addEventListener("touchend", release);
  shell.addEventListener("touchcancel", release);
}

function setupPorts(el: HTMLDivElement, node: NodeData) {
  const ports = el.querySelectorAll<HTMLDivElement>(".node-port");
  ports.forEach((port, index) => {
    const isOutput = port.classList.contains("node-port-output");
    const kind: PortKind = isOutput ? "output" : "input";

    port.dataset.nodeId = String(node.id);
    port.dataset.portKind = kind;

    let portId = port.dataset.portId;
    if (!portId) {
      let suffix = String(index);
      if (port.classList.contains("node-port-input-a")) suffix = "a";
      else if (port.classList.contains("node-port-input-b")) suffix = "b";
      const role = isOutput ? "out" : "in";
      portId = `${node.id}:${role}:${suffix}`;
      port.dataset.portId = portId;
    }
    portElements.set(portId, port);

    if (node.type === "DISPLAY" && !isOutput) {
      port.addEventListener("mouseenter", () => setDisplayPortHover(portId, true));
      port.addEventListener("mouseleave", () => setDisplayPortHover(portId, false));
    }

    if (isOutput) {
      port.addEventListener("mousedown", (ev) => {
        if (previewMode) return;
        if (ev.button !== 0) return;
        ev.stopPropagation();
        beginWireDrag(node.id, port, ev);
      });
    }
  });
}

function beginWireDrag(
  fromNodeId: number,
  portEl: HTMLDivElement,
  _ev: MouseEvent
) {
  const fromPortId = portEl.dataset.portId;
  if (!fromPortId) return;

  const start = getPortCenter(portEl);
  const pathEl = createWirePath(true);

  portEl.classList.add("port-dragging");

  dragState = {
    fromNodeId,
    fromPortId,
    startX: start.x,
    startY: start.y,
    pathEl,
    originPort: portEl,
  };

  updateWirePath(pathEl, start.x, start.y, start.x, start.y);

  window.addEventListener("mousemove", onWireDragMove);
  window.addEventListener("mouseup", onWireDragEnd);
}

function resolveInputPortTarget(target: HTMLElement | null): HTMLDivElement | null {
  if (!target) return null;

  const inputPort = target.closest<HTMLDivElement>(".node-port-input");
  if (inputPort) return inputPort;

  const pixel = target.closest<HTMLDivElement>(".display-pixel");
  if (!pixel) return null;

  const pixelIndex = pixel.dataset.pixelIndex;
  const displayEl = pixel.closest<HTMLDivElement>(".node-display");
  if (!displayEl || pixelIndex == null) return null;

  return (
    displayEl.querySelector<HTMLDivElement>(
      `.display-port[data-pixel-index="${pixelIndex}"]`
    ) ?? null
  );
}

function onWireDragMove(ev: MouseEvent) {
  if (!dragState) return;
  const pos = workspaceCoordsFromClient(ev);
  updateWirePath(
    dragState.pathEl,
    dragState.startX,
    dragState.startY,
    pos.x,
    pos.y
  );

  const target = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
  const inputPort = resolveInputPortTarget(target);
  const hoveredPortId = inputPort?.dataset.portId ?? null;
  if (hoveredDisplayPortId && hoveredDisplayPortId !== hoveredPortId) {
    setDisplayPortHover(hoveredDisplayPortId, false);
  }
  if (hoveredPortId) {
    setDisplayPortHover(hoveredPortId, true);
  }
}

function onWireDragEnd(ev: MouseEvent) {
  if (!dragState) return;

  window.removeEventListener("mousemove", onWireDragMove);
  window.removeEventListener("mouseup", onWireDragEnd);

  dragState.originPort.classList.remove("port-dragging");
  if (hoveredDisplayPortId) {
    setDisplayPortHover(hoveredDisplayPortId, false);
  }

  const target = document.elementFromPoint(
    ev.clientX,
    ev.clientY
  ) as HTMLElement | null;
  const inputPort = resolveInputPortTarget(target);

  if (inputPort) {
    const toNodeId = Number(inputPort.dataset.nodeId);
    const toPortId = inputPort.dataset.portId;
    if (!toPortId) {
      dragState.pathEl.remove();
      dragState = null;
      renderAllWires();
      return;
    }

    for (let i = wires.length - 1; i >= 0; i--) {
      if (wires[i].toPortId === toPortId) {
        wires.splice(i, 1);
      }
    }

    const wire: Wire = {
      id: nextWireId++,
      fromNodeId: dragState.fromNodeId,
      toNodeId,
      fromPortId: dragState.fromPortId,
      toPortId,
      isActive: false,
    };
    wires.push(wire);
    dragState.pathEl.remove();
    dragState = null;
    markWireGeometryDirty();
    markWorkspaceChanged();
    recomputeSignals();
    return;
  }

  dragState.pathEl.remove();
  dragState = null;
  renderAllWires();
}

function getPortCenter(portEl: HTMLElement): { x: number; y: number } {
  const portRect = portEl.getBoundingClientRect();
  const workspaceRect = workspace.getBoundingClientRect();
  return {
    x: (portRect.left + portRect.width / 2 - workspaceRect.left) / workspaceZoom,
    y: (portRect.top + portRect.height / 2 - workspaceRect.top) / workspaceZoom,
  };
}

function createWirePath(preview: boolean): SVGPathElement {
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.classList.add("wire-path");
  if (preview) path.classList.add("wire-path-preview");
  else path.classList.add("wire-path-real");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  path.setAttribute("shape-rendering", "geometricPrecision");
  wireLayer.appendChild(path);
  return path;
}

function updateWirePath(
  pathEl: SVGPathElement,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(40, dx / 2);
  const cx1 = x1 + controlOffset;
  const cx2 = x2 - controlOffset;
  const d = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  pathEl.setAttribute("d", d);
}

function findPortElementById(portId: string): HTMLDivElement | null {
  const cached = portElements.get(portId);
  if (cached && cached.isConnected) return cached;
  if (cached && !cached.isConnected) portElements.delete(portId);
  const found = workspace.querySelector<HTMLDivElement>(
    `.node-port[data-port-id="${portId}"]`
  );
  if (found) portElements.set(portId, found);
  return found;
}

function renderAllWires(forceGeometry = false) {
  const shouldUpdateGeometry = forceGeometry || wireGeometryDirty;
  const liveWireIds = new Set<number>();

  wires.forEach((wire) => {
    let path = wirePathElements.get(wire.id);
    if (!path) {
      path = createWirePath(false);
      path.dataset.wireId = String(wire.id);
      path.addEventListener("mousedown", (ev) => {
        if (previewMode) return;
        if (ev.button !== 0) return;
        ev.stopPropagation();
        handleWireSelection(wire.id, ev);
      });
      wirePathElements.set(wire.id, path);
    }

    if (shouldUpdateGeometry) {
      const fromPort = findPortElementById(wire.fromPortId);
      const toPort = findPortElementById(wire.toPortId);
      if (fromPort && toPort) {
        const from = getPortCenter(fromPort);
        const to = getPortCenter(toPort);
        updateWirePath(path, from.x, from.y, to.x, to.y);
        path.style.display = "";
      } else {
        path.style.display = "none";
      }
    }

    path.classList.toggle("wire-path-active", wire.isActive);
    path.classList.toggle("wire-selected", selectedWireIds.has(wire.id));
    liveWireIds.add(wire.id);
  });

  Array.from(wirePathElements.entries()).forEach(([wireId, path]) => {
    if (liveWireIds.has(wireId)) return;
    path.remove();
    wirePathElements.delete(wireId);
  });

  wireGeometryDirty = false;
}

function updateGateVisuals() {
  const activeInputs = new Map<string, boolean>();
  wires.forEach((wire) => {
    activeInputs.set(wire.toPortId, wire.isActive);
  });

  const setLeadState = (shape: HTMLElement, selector: string, active: boolean) => {
    const lead = shape.querySelector<SVGElement>(selector);
    if (!lead) return;
    lead.classList.toggle("gate-lead-active", active);
  };

  nodes.forEach((node) => {
    if (!isInlineGateType(node.type)) return;

    const el = workspace.querySelector<HTMLElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    const shape = el.querySelector<HTMLElement>(".gate-shape");
    if (!shape) return;

    if (node.type === "BUFFER" || node.type === "NOT") {
      setLeadState(shape, ".gate-lead-input-a", activeInputs.get(`${node.id}:in:0`) ?? false);
      setLeadState(shape, ".gate-lead-output", node.value);
      return;
    }

    setLeadState(shape, ".gate-lead-input-a", activeInputs.get(`${node.id}:in:a`) ?? false);
    setLeadState(shape, ".gate-lead-input-b", activeInputs.get(`${node.id}:in:b`) ?? false);
    setLeadState(shape, ".gate-lead-output", node.value);
  });
}

interface ICResult {
  outputs: boolean[];
  ledStates: boolean[];
}

function simulateIC(
  def: ICDefinition,
  inputVals: boolean[],
  stack: number[] = []
): ICResult {
  if (stack.includes(def.id) || stack.length > 8) {
    return {
      outputs: new Array(def.outputNodeIds.length).fill(false),
      ledStates: new Array(def.ledNodeIds.length).fill(false),
    };
  }

  const localVals = new Map<number, boolean>();
  def.nodes.forEach((n) => localVals.set(n.id, n.value ?? false));

  def.nodes.forEach((n) => {
    if (n.type === "SWITCH") {
      const idx = def.inputNodeIds.indexOf(n.id);
      if (idx >= 0) localVals.set(n.id, !!inputVals[idx]);
    } else if (n.type === "POWER") {
      localVals.set(n.id, true);
    }
  });

  let nestedIcOutputValues = new Map<string, boolean>();

  const MAX_STEPS = Math.max(16, def.nodes.length * 4 + def.wires.length * 2);

  for (let step = 0; step < MAX_STEPS; step++) {
    let changed = false;
    const incTrue = new Map<number, number>();
    const incAny = new Map<number, boolean>();
    const icInputs = new Map<number, boolean[]>();

    def.nodes.forEach((n) => {
      incTrue.set(n.id, 0);
      incAny.set(n.id, false);
    });

    def.wires.forEach((w) => {
      const fromNode = def.nodes.find((n) => n.id === w.fromNodeId);
      if (!fromNode) return;

      let srcVal = false;
      if (fromNode.type === "IC") {
        srcVal = nestedIcOutputValues.get(w.fromPortId) ?? false;
      } else {
        srcVal = localVals.get(w.fromNodeId) ?? false;
      }
      if (!srcVal) return;

      const curCount = incTrue.get(w.toNodeId) ?? 0;
      incTrue.set(w.toNodeId, curCount + 1);
      incAny.set(w.toNodeId, true);

      const toNode = def.nodes.find((n) => n.id === w.toNodeId);
      if (toNode?.type === "IC") {
        const [, role, suffix] = w.toPortId.split(":");
        if (role === "in") {
          const nestedDef = icDefinitions.find((d) => d.id === toNode.icDefId);
          if (!nestedDef) return;
          const idx = Number(suffix);
          if (idx < 0 || idx >= nestedDef.inputNodeIds.length) return;
          let arr = icInputs.get(toNode.id);
          if (!arr) {
            arr = new Array(nestedDef.inputNodeIds.length).fill(false);
            icInputs.set(toNode.id, arr);
          }
          arr[idx] = true;
        }
      }
    });

    const nextNestedIcOutputValues = new Map<string, boolean>();

    def.nodes.forEach((n) => {
      let newVal = localVals.get(n.id) ?? false;

      switch (n.type) {
        case "SWITCH": {
          const idx = def.inputNodeIds.indexOf(n.id);
          newVal =
            idx >= 0 ? !!inputVals[idx] : localVals.get(n.id) ?? false;
          break;
        }
        case "BUTTON":
        case "KEY": {
          newVal = localVals.get(n.id) ?? false;
          break;
        }
        case "POWER": {
          newVal = true;
          break;
        }
        case "OUTPUT":
        case "LED": {
          newVal = incAny.get(n.id) ?? false;
          break;
        }
        case "SPEAKER":
        case "DISPLAY": {
          newVal = incAny.get(n.id) ?? false;
          break;
        }
// ===== SECTION 3: Signal evaluation + simulation / dynamic behaviors =====
        case "NOT": {
          const any = incAny.get(n.id) ?? false;
          newVal = !any;
          break;
        }
        case "AND":
        case "NAND":
        case "OR":
        case "NOR":
        case "XOR": {
          const count = incTrue.get(n.id) ?? 0;
          if (n.type === "AND") newVal = count === 2;
          else if (n.type === "NAND") newVal = !(count === 2);
          else if (n.type === "OR") newVal = count > 0;
          else if (n.type === "NOR") newVal = !(count > 0);
          else newVal = count === 1; // XOR
          break;
        }
        case "BUFFER": {
          const any = incAny.get(n.id) ?? false;
          newVal = any;
          break;
        }
        case "CLOCK": {
          newVal = localVals.get(n.id) ?? false;
          break;
        }
        case "IC": {
          const nestedDef = icDefinitions.find((d) => d.id === n.icDefId);
          if (!nestedDef) {
            newVal = false;
            break;
          }
          const inputArr =
            icInputs.get(n.id) ??
            new Array(nestedDef.inputNodeIds.length).fill(false);
          const result = simulateIC(nestedDef, inputArr, [...stack, def.id]);
          result.outputs.forEach((v, idx) => {
            const portId = `${n.id}:out:${idx}`;
            nextNestedIcOutputValues.set(portId, v);
          });
          newVal = result.outputs.some(Boolean);
          break;
        }
      }

      if (newVal !== (localVals.get(n.id) ?? false)) {
        localVals.set(n.id, newVal);
        changed = true;
      }
    });

    nestedIcOutputValues = nextNestedIcOutputValues;
    if (!changed) break;
  }

  const outputs = def.outputNodeIds.map((id) => localVals.get(id) ?? false);
  const ledStates = def.ledNodeIds.map((id) => localVals.get(id) ?? false);
  return { outputs, ledStates };
}

function recomputeSignals() {
  nodes.forEach((node) => {
    if (
      node.type !== "SWITCH" &&
      node.type !== "BUTTON" &&
      node.type !== "CLOCK" &&
      node.type !== "BUFFER" &&
      node.type !== "POWER" &&
      node.type !== "KEY"
    ) {
      node.value = false;
    }
  });
  wires.forEach((wire) => {
    wire.isActive = false;
  });
  icOutputValues = new Map<string, boolean>();

  const MAX_STEPS = Math.max(32, nodes.size * 4 + wires.length * 2);

  for (let step = 0; step < MAX_STEPS; step++) {
    let changed = false;

    const incomingTrueCount = new Map<number, number>();
    const incomingAnyTrue = new Map<number, boolean>();
    const icInputs = new Map<number, boolean[]>();

    nodes.forEach((node) => {
      incomingTrueCount.set(node.id, 0);
      incomingAnyTrue.set(node.id, false);
    });

    wires.forEach((wire) => {
      const from = nodes.get(wire.fromNodeId);
      if (!from) return;

      let srcVal = false;
      if (from.type === "IC") {
        srcVal = icOutputValues.get(wire.fromPortId) ?? false;
      } else {
        srcVal = from.value;
      }
      if (!srcVal) return;

      const toId = wire.toNodeId;
      incomingAnyTrue.set(toId, true);
      const cur = incomingTrueCount.get(toId) ?? 0;
      incomingTrueCount.set(toId, cur + 1);

      const toNode = nodes.get(toId);
      if (toNode?.type === "IC") {
        const [, role, suffix] = wire.toPortId.split(":");
        if (role === "in") {
          const def = icDefinitions.find((d) => d.id === toNode.icDefId);
          if (!def) return;
          const idx = Number(suffix);
          if (idx < 0 || idx >= def.inputNodeIds.length) return;
          let arr = icInputs.get(toId);
          if (!arr) {
            arr = new Array(def.inputNodeIds.length).fill(false);
            icInputs.set(toId, arr);
          }
          arr[idx] = true;
        }
      }
    });

    nodes.forEach((node) => {
      if (node.type !== "BUFFER") return;
      const inputVal = incomingAnyTrue.get(node.id) ?? false;
      const last = bufferLastInput.get(node.id) ?? false;
      if (inputVal === last) return;
      bufferLastInput.set(node.id, inputVal);
      const delay = node.bufferDelayMs ?? 100;
      let pending = bufferTimeouts.get(node.id);
      if (!pending) {
        pending = new Set<number>();
        bufferTimeouts.set(node.id, pending);
      }
      const tid = window.setTimeout(() => {
        node.value = inputVal;
        const current = bufferTimeouts.get(node.id);
        current?.delete(tid);
        if (current && current.size === 0) {
          bufferTimeouts.delete(node.id);
        }
        recomputeSignals();
      }, delay);
      pending.add(tid);
    });

    const nextIcOutputValues = new Map<string, boolean>();

    nodes.forEach((node) => {
      let newVal = node.value;

      switch (node.type) {
        case "SWITCH":
        case "BUTTON":
        case "CLOCK":
        case "BUFFER":
        case "KEY":
          newVal = node.value;
          break;
        case "POWER":
          newVal = true;
          break;
        case "OUTPUT":
        case "LED": {
          newVal = incomingAnyTrue.get(node.id) ?? false;
          break;
        }
        case "SPEAKER":
        case "DISPLAY": {
          newVal = incomingAnyTrue.get(node.id) ?? false;
          break;
        }
        case "NOT": {
          const any = incomingAnyTrue.get(node.id) ?? false;
          newVal = !any;
          break;
        }
        case "AND":
        case "NAND":
        case "OR":
        case "NOR":
        case "XOR": {
          const count = incomingTrueCount.get(node.id) ?? 0;
          if (node.type === "AND") newVal = count === 2;
          else if (node.type === "NAND") newVal = !(count === 2);
          else if (node.type === "OR") newVal = count > 0;
          else if (node.type === "NOR") newVal = !(count > 0);
          else newVal = count === 1;
          break;
        }
        case "IC": {
          const def = icDefinitions.find((d) => d.id === node.icDefId);
          if (!def) break;
          const inputArr =
            icInputs.get(node.id) ??
            new Array(def.inputNodeIds.length).fill(false);
          const result = simulateIC(def, inputArr, []);
          result.outputs.forEach((v, idx) => {
            const portId = `${node.id}:out:${idx}`;
            nextIcOutputValues.set(portId, v);
          });
          newVal = result.outputs.some(Boolean);
          break;
        }
      }

      if (newVal !== node.value) {
        node.value = newVal;
        changed = true;
      }
    });

    icOutputValues = nextIcOutputValues;

    if (!changed) break;
  }

  wires.forEach((wire) => {
    const from = nodes.get(wire.fromNodeId);
    if (!from) return;
    let srcVal = false;
    if (from.type === "IC") {
      srcVal = icOutputValues.get(wire.fromPortId) ?? false;
    } else {
      srcVal = from.value;
    }
    wire.isActive = srcVal;
  });

  updateOutputVisuals();
  updateLEDVisuals();
  updateSpeakerVisuals();
  updateDisplayVisuals();
  updateICLedVisuals();
  updateGateVisuals();
  renderAllWires();
}

function updateOutputVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "OUTPUT") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    const core = el.querySelector<HTMLDivElement>(".output-core");
    if (!core) return;
    const color = node.lightColor || DEFAULT_LIGHT_COLOR;
    if (node.value) {
      core.classList.add("is-on");
      core.style.backgroundColor = color;
      core.style.boxShadow = `0 0 0 1px ${color}, 0 0 12px ${color}`;
    } else {
      core.classList.remove("is-on");
      core.style.backgroundColor = "transparent";
      core.style.boxShadow = "none";
    }
  });
}

function updateLEDVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "LED") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    const core = el.querySelector<HTMLDivElement>(".output-core");
    if (!core) return;
    const color = node.lightColor || DEFAULT_LIGHT_COLOR;
    if (node.value) {
      core.classList.add("is-on");
      core.style.backgroundColor = color;
      core.style.boxShadow = `0 0 0 1px ${color}, 0 0 12px ${color}`;
    } else {
      core.classList.remove("is-on");
      core.style.backgroundColor = "transparent";
      core.style.boxShadow = "none";
    }
  });
}

function updateSpeakerVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "SPEAKER") return;

    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    const icon = el?.querySelector<HTMLDivElement>(".speaker-icon") ?? null;
    icon?.classList.toggle("is-on", node.value);

    const voice = node.value
      ? ensureSpeakerVoice(node)
      : (speakerVoices.get(node.id) ?? null);
    if (!voice) return;

    const ctx = voice.gain.context;
    const now = ctx.currentTime;
    voice.oscillator.frequency.setValueAtTime(getSpeakerFrequency(node), now);
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(node.value ? 0.045 : 0, now, 0.015);
  });

  Array.from(speakerVoices.keys()).forEach((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node || node.type !== "SPEAKER") {
      stopSpeakerVoice(nodeId);
    }
  });
}

function updateDisplayVisuals() {
  const activeInputs = new Set<string>();
  wires.forEach((wire) => {
    if (wire.isActive) activeInputs.add(wire.toPortId);
  });

  nodes.forEach((node) => {
    if (node.type !== "DISPLAY") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    el
      .querySelectorAll<HTMLDivElement>(".display-pixel")
      .forEach((pixelEl, index) => {
        pixelEl.classList.toggle("is-on", activeInputs.has(getDisplayPortId(node.id, index)));
      });
  });
}

function applyLightColor(node: NodeData) {
  if (node.type !== "OUTPUT" && node.type !== "LED") return;
  const el = workspace.querySelector<HTMLDivElement>(
    `[data-node-id="${node.id}"]`
  ) ?? nodeElements.get(node.id) ?? null;
  if (!el) return;
  const core = el.querySelector<HTMLDivElement>(".output-core");
  if (!core) return;
  const color = node.lightColor || DEFAULT_LIGHT_COLOR;
  if (node.value) {
    core.style.backgroundColor = color;
    core.style.boxShadow = `0 0 0 1px ${color}, 0 0 12px ${color}`;
  }
}

function applyICLedColors(node: NodeData, def: ICDefinition) {
  const icEl = workspace.querySelector<HTMLDivElement>(
    `[data-node-id="${node.id}"]`
  );
  if (!icEl) return;
  const leds = Array.from(
    icEl.querySelectorAll<HTMLDivElement>(".ic-led-indicator")
  );
  leds.forEach((ledEl, idx) => {
    const ledNodeId = def.ledNodeIds[idx];
    const ledNode = def.nodes.find((n) => n.id === ledNodeId);
    const color = ledNode?.lightColor || DEFAULT_LIGHT_COLOR;
    ledEl.style.borderColor = color;
  });
}

function updateICLedVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "IC") return;
    const def = icDefinitions.find((d) => d.id === node.icDefId);
    if (!def || def.ledNodeIds.length === 0) return;

    const inputArr = new Array(def.inputNodeIds.length).fill(false);

    wires.forEach((w) => {
      if (w.toNodeId !== node.id) return;
      const [, role, suffix] = w.toPortId.split(":");
      if (role !== "in") return;
      const idx = Number(suffix);
      if (idx < 0 || idx >= inputArr.length) return;
      const fromNode = nodes.get(w.fromNodeId);
      if (!fromNode) return;
      let srcVal = false;
      if (fromNode.type === "IC") {
        srcVal = icOutputValues.get(w.fromPortId) ?? false;
      } else {
        srcVal = fromNode.value;
      }
      if (srcVal) inputArr[idx] = true;
    });

    const result = simulateIC(def, inputArr, []);
    const ledStates = result.ledStates;

    const icEl = workspace.querySelector<HTMLDivElement>(
      `[data-node-id="${node.id}"]`
    );
    if (!icEl) return;
    const leds = Array.from(
      icEl.querySelectorAll<HTMLDivElement>(".ic-led-indicator")
    );
    leds.forEach((ledEl, idx) => {
      const on = !!ledStates[idx];
      const ledNodeId = def.ledNodeIds[idx];
      const ledNode = def.nodes.find((n) => n.id === ledNodeId);
      const color = ledNode?.lightColor || DEFAULT_LIGHT_COLOR;
      if (on) {
        ledEl.classList.add("is-on");
        ledEl.style.backgroundColor = color;
        ledEl.style.boxShadow = `0 0 0 1px ${color}, 0 0 10px ${color}`;
      } else {
        ledEl.classList.remove("is-on");
        ledEl.style.backgroundColor = "transparent";
        ledEl.style.boxShadow = "none";
      }
    });
  });
}

function clearSelection() {
  selectedNodeIds.clear();
  selectedWireIds.clear();
  selectedNoteIds.clear();
  updateSelectionStyles();
}

function handleNodeSelection(nodeId: number, ev: MouseEvent) {
  if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
    clearSelection();
  }
  if (selectedNodeIds.has(nodeId)) {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      selectedNodeIds.delete(nodeId);
    }
  } else {
    selectedNodeIds.add(nodeId);
  }
  updateSelectionStyles();
}

function handleWireSelection(wireId: number, ev: MouseEvent) {
  if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey) {
    clearSelection();
  }
  if (selectedWireIds.has(wireId)) {
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      selectedWireIds.delete(wireId);
    }
  } else {
    selectedWireIds.add(wireId);
  }
  updateSelectionStyles();
}

function updateSelectionStyles() {
  workspace
    .querySelectorAll<HTMLDivElement>(".node")
    .forEach((nodeEl) => nodeEl.classList.remove("node-selected"));
  workspace
    .querySelectorAll<HTMLDivElement>(".workspace-note")
    .forEach((noteEl) => noteEl.classList.remove("note-selected"));

  nodes.forEach((node) => {
    if (!selectedNodeIds.has(node.id)) return;
    const el = workspace.querySelector<HTMLDivElement>(
      `[data-node-id="${node.id}"]`
    );
    if (el) el.classList.add("node-selected");
  });

  notes.forEach((note) => {
    if (!selectedNoteIds.has(note.id)) return;
    const el = workspace.querySelector<HTMLDivElement>(
      `[data-note-id="${note.id}"]`
    );
    if (el) el.classList.add("note-selected");
  });

  wireLayer
    .querySelectorAll<SVGPathElement>(".wire-path-real")
    .forEach((p) => p.classList.remove("wire-selected"));

  wires.forEach((wire) => {
    if (!selectedWireIds.has(wire.id)) return;
    const path = wireLayer.querySelector<SVGPathElement>(
      `.wire-path-real[data-wire-id="${wire.id}"]`
    );
    if (path) path.classList.add("wire-selected");
  });
}

function getSelectionSnapshot(): {
  nodes: NodeData[];
  notes: NoteData[];
  wires: {
    fromNodeId: number;
    toNodeId: number;
    fromPortId: string;
    toPortId: string;
  }[];
} {
  const selNodes = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n)
    .map((n) => ({ ...n }));

  const selNotes = Array.from(selectedNoteIds)
    .map((id) => notes.get(id))
    .filter((note): note is NoteData => !!note)
    .map((note) => ({ ...note }));

  const selWires = wires
    .filter(
      (w) =>
        selectedNodeIds.has(w.fromNodeId) && selectedNodeIds.has(w.toNodeId)
    )
    .map((w) => ({
      fromNodeId: w.fromNodeId,
      toNodeId: w.toNodeId,
      fromPortId: w.fromPortId,
      toPortId: w.toPortId,
    }));

  return { nodes: selNodes, notes: selNotes, wires: selWires };
}

function hideContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

function uniqueICName(baseName: string): string {
  let name = baseName.trim() || "New IC";
  if (!icDefinitions.some((d) => d.name === name)) return name;
  let idx = 2;
  while (icDefinitions.some((d) => d.name === `${name}${idx}`)) idx++;
  return `${name}${idx}`;
}

async function createICFromSelection() {
  if (selectedNodeIds.size === 0) return;

  const rawName = await promptTextModal({
    title: "Create IC",
    label: "IC name",
    value: "New IC",
    hint: "Give the selected circuit a reusable name.",
    submitLabel: "Create",
    validate: (value) => (!value.trim() ? "Give the IC a name first." : null),
  });
  if (!rawName) return;
  const name = uniqueICName(rawName);

  const snap = getSelectionSnapshot();
  if (snap.nodes.length === 0) return;

  const minX = Math.min(...snap.nodes.map((n) => n.x));
  const minY = Math.min(...snap.nodes.map((n) => n.y));
  snap.nodes.forEach((n) => {
    n.x -= minX;
    n.y -= minY;
  });

  const inputs = snap.nodes
    .filter((n) => n.type === "SWITCH")
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);

  const outputs = snap.nodes
    .filter((n) => n.type === "OUTPUT")
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);

  const leds = snap.nodes
    .filter((n) => n.type === "LED")
    .slice()
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);

  const def: ICDefinition = {
    id: nextICId++,
    name,
    nodes: snap.nodes,
    wires: snap.wires,
    inputNodeIds: inputs,
    outputNodeIds: outputs,
    ledNodeIds: leds,
// ===== SECTION 4: Selection tools + LED color controls + keybinds =====
  };

  icDefinitions.push(def);
  addICPaletteButton(def);

  deleteSelection();
}

function setLightColorForSelection() {
  const lightNodes = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter(
      (n): n is NodeData =>
        !!n && (n.type === "OUTPUT" || n.type === "LED")
    );
  if (lightNodes.length === 0) return;

  const current = lightNodes[0].lightColor || DEFAULT_LIGHT_COLOR;

  const backdrop = document.createElement("div");
  backdrop.className = "light-dialog-backdrop";
  const dialog = document.createElement("div");
  dialog.className = "light-dialog";
  dialog.innerHTML = `
    <div class="light-dialog-title">LED Color</div>
    <div class="light-dialog-swatches"></div>
    <div class="light-dialog-custom">
      <label>Custom: <input type="text" class="light-dialog-input" value="${current}"></label>
    </div>
    <div class="light-dialog-buttons">
      <button type="button" class="light-dialog-ok">OK</button>
      <button type="button" class="light-dialog-cancel">Cancel</button>
    </div>
  `;
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);

  const swatches = dialog.querySelector<HTMLDivElement>(
    ".light-dialog-swatches"
  )!;
  const input = dialog.querySelector<HTMLInputElement>(
    ".light-dialog-input"
  )!;
  const okBtn = dialog.querySelector<HTMLButtonElement>(
    ".light-dialog-ok"
  )!;
  const cancelBtn = dialog.querySelector<HTMLButtonElement>(
    ".light-dialog-cancel"
  )!;

  const colors = [
    "#22c55e",
    "#ef4444",
    "#3b82f6",
    "#f97316",
    "#eab308",
    "#a855f7",
  ];

  colors.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "light-swatch";
    btn.style.backgroundColor = c;
    btn.addEventListener("click", () => {
      input.value = c;
    });
    swatches.appendChild(btn);
  });

  function applyAndClose() {
    const color = input.value.trim() || DEFAULT_LIGHT_COLOR;
    lightNodes.forEach((n) => {
      n.lightColor = color;
      applyLightColor(n);
    });
    updateOutputVisuals();
    updateLEDVisuals();
    updateICLedVisuals();
    markWorkspaceChanged();
    backdrop.remove();
  }

  okBtn.addEventListener("click", applyAndClose);
  cancelBtn.addEventListener("click", () => backdrop.remove());
}

function setDelayForSelection() {
  const nodesArr = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter(
      (n): n is NodeData =>
        !!n && (n.type === "CLOCK" || n.type === "BUFFER")
    );
  if (nodesArr.length === 0) return;

  void setDelayForNodes(nodesArr);
}

async function setDelayForNodes(nodesArr: NodeData[]) {
  if (nodesArr.length === 0) return;

  const first = nodesArr[0];
  const current =
    first.type === "CLOCK"
      ? first.clockDelayMs ?? 100
      : first.bufferDelayMs ?? 100;

  const val = await promptNumberModal({
    title: "Set Delay",
    label: "Delay",
    hint: "Longer delays make clocks slower and buffers respond later.",
    min: 20,
    max: 2000,
    step: 10,
    value: clamp(Math.round(current), 20, 2000),
    suffix: " ms",
    submitLabel: "Apply",
  });
  if (val == null) return;

  nodesArr.forEach((n) => {
    if (n.type === "CLOCK") {
      n.clockDelayMs = val;
      teardownNodeDynamicBehavior(n.id);
      initializeNodeDynamicBehavior(n);
    } else if (n.type === "BUFFER") {
      n.bufferDelayMs = val;
      clearBufferTimeouts(n.id);
    }
  });

  recomputeSignals();
  markWorkspaceChanged();
}

async function setSpeakerToneForSelection() {
  const speakers = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "SPEAKER");
  if (speakers.length === 0) return;

  const current = getSpeakerFrequency(speakers[0]);
  const next = await promptNumberModal({
    title: "Set Speaker Tone",
    label: "Frequency",
    hint: "Lower values sound deeper. Higher values sound sharper.",
    min: MIN_SPEAKER_FREQUENCY_HZ,
    max: MAX_SPEAKER_FREQUENCY_HZ,
    step: 10,
    value: current,
    suffix: " Hz",
    submitLabel: "Apply",
  });
  if (next == null) return;

  speakers.forEach((node) => {
    node.speakerFrequencyHz = next;
  });
  updateSpeakerVisuals();
  markWorkspaceChanged();
}

async function setDisplaySizeForNodes(displayNodes: NodeData[]) {
  if (displayNodes.length === 0) return;

  const current = getDisplaySize(displayNodes[0]);
  const parsed = await promptDisplaySizeModal(current);
  if (!parsed) return;

  displayNodes.forEach((node) => {
    node.displayWidth = parsed.width;
    node.displayHeight = parsed.height;
    pruneDisplayWires(node);
    rerenderNode(node);
  });

  recomputeSignals();
  markWorkspaceChanged();
}

function setDisplaySizeForSelection() {
  const displays = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "DISPLAY");
  if (displays.length === 0) return;
  void setDisplaySizeForNodes(displays);
}

function setupDelayButton(el: HTMLDivElement, node: NodeData) {
  const button = el.querySelector<HTMLButtonElement>(".node-delay-button");
  if (!button) return;

  button.addEventListener("mousedown", (ev) => {
    ev.stopPropagation();
  });

  button.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (previewMode) return;
    void setDelayForNodes([node]);
  });
}

async function configureKeyForSelection() {
  const keys = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "KEY");
  if (keys.length === 0) return;

  const configured = await promptKeyConfigModal({
    keyChar: keys[0].keyChar || "a",
    keyMode: keys[0].keyMode || "toggle",
  });
  if (!configured) return;

  keys.forEach((k) => {
    k.keyChar = configured.keyChar;
    k.keyMode = configured.keyMode;
  });
  markWorkspaceChanged();
}

function rotateSelectedNodesClockwise() {
  const selected = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((node): node is NodeData => !!node);
  if (selected.length === 0) return;

  const boxes = selected.map((node) => {
    const size = getNodeLayoutSize(node);
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    const visualRect = el ? workspaceRectFromClientRect(el.getBoundingClientRect()) : null;
    return {
      node,
      w: size.w,
      h: size.h,
      cx: node.x + size.w / 2,
      cy: node.y + size.h / 2,
      x1: visualRect?.x ?? node.x,
      y1: visualRect?.y ?? node.y,
      x2: visualRect ? visualRect.x + visualRect.width : node.x + size.w,
      y2: visualRect ? visualRect.y + visualRect.height : node.y + size.h,
    };
  });

  const centerX =
    (Math.min(...boxes.map((box) => box.x1)) + Math.max(...boxes.map((box) => box.x2))) / 2;
  const centerY =
    (Math.min(...boxes.map((box) => box.y1)) + Math.max(...boxes.map((box) => box.y2))) / 2;

  boxes.forEach(({ node, w, h, cx, cy }) => {
    const dx = cx - centerX;
    const dy = cy - centerY;
    const nextCenterX = centerX - dy;
    const nextCenterY = centerY + dx;
    node.x = snapCoord(nextCenterX - w / 2);
    node.y = snapCoord(nextCenterY - h / 2);
    node.rotation = (getNodeRotation(node) + 90) % 360;
    const el = nodeElements.get(node.id);
    if (el) applyNodeTransform(el, node);
  });

  markWireGeometryDirty();
  renderAllWires(true);
  markWorkspaceChanged();
}

function deleteSelection() {
  if (
    selectedNodeIds.size === 0 &&
    selectedWireIds.size === 0 &&
    selectedNoteIds.size === 0
  ) return;

  for (let i = wires.length - 1; i >= 0; i--) {
    const w = wires[i];
    if (
      selectedWireIds.has(w.id) ||
      selectedNodeIds.has(w.fromNodeId) ||
      selectedNodeIds.has(w.toNodeId)
    ) {
      wires.splice(i, 1);
    }
  }

  selectedNodeIds.forEach((id) => {
    const node = nodes.get(id);
    if (node) teardownNodeDynamicBehavior(node.id);
    nodes.delete(id);
    const el =
      nodeElements.get(id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${id}"]`);
    uncacheNodeElement(id);
    if (el) el.remove();
  });

  selectedNoteIds.forEach((id) => {
    notes.delete(id);
    const el = workspace.querySelector<HTMLDivElement>(
      `[data-note-id="${id}"]`
    );
    if (el) el.remove();
  });

  clearSelection();
  markWireGeometryDirty();
  recomputeSignals();
  markWorkspaceChanged();
}

function copySelection() {
  if (selectedNodeIds.size === 0 && selectedNoteIds.size === 0) return;
  const snap = getSelectionSnapshot();
  clipboardNodes = snap.nodes;
  clipboardNotes = snap.notes;
  clipboardWires = snap.wires;
  lastPasteOffset = 0;
}

function pasteSelection() {
  const hasNodes = !!clipboardNodes && clipboardNodes.length > 0;
  const hasNotes = !!clipboardNotes && clipboardNotes.length > 0;
  if (!hasNodes && !hasNotes) return;
  lastPasteOffset += 24;

  const idMap = new Map<number, number>();
  const newNodeIds: number[] = [];
  const newWireIds: number[] = [];
  const newNoteIds: number[] = [];

  (clipboardNodes || []).forEach((n) => {
    let newNode: NodeData;
    if (n.type === "IC" && n.icDefId != null) {
      const inst = instantiateIC(
        n.icDefId,
        n.x + lastPasteOffset,
        n.y + lastPasteOffset
      );
      if (!inst) return;
      newNode = inst;
    } else {
      newNode = createNode(
        n.type,
        n.x + lastPasteOffset,
        n.y + lastPasteOffset
      );
    }
    newNode.value = n.value;
    newNode.lightColor = n.lightColor;
    newNode.clockDelayMs = n.clockDelayMs;
    newNode.bufferDelayMs = n.bufferDelayMs;
    newNode.keyChar = n.keyChar;
    newNode.keyMode = n.keyMode;
    newNode.rotation = n.rotation ?? 0;
    newNode.speakerFrequencyHz = n.speakerFrequencyHz;
    newNode.displayWidth = n.displayWidth;
    newNode.displayHeight = n.displayHeight;
    if (newNode.type === "DISPLAY") {
      rerenderNode(newNode);
    }
    initializeNodeDynamicBehavior(newNode);
    idMap.set(n.id, newNode.id);
    newNodeIds.push(newNode.id);
  });

  if (clipboardWires) {
    clipboardWires.forEach((w) => {
      const newFromId = idMap.get(w.fromNodeId);
      const newToId = idMap.get(w.toNodeId);
      if (!newFromId || !newToId) return;

      const [, fromRole, fromSuffix] = w.fromPortId.split(":");
      const [, toRole, toSuffix] = w.toPortId.split(":");
      const fromPortId = `${newFromId}:${fromRole}:${fromSuffix}`;
      const toPortId = `${newToId}:${toRole}:${toSuffix}`;

      const wire: Wire = {
        id: nextWireId++,
        fromNodeId: newFromId,
        toNodeId: newToId,
        fromPortId,
        toPortId,
        isActive: false,
      };
      wires.push(wire);
      newWireIds.push(wire.id);
    });
  }

  if (newWireIds.length > 0) {
    markWireGeometryDirty();
  }

  (clipboardNotes || []).forEach((note) => {
    const cloned = createNote(
      note.x + lastPasteOffset,
      note.y + lastPasteOffset,
      note.text,
      note.width,
      note.height
    );
    newNoteIds.push(cloned.id);
  });

  recomputeSignals();

  selectedNodeIds.clear();
  selectedWireIds.clear();
  selectedNoteIds.clear();
  newNodeIds.forEach((id) => selectedNodeIds.add(id));
  newWireIds.forEach((id) => selectedWireIds.add(id));
  newNoteIds.forEach((id) => selectedNoteIds.add(id));
  updateSelectionStyles();
}

function showContextMenu(
  x: number,
  y: number,
  targetKind: "node" | "wire" | "note" | "blank"
) {
  hideContextMenu();

  contextMenuEl = document.createElement("div");
  contextMenuEl.className = "context-menu";

  const hasNode = selectedNodeIds.size > 0;
  const hasNote = selectedNoteIds.size > 0;
  const hasAny = hasNode || hasNote || selectedWireIds.size > 0;
  const canPaste =
    (!!clipboardNodes && clipboardNodes.length > 0) ||
    (!!clipboardNotes && clipboardNotes.length > 0);

  const hasLightNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && (n.type === "OUTPUT" || n.type === "LED");
  });

  const hasDelayNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && (n.type === "CLOCK" || n.type === "BUFFER");
  });

  const hasKeyNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "KEY";
  });

  const hasSpeakerNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "SPEAKER";
  });

  const hasDisplayNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "DISPLAY";
  });

  function addItem(label: string, handler: () => void, disabled?: boolean) {
    const item = document.createElement("button");
    item.className = "context-menu-item";
    item.textContent = label;
    if (disabled) {
      item.disabled = true;
    } else {
      item.addEventListener("click", () => {
        hideContextMenu();
        handler();
      });
    }
    contextMenuEl!.appendChild(item);
  }

  if (targetKind === "node") {
    addItem("Copy", () => copySelection(), !hasNode);
    addItem("Paste", () => pasteSelection(), !canPaste);
    addItem("Create IC", () => void createICFromSelection(), !hasNode);
    addItem(
      "Set LED Color…",
      () => setLightColorForSelection(),
      !hasLightNode
    );
    addItem("Configure Key…", () => void configureKeyForSelection(), !hasKeyNode);
    addItem(
      "Set Delay (ms)…",
      () => setDelayForSelection(),
      !hasDelayNode
    );
    addItem(
      "Set Speaker Tone…",
      () => void setSpeakerToneForSelection(),
      !hasSpeakerNode
    );
    addItem(
      "Set Display Size…",
      () => void setDisplaySizeForSelection(),
      !hasDisplayNode
    );
    addItem("Delete", () => deleteSelection(), !hasAny);
  } else if (targetKind === "note") {
    addItem("Copy", () => copySelection(), !hasNote);
    addItem("Paste", () => pasteSelection(), !canPaste);
    addItem("Delete", () => deleteSelection(), !hasNote);
  } else if (targetKind === "wire") {
    addItem("Delete", () => deleteSelection(), !selectedWireIds.size);
  } else {
    addItem("Create Note", () => createNoteAtClientPosition(x, y));
    addItem("Create IC", () => void createICFromSelection(), !hasNode);
    addItem("Paste", () => pasteSelection(), !canPaste);
  }

  contextMenuEl.style.left = `${x}px`;
  contextMenuEl.style.top = `${y}px`;
  document.body.appendChild(contextMenuEl);
}

function addICPaletteButton(def: ICDefinition) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "palette-item palette-item-ic";
  
  btn.dataset.icId = String(def.id);
  btn.innerHTML = `
    <div class="palette-node palette-ic-node">
      <div class="node-header">
        <span class="node-title">${def.name}</span>
      </div>
      <div class="node-body">
        <div class="ic-mini-io">
          <div class="ic-mini-inputs"></div>
          <div class="ic-mini-outputs"></div>
        </div>
        <button class="ic-edit-button" type="button">EDIT</button>
      </div>
    </div>
  `;
  palette.appendChild(btn);

  const inContainer = btn.querySelector<HTMLDivElement>(".ic-mini-inputs")!;
  const outContainer = btn.querySelector<HTMLDivElement>(".ic-mini-outputs")!;
  inContainer.innerHTML = "";
  outContainer.innerHTML = "";
  def.inputNodeIds.forEach(() => {
    const dot = document.createElement("div");
    dot.className = "ic-mini-dot";
    inContainer.appendChild(dot);
  });
  def.outputNodeIds.forEach(() => {
    const dot = document.createElement("div");
    dot.className = "ic-mini-dot";
    outContainer.appendChild(dot);
  });

  const coreBtn = btn.querySelector<HTMLDivElement>(".palette-ic-node")!;
  coreBtn.addEventListener("click", () => {
    if (previewMode) return;
    const center = visibleWorkspaceCenter();
    instantiateIC(def.id, center.x, center.y);
  });

  (btn as unknown as HTMLElement).draggable = true;
  btn.addEventListener("dragstart", (ev) => {
    if (previewMode) return;
    paletteDragPayload = { icId: def.id };
    if (ev.dataTransfer) {
      ev.dataTransfer.setData("text/plain", "IC");
      ev.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }
  });

  const editBtn = btn.querySelector<HTMLButtonElement>(".ic-edit-button")!;
  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (previewMode) return;
    enterICEdit(def.id);
  });
}

function refreshICPalette(def: ICDefinition) {
  const btn = palette.querySelector<HTMLDivElement>(
    `.palette-item-ic[data-ic-id="${def.id}"]`
  );
  if (!btn) return;
  btn.remove();
  addICPaletteButton(def);
}

function instantiateIC(
  icId: number,
  baseX: number,
  baseY: number
): NodeData | null {
  const def = icDefinitions.find((d) => d.id === icId);
  if (!def) return null;

  const node: NodeData = {
    id: nextNodeId++,
    type: "IC",
    x: snapCoord(baseX),
    y: snapCoord(baseY),
    value: false,
    rotation: 0,
    icDefId: def.id,
  };
  nodes.set(node.id, node);
  renderNode(node);

  clearSelection();
  selectedNodeIds.add(node.id);
  updateSelectionStyles();
  markWorkspaceChanged();

  return node;
}

function enterICEdit(defId: number) {
  if (mode === "ic-edit") return;
  const def = icDefinitions.find((d) => d.id === defId);
  if (!def) return;

  mode = "ic-edit";
  editingICId = defId;

  mainNodesSnapshot = new Map(
    Array.from(nodes.entries()).map(([id, n]) => [id, { ...n }])
  );
  mainWiresSnapshot = wires.map((w) => ({ ...w }));
  mainNotesSnapshot = new Map(
    Array.from(notes.entries()).map(([id, note]) => [id, { ...note }])
  );
  nodes.forEach((n) => teardownNodeDynamicBehavior(n.id));

  workspace.querySelectorAll<HTMLDivElement>(".node").forEach((el) => el.remove());
  workspace.querySelectorAll<HTMLDivElement>(".workspace-note").forEach((el) => el.remove());
  clearCachedWorkspaceDom();
  wires.length = 0;
  nodes.clear();
  notes.clear();
  selectedNodeIds.clear();
  selectedWireIds.clear();
  selectedNoteIds.clear();
  hideContextMenu();

  def.nodes.forEach((n) => {
    const clone: NodeData = { ...n };
    nodes.set(clone.id, clone);
  });
  def.wires.forEach((w) => {
    wires.push({
      id: nextWireId++,
      fromNodeId: w.fromNodeId,
      toNodeId: w.toNodeId,
      fromPortId: w.fromPortId,
      toPortId: w.toPortId,
      isActive: false,
    });
  });

  withDeferredWireRendering(() => {
    nodes.forEach((n) => {
      renderNode(n);
      initializeNodeDynamicBehavior(n);
    });
  });
  recomputeSignals();

  icEditorBar = document.createElement("div");
  icEditorBar.className = "ic-editor-bar";
  icEditorBar.innerHTML = `
    <span>Editing IC: <strong>${def.name}</strong></span>
    <button type="button" class="ic-editor-done">Done</button>
  `;
  workspaceWrapper.appendChild(icEditorBar);
  icEditorBar
    .querySelector<HTMLButtonElement>(".ic-editor-done")!
    .addEventListener("click", exitICEdit);
}

function exitICEdit() {
  if (mode !== "ic-edit" || editingICId == null) return;
  const def = icDefinitions.find((d) => d.id === editingICId);
  if (!def || !mainNodesSnapshot || !mainWiresSnapshot || !mainNotesSnapshot) {
    mode = "main";
    editingICId = null;
    return;
  }

  const editedNodes = Array.from(nodes.values()).map((n) => ({ ...n }));
  if (editedNodes.length > 0) {
    const minX = Math.min(...editedNodes.map((n) => n.x));
    const minY = Math.min(...editedNodes.map((n) => n.y));
    editedNodes.forEach((n) => {
      n.x -= minX;
      n.y -= minY;
    });
  }

  def.nodes = editedNodes;
  def.wires = wires.map((w) => ({
    fromNodeId: w.fromNodeId,
    toNodeId: w.toNodeId,
    fromPortId: w.fromPortId,
    toPortId: w.toPortId,
  }));
  def.inputNodeIds = def.nodes
    .filter((n) => n.type === "SWITCH")
// ===== SECTION 5: IC editor mode + IC definitions + IC palette refresh =====
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);
  def.outputNodeIds = def.nodes
    .filter((n) => n.type === "OUTPUT")
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);
  def.ledNodeIds = def.nodes
    .filter((n) => n.type === "LED")
    .sort((a, b) => a.y - b.y)
    .map((n) => n.id);

  refreshICPalette(def);

  workspace.querySelectorAll<HTMLDivElement>(".node").forEach((el) => el.remove());
  workspace.querySelectorAll<HTMLDivElement>(".workspace-note").forEach((el) => el.remove());
  clearCachedWorkspaceDom();
  nodes.forEach((n) => teardownNodeDynamicBehavior(n.id));
  nodes.clear();
  notes.clear();
  mainNodesSnapshot.forEach((n, id) => {
    nodes.set(id, { ...n });
  });
  mainNotesSnapshot.forEach((note, id) => {
    notes.set(id, { ...note });
  });
  wires.length = 0;
  mainWiresSnapshot.forEach((w) => wires.push({ ...w }));
  selectedNodeIds.clear();
  selectedWireIds.clear();
  selectedNoteIds.clear();

  withDeferredWireRendering(() => {
    nodes.forEach((n) => {
      renderNode(n);
      initializeNodeDynamicBehavior(n);
    });
  });
  notes.forEach((note) => renderNote(note));
  recomputeSignals();

  if (icEditorBar) {
    icEditorBar.remove();
    icEditorBar = null;
  }

  mode = "main";
  editingICId = null;
  mainNodesSnapshot = null;
  mainWiresSnapshot = null;
  mainNotesSnapshot = null;
}

function startMarquee(ev: MouseEvent) {
  if (previewMode) return;
  isMarquee = true;
  marqueeStart = workspaceCoordsFromClient(ev);

  marqueeRectEl = document.createElement("div");
  marqueeRectEl.className = "marquee-rect";
  workspace.appendChild(marqueeRectEl);
}

function updateMarquee(ev: MouseEvent) {
  if (!isMarquee || !marqueeStart || !marqueeRectEl) return;
  const pos = workspaceCoordsFromClient(ev);
  const x1 = Math.min(marqueeStart.x, pos.x);
  const y1 = Math.min(marqueeStart.y, pos.y);
  const x2 = Math.max(marqueeStart.x, pos.x);
  const y2 = Math.max(marqueeStart.y, pos.y);

  marqueeRectEl.style.left = `${x1}px`;
  marqueeRectEl.style.top = `${y1}px`;
  marqueeRectEl.style.width = `${x2 - x1}px`;
  marqueeRectEl.style.height = `${y2 - y1}px`;
}
const marqueeBezierPoint = (
  t: number,
  x0: number, y0: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number
): { x: number; y: number } => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  const x = uuu * x0 + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * x3;
  const y = uuu * y0 + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * y3;
  return { x, y };
};


function pointInRect(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  return px >= x1 && px <= x2 && py >= y1 && py <= y2;
}

function segmentsIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  function orient(px: number, py: number, qx: number, qy: number, rx: number, ry: number) {
    return (qy - py) * (rx - qx) - (qx - px) * (ry - qy);
  }
  function onSeg(px: number, py: number, qx: number, qy: number, rx: number, ry: number) {
    return Math.min(px, rx) <= qx && qx <= Math.max(px, rx) && Math.min(py, ry) <= qy && qy <= Math.max(py, ry);
  }

  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if (o1 === 0 && onSeg(ax, ay, cx, cy, bx, by)) return true;
  if (o2 === 0 && onSeg(ax, ay, dx, dy, bx, by)) return true;
  if (o3 === 0 && onSeg(cx, cy, ax, ay, dx, dy)) return true;
  if (o4 === 0 && onSeg(cx, cy, bx, by, dx, dy)) return true;

  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
}

function segmentIntersectsRect(ax: number, ay: number, bx: number, by: number, x1: number, y1: number, x2: number, y2: number) {
  if (pointInRect(ax, ay, x1, y1, x2, y2) || pointInRect(bx, by, x1, y1, x2, y2)) return true;

  // rect edges
  const r1x = x1, r1y = y1, r2x = x2, r2y = y1;
  const r3x = x2, r3y = y2, r4x = x1, r4y = y2;

  if (segmentsIntersect(ax, ay, bx, by, r1x, r1y, r2x, r2y)) return true;
  if (segmentsIntersect(ax, ay, bx, by, r2x, r2y, r3x, r3y)) return true;
  if (segmentsIntersect(ax, ay, bx, by, r3x, r3y, r4x, r4y)) return true;
  if (segmentsIntersect(ax, ay, bx, by, r4x, r4y, r1x, r1y)) return true;

  return false;
}

function wireIntersectsMarquee(from: { x: number; y: number }, to: { x: number; y: number }, x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(to.x - from.x);
  const controlOffset = Math.max(40, dx / 2);
  const cx1 = from.x + controlOffset;
  const cx2 = to.x - controlOffset;

  const STEPS = 18;
  let prev = marqueeBezierPoint(0, from.x, from.y, cx1, from.y, cx2, to.y, to.x, to.y);

  for (let i = 1; i <= STEPS; i++) {
    const t = i / STEPS;
    const cur = marqueeBezierPoint(t, from.x, from.y, cx1, from.y, cx2, to.y, to.x, to.y);

    if (segmentIntersectsRect(prev.x, prev.y, cur.x, cur.y, x1, y1, x2, y2)) return true;
    prev = cur;
  }
  return false;
}

function finishMarquee(ev: MouseEvent) {
  if (!isMarquee) return;
  isMarquee = false;

  if (!marqueeStart || !marqueeRectEl) {
    marqueeStart = null;
    return;
  }

  const pos = workspaceCoordsFromClient(ev);
  const x1 = Math.min(marqueeStart.x, pos.x);
  const y1 = Math.min(marqueeStart.y, pos.y);
  const x2 = Math.max(marqueeStart.x, pos.x);
  const y2 = Math.max(marqueeStart.y, pos.y);

  marqueeRectEl.remove();
  marqueeRectEl = null;
  marqueeStart = null;

  selectedNodeIds.clear();
  selectedWireIds.clear();
  selectedNoteIds.clear();

  nodes.forEach((node) => {
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    const rect = workspaceRectFromClientRect(el.getBoundingClientRect());
    const nx1 = rect.x;
    const ny1 = rect.y;
    const nx2 = nx1 + rect.width;
    const ny2 = ny1 + rect.height;

    if (nx2 >= x1 && nx1 <= x2 && ny2 >= y1 && ny1 <= y2) {
      selectedNodeIds.add(node.id);
    }
  });
  notes.forEach((note) => {
    const el = workspace.querySelector<HTMLDivElement>(
      `[data-note-id="${note.id}"]`
    );
    if (!el) return;
    const rect = workspaceRectFromClientRect(el.getBoundingClientRect());
    const nx1 = rect.x;
    const ny1 = rect.y;
    const nx2 = nx1 + rect.width;
    const ny2 = ny1 + rect.height;

    if (nx2 >= x1 && nx1 <= x2 && ny2 >= y1 && ny1 <= y2) {
      selectedNoteIds.add(note.id);
    }
  });
  wires.forEach((wire) => {
    const from = findPortElementById(wire.fromPortId);
    const to = findPortElementById(wire.toPortId);
    if (!from || !to) return;
  
    const p1 = getPortCenter(from);
    const p2 = getPortCenter(to);
  
    if (wireIntersectsMarquee(p1, p2, x1, y1, x2, y2)) {
      selectedWireIds.add(wire.id);
    }
  });
  

  updateSelectionStyles();
}

function setupPrimitivePaletteButton(btn: HTMLButtonElement, type: NodeType) {
  btn.addEventListener("click", () => {
    if (previewMode) return;
    const center = visibleWorkspaceCenter();
    createNode(
      type,
      center.x,
      center.y
    );
  });

  btn.draggable = true;
  btn.addEventListener("dragstart", (ev) => {
    if (previewMode) return;
    paletteDragPayload = { type };
    if (ev.dataTransfer) {
      ev.dataTransfer.setData("text/plain", type);
      ev.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }
  });
}

palette
  .querySelectorAll<HTMLButtonElement>(".palette-item[data-node-type]")
  .forEach((btn) => {
    const type = btn.dataset.nodeType as NodeType;
    setupPrimitivePaletteButton(btn, type);
  });
// Replace CSS-based gate icons in the palette with inline SVG (prevents faint ghost glyphs)
const paletteGateTypes: InlineGateType[] = ["AND", "OR", "NAND", "NOR", "XOR", "NOT", "BUFFER"];
paletteGateTypes.forEach((t) => {
  const btn = palette.querySelector<HTMLButtonElement>(
    `.palette-item[data-node-type="${t}"]`
  );
  if (!btn) return;

  const body = btn.querySelector<HTMLDivElement>(".node-body");
  if (body) {
    body.style.display = "flex";
    body.style.alignItems = "center";
    body.style.justifyContent = "center";
  }

  applyGateSvg(btn, t, { variant: "palette" });

  const shape = btn.querySelector<HTMLDivElement>(".gate-shape");
  if (!shape) return;

  // IMPORTANT: do NOT stretch to 100% (that’s what made them huge)
  shape.style.width = "56px";
  shape.style.height = "36px";
  shape.style.display = "grid";
});


workspace.addEventListener("dragover", (ev) => {
  ev.preventDefault();
  if (previewMode) return;
  if (!paletteDragPayload) return;

  const pos = workspaceCoordsFromClient(ev);
  const baseX = pos.x;
  const baseY = pos.y;

  if (activePaletteDragNodeId === null) {
    if (paletteDragPayload.icId != null) {
      const node = instantiateIC(paletteDragPayload.icId, baseX, baseY);
      if (node) activePaletteDragNodeId = node.id;
    } else if (paletteDragPayload.type) {
      const node = createNode(paletteDragPayload.type, baseX, baseY);
      activePaletteDragNodeId = node.id;
    }
  } else {
    const node = nodes.get(activePaletteDragNodeId);
    if (!node) return;
    node.x = snapCoord(baseX);
    node.y = snapCoord(baseY);
    const el = workspace.querySelector<HTMLDivElement>(
      `[data-node-id="${node.id}"]`
    );
    if (el) {
      applyNodeTransform(el, node);
    }
    markWireGeometryDirty();
    renderAllWires(true);
  }
});

workspace.addEventListener("drop", (ev) => {
  ev.preventDefault();
  if (previewMode) return;
  activePaletteDragNodeId = null;
  paletteDragPayload = null;
  recomputeSignals();
});

workspace.addEventListener("mousedown", (ev) => {
  if (previewMode) return;
  if (ev.button !== 0) return;

  const target = ev.target as HTMLElement;
  if (
    target.closest(".node") ||
    target.closest(".workspace-note") ||
    target.closest(".wire-path-real")
  ) return;

  hideContextMenu();
  clearSelection();
  startMarquee(ev);

  window.addEventListener("mousemove", updateMarquee);
  window.addEventListener("mouseup", onUp);

  function onUp(e: MouseEvent) {
    window.removeEventListener("mousemove", updateMarquee);
    window.removeEventListener("mouseup", onUp);
    finishMarquee(e);
  }
});

workspace.addEventListener("contextmenu", (ev) => {
  if (previewMode) return;
  ev.preventDefault();
  hideContextMenu();

  const target = ev.target as HTMLElement;

  const wirePath = target.closest<SVGPathElement>(".wire-path-real");
  const nodeEl = target.closest<HTMLDivElement>(".node");
  const noteEl = target.closest<HTMLDivElement>(".workspace-note");

  if (wirePath) {
    const id = Number(wirePath.dataset.wireId);
    if (!selectedWireIds.has(id)) {
      clearSelection();
      selectedWireIds.add(id);
      updateSelectionStyles();
    }
    showContextMenu(ev.clientX, ev.clientY, "wire");
  } else if (nodeEl) {
    const id = Number(nodeEl.dataset.nodeId);
    if (!selectedNodeIds.has(id)) {
      clearSelection();
      selectedNodeIds.add(id);
      updateSelectionStyles();
    }
    showContextMenu(ev.clientX, ev.clientY, "node");
  } else if (noteEl) {
    const id = Number(noteEl.dataset.noteId);
    if (!selectedNoteIds.has(id)) {
      clearSelection();
      selectedNoteIds.add(id);
      updateSelectionStyles();
    }
    showContextMenu(ev.clientX, ev.clientY, "note");
  } else {
    showContextMenu(ev.clientX, ev.clientY, "blank");
  }
});

// panning with middle mouse on grid
workspaceWrapper.addEventListener("mousedown", (ev) => {
  if (ev.button !== 1) return;
  const target = ev.target as HTMLElement;
  if (
    target.closest(".node") ||
    target.closest(".workspace-note") ||
    target.closest(".wire-path-real")
  ) return;
  if (target.closest(".top-toolbar")) return;

  isPanning = true;
  panStart = {
    x: ev.clientX,
    y: ev.clientY,
    scrollLeft: workspaceWrapper.scrollLeft,
    scrollTop: workspaceWrapper.scrollTop,
  };
  ev.preventDefault();

  window.addEventListener("mousemove", onPanMove);
  window.addEventListener("mouseup", onPanEnd);
});

function onPanMove(ev: MouseEvent) {
  if (!isPanning || !panStart) return;
  const dx = ev.clientX - panStart.x;
  const dy = ev.clientY - panStart.y;
  workspaceWrapper.scrollLeft = panStart.scrollLeft - dx;
  workspaceWrapper.scrollTop = panStart.scrollTop - dy;
}

function onPanEnd() {
  isPanning = false;
  panStart = null;
  window.removeEventListener("mousemove", onPanMove);
  window.removeEventListener("mouseup", onPanEnd);
}

zoomResetButton?.addEventListener("click", () => {
  setWorkspaceZoom(1);
});

workspaceWrapper.addEventListener(
  "wheel",
  (ev) => {
    const isZoomGesture = ev.shiftKey || ev.ctrlKey || ev.metaKey;
    if (!isZoomGesture) return;
    ev.preventDefault();
    const factor = Math.exp(-ev.deltaY * 0.0015);
    setWorkspaceZoom(workspaceZoom * factor, ev.clientX, ev.clientY);
  },
  { passive: false }
);

type WebkitGestureEvent = Event & {
  scale: number;
  clientX: number;
  clientY: number;
};

let gestureZoomStart = workspaceZoom;

workspaceWrapper.addEventListener(
  "gesturestart",
  ((ev: Event) => {
    gestureZoomStart = workspaceZoom;
    ev.preventDefault();
  }) as EventListener,
  { passive: false }
);

workspaceWrapper.addEventListener(
  "gesturechange",
  ((ev: Event) => {
    const gestureEv = ev as WebkitGestureEvent;
    ev.preventDefault();
    setWorkspaceZoom(
      gestureZoomStart * gestureEv.scale,
      gestureEv.clientX,
      gestureEv.clientY
    );
  }) as EventListener,
  { passive: false }
);

function getAllKeyNodes(): NodeData[] {
  const res: NodeData[] = [];
  nodes.forEach((n) => {
    if (n.type === "KEY") res.push(n);
  });
  icDefinitions.forEach((def) => {
    def.nodes.forEach((n) => {
      if (n.type === "KEY") res.push(n);
    });
  });
  return res;
}

function handleKeyNodes(ev: KeyboardEvent, isDown: boolean): boolean {
  // Do not hijack typing in inputs/textareas/contenteditable
  const target = ev.target as HTMLElement | null;
  const tag = target?.tagName;
  const isEditingField =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (target != null && target.isContentEditable);

  if (isEditingField) return false;

  const key = ev.key.toLowerCase();
  let changed = false;
  let matched = false;

  const allKeys = getAllKeyNodes();

  allKeys.forEach((n) => {
    const targetKey = (n.keyChar || "a").toLowerCase();
    if (targetKey !== key) return;

    matched = true;

    const mode = n.keyMode || "toggle";

    if (mode === "toggle") {
      if (isDown && !ev.repeat) {
        n.value = !n.value;
        changed = true;
      }
    } else if (mode === "hold") {
      // only update if it actually changes to avoid extra recompute spam
      const next = isDown;
      if (n.value !== next) {
        n.value = next;
        changed = true;
      }
    } else {
      // pulse
      if (isDown && !ev.repeat) {
        n.value = true;
        changed = true;
        window.setTimeout(() => {
          n.value = false;
          recomputeSignals();
        }, 120);
      }
    }
  });

  if (changed) recomputeSignals();
  return matched;
}


window.addEventListener("keydown", (ev) => {
  const target = ev.target as HTMLElement | null;
  const tag = target?.tagName;
  const isEditingField =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (target != null && target.isContentEditable);

  // Always allow Esc to behave normally (and also clear selections/menus)
  if (!isEditingField && ev.key === "Escape") {
    hideContextMenu();
    clearSelection();
    // also close overlays if you want (optional):
    // hideOverlay(communityOverlay); hideOverlay(accountOverlay); hideOverlay(icToolboxOverlay);
    return;
  }

  // KEY nodes should work in BOTH edit mode and preview mode,
  // but we should not interfere with Ctrl/Cmd shortcuts.
  const mod = ev.metaKey || ev.ctrlKey;
  let keyMatched = false;

  if (!isEditingField && !mod) {
    keyMatched = handleKeyNodes(ev, true);
    // If a KEY node matched, prevent default (helps avoid weird browser behaviors)
    if (keyMatched) ev.preventDefault();
  }

  // In preview mode, we don't want editor shortcuts (copy/paste/delete) to fire.
  if (previewMode) {
    // (we already handled keys above)
    return;
  }

  if (isEditingField) return;

  if (!mod && ev.key.toLowerCase() === "r" && selectedNodeIds.size > 0) {
    ev.preventDefault();
    rotateSelectedNodesClockwise();
    return;
  }

  // Editor shortcuts (only when NOT preview)
  if (mod && ev.key.toLowerCase() === "c") {
    ev.preventDefault();
    if (
      typeof selectedNodeIds !== "undefined" &&
      (selectedNodeIds.size > 0 || selectedNoteIds.size > 0)
    ) {
      const snap = getSelectionSnapshot();
      try {
        localStorage.setItem(
          "cirkitClipboard",
          JSON.stringify({
            version: 2,
            nodes: snap.nodes,
            notes: snap.notes,
            wires: snap.wires,
          })
        );
      } catch {}
    }
    copySelection();
  } else if (mod && ev.key.toLowerCase() === "v") {
    ev.preventDefault();
    if (
      typeof clipboardNodes !== "undefined" &&
      (!clipboardNodes || clipboardNodes.length === 0)
    ) {
      try {
        const raw = localStorage.getItem("cirkitClipboard");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (
            parsed &&
            (parsed.version === 1 || parsed.version === 2) &&
            Array.isArray(parsed.nodes) &&
            Array.isArray(parsed.wires)
          ) {
            clipboardNodes = parsed.nodes;
            clipboardNotes = Array.isArray(parsed.notes) ? parsed.notes : [];
            clipboardWires = parsed.wires;
            if (typeof lastPasteOffset !== "undefined") {
              lastPasteOffset = 0;
            }
          }
        }
      } catch {}
    }
    pasteSelection();
  } else if (ev.key === "Delete" || ev.key === "Backspace") {
    ev.preventDefault();
    deleteSelection();
  }
});


window.addEventListener("keyup", (ev) => {
  const target = ev.target as HTMLElement | null;
  const tag = target?.tagName;
  const isEditingField =
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    (target != null && target.isContentEditable);

  const mod = ev.metaKey || ev.ctrlKey;
  if (!isEditingField && !mod) {
    handleKeyNodes(ev, false);
  }
});

window.addEventListener("mousedown", (ev) => {
  const target = ev.target as HTMLElement;
  if (target.closest(".context-menu")) return;
  hideContextMenu();
});

window.addEventListener("pointerdown", () => {
  nudgeAudioContext();
});

window.addEventListener("keydown", () => {
  nudgeAudioContext();
});

/* ---------- Preview toggle ---------- */

previewToggle.addEventListener("click", () => {
  setPreviewMode(!previewMode);
  hideContextMenu();
  clearSelection();
  toast(previewMode ? "Simulation enabled (keys work in Simulate mode)." : "Simulation disabled.");
});

function getDefaultPortId(
  node: Pick<NodeData, "id" | "type">,
  kind: PortKind,
  slot: "a" | "b" | number = 0
): string {
  if (node.type === "IC") {
    return `${node.id}:${kind === "output" ? "out" : "in"}:${slot}`;
  }

  if (kind === "output") {
    switch (node.type) {
      case "POWER":
      case "SWITCH":
      case "BUTTON":
      case "KEY":
      case "CLOCK":
        return `${node.id}:out:0`;
      case "BUFFER":
      case "NOT":
        return `${node.id}:out:1`;
      case "AND":
      case "OR":
      case "NAND":
      case "NOR":
      case "XOR":
        return `${node.id}:out:2`;
      default:
        return `${node.id}:out:${slot}`;
    }
  }

  switch (node.type) {
    case "OUTPUT":
    case "LED":
      return `${node.id}:in:0`;
    case "BUFFER":
    case "NOT":
      return `${node.id}:in:0`;
    case "AND":
    case "OR":
    case "NAND":
    case "NOR":
    case "XOR":
      return `${node.id}:in:${slot}`;
    default:
      return `${node.id}:in:${slot}`;
  }
}

function makePresetNode(id: number, type: NodeType, x: number, y: number): NodeData {
  const node: NodeData = {
    id,
    type,
    x,
    y,
    value: false,
    rotation: 0,
  };

  if (type === "OUTPUT" || type === "LED") node.lightColor = DEFAULT_LIGHT_COLOR;
  if (type === "POWER") node.value = true;
  if (type === "CLOCK") node.clockDelayMs = 100;
  if (type === "BUFFER") node.bufferDelayMs = 100;
  if (type === "KEY") {
    node.keyChar = "a";
    node.keyMode = "toggle";
  }
  if (type === "SPEAKER") node.speakerFrequencyHz = DEFAULT_SPEAKER_FREQUENCY_HZ;
  if (type === "DISPLAY") {
    node.displayWidth = DEFAULT_DISPLAY_WIDTH;
    node.displayHeight = DEFAULT_DISPLAY_HEIGHT;
  }

  return node;
}

function buildHalfAdderDefinition(): ICDefinition {
  const inA = makePresetNode(1, "SWITCH", 24, 40);
  const inB = makePresetNode(2, "SWITCH", 24, 136);
  const xor = makePresetNode(3, "XOR", 156, 52);
  const and = makePresetNode(4, "AND", 156, 148);
  const sum = makePresetNode(5, "OUTPUT", 336, 52);
  const carry = makePresetNode(6, "OUTPUT", 336, 148);

  return {
    id: 1,
    name: "HALF ADDER",
    nodes: [inA, inB, xor, and, sum, carry],
    wires: [
      {
        fromNodeId: inA.id,
        toNodeId: xor.id,
        fromPortId: getDefaultPortId(inA, "output"),
        toPortId: getDefaultPortId(xor, "input", "a"),
      },
      {
        fromNodeId: inB.id,
        toNodeId: xor.id,
        fromPortId: getDefaultPortId(inB, "output"),
        toPortId: getDefaultPortId(xor, "input", "b"),
      },
      {
        fromNodeId: inA.id,
        toNodeId: and.id,
        fromPortId: getDefaultPortId(inA, "output"),
        toPortId: getDefaultPortId(and, "input", "a"),
      },
      {
        fromNodeId: inB.id,
        toNodeId: and.id,
        fromPortId: getDefaultPortId(inB, "output"),
        toPortId: getDefaultPortId(and, "input", "b"),
      },
      {
        fromNodeId: xor.id,
        toNodeId: sum.id,
        fromPortId: getDefaultPortId(xor, "output"),
        toPortId: getDefaultPortId(sum, "input"),
      },
      {
        fromNodeId: and.id,
        toNodeId: carry.id,
        fromPortId: getDefaultPortId(and, "output"),
        toPortId: getDefaultPortId(carry, "input"),
      },
    ],
    inputNodeIds: [inA.id, inB.id],
    outputNodeIds: [sum.id, carry.id],
    ledNodeIds: [],
  };
}

function buildTutorialSaveObject(): SaveFileV1 {
  const tutorialDef = buildHalfAdderDefinition();
  const tutorialNodes: NodeData[] = [];
  const tutorialNotes: NoteData[] = [];
  const tutorialWires: SaveFileV1["wires"] = [];
  let tutorialNextNodeId = 1;
  let tutorialNextNoteId = 1;

  const addNode = (type: NodeType, x: number, y: number, patch: Partial<NodeData> = {}) => {
    const node = { ...makePresetNode(tutorialNextNodeId++, type, x, y), ...patch };
    tutorialNodes.push(node);
    return node;
  };

  const connect = (
    from: NodeData,
    to: NodeData,
    toSlot: "a" | "b" | number = 0,
    fromSlot: "a" | "b" | number = 0
  ) => {
    tutorialWires.push({
      fromNodeId: from.id,
      toNodeId: to.id,
      fromPortId: getDefaultPortId(from, "output", fromSlot),
      toPortId: getDefaultPortId(to, "input", toSlot),
    });
  };

  const addNote = (x: number, y: number, text: string, width = 380, height = 210) => {
    tutorialNotes.push({
      id: tutorialNextNoteId++,
      x,
      y,
      width,
      height,
      text,
    });
  };

  const connectDisplayPixel = (
    from: NodeData,
    display: NodeData,
    displayWidth: number,
    px: number,
    py: number,
    fromSlot: "a" | "b" | number = 0
  ) => {
    connect(from, display, py * displayWidth + px, fromSlot);
  };

  const buildBufferChain = (
    seed: NodeData,
    startX: number,
    y: number,
    count: number,
    delay = 120
  ) => {
    const stages = [seed];
    let prev = seed;
    for (let i = 0; i < count; i++) {
      const buf = addNode("BUFFER", startX + i * 144, y, {
        bufferDelayMs: delay,
      });
      connect(prev, buf);
      stages.push(buf);
      prev = buf;
    }
    return stages;
  };

  const connectDisplayPoints = (
    from: NodeData,
    display: NodeData,
    displayWidth: number,
    points: Array<{ x: number; y: number }>,
    fromSlot: "a" | "b" | number = 0
  ) => {
    points.forEach((point) => {
      connectDisplayPixel(from, display, displayWidth, point.x, point.y, fromSlot);
    });
  };

  const snakeCellPixels = (cell: { x: number; y: number }) => {
    const px = 2 + cell.x * 2;
    const py = 1 + cell.y * 2;
    return [
      { x: px, y: py },
      { x: px + 1, y: py },
      { x: px, y: py + 1 },
      { x: px + 1, y: py + 1 },
    ];
  };

  const paintSnakeCells = (
    stages: NodeData[],
    display: NodeData,
    displayWidth: number,
    cells: Array<{ x: number; y: number }>
  ) => {
    stages.forEach((stage, index) => {
      const cell = cells[index];
      if (!cell) return;
      connectDisplayPoints(stage, display, displayWidth, snakeCellPixels(cell));
    });
  };

  const noteX = 72;
  const sourceX = 912;
  const gateX = 1176;
  const outputX = 1440;

  const introSwitch = addNode("SWITCH", sourceX, 168);
  const introOutput = addNode("OUTPUT", 1176, 168);
  connect(introSwitch, introOutput);
  addNote(
    noteX,
    72,
    "Welcome to Cirkit.\n\nThis tutorial is interactive, so try each step as you scroll.\n\nStart here:\n1. Click the switch.\n2. Watch the output lamp turn on.\n3. Drag a note around and resize it from the bottom-right corner.",
    396,
    220
  );

  addNode("SWITCH", sourceX, 528);
  addNode("OUTPUT", 1176, 528);
  addNote(
    noteX,
    432,
    "Connecting wires\n\nTry this yourself:\n- Drag from the switch's right port.\n- Drop onto the lamp's left port.\n\nThat same click-and-drag move is how you connect almost everything in Cirkit.",
    396,
    210
  );

  const andA = addNode("SWITCH", sourceX, 840);
  const andB = addNode("SWITCH", sourceX, 960);
  const andGate = addNode("AND", gateX, 912);
  const andOut = addNode("OUTPUT", outputX, 912);
  connect(andA, andGate, "a");
  connect(andB, andGate, "b");
  connect(andGate, andOut);
  addNote(
    noteX,
    792,
    "AND gate\n\nTurn both switches on.\n\nThe lamp only lights when BOTH inputs are on at the same time.",
    396,
    190
  );

  const orA = addNode("SWITCH", sourceX, 1200);
  const orB = addNode("SWITCH", sourceX, 1320);
  const orGate = addNode("OR", gateX, 1272);
  const orOut = addNode("OUTPUT", outputX, 1272);
  connect(orA, orGate, "a");
  connect(orB, orGate, "b");
  connect(orGate, orOut);
  addNote(
    noteX,
    1152,
    "OR gate\n\nTurn on either switch.\n\nThe output lights if AT LEAST ONE input is on.",
    396,
    190
  );

  const power = addNode("POWER", sourceX, 1608);
  const notGate = addNode("NOT", gateX, 1608);
  const notOut = addNode("OUTPUT", outputX, 1608);
  connect(power, notGate);
  connect(notGate, notOut);
  addNote(
    noteX,
    1512,
    "NOT gate\n\nThis power source is always ON.\nThe NOT gate flips it, so the lamp stays OFF.\n\nDelete the wire or swap the source if you want to experiment.",
    396,
    220
  );

  const xorA = addNode("SWITCH", sourceX, 1920);
  const xorB = addNode("SWITCH", sourceX, 2040);
  const xorGate = addNode("XOR", gateX, 1992);
  const xorOut = addNode("OUTPUT", outputX, 1992);
  connect(xorA, xorGate, "a");
  connect(xorB, xorGate, "b");
  connect(xorGate, xorOut);
  addNote(
    noteX,
    1872,
    "XOR gate\n\nXOR turns on when the inputs are DIFFERENT.\n\nTry ON/OFF and OFF/ON, then compare it to the AND and OR sections above.",
    396,
    210
  );

  const clock = addNode("CLOCK", sourceX, 2328, { clockDelayMs: 480 });
  const buffer = addNode("BUFFER", gateX, 2328, { bufferDelayMs: 220 });
  const clockOut = addNode("OUTPUT", outputX, 2328);
  connect(clock, buffer);
  connect(buffer, clockOut);
  addNote(
    noteX,
    2232,
    "Timing: clock + buffer\n\nThe clock pulses automatically.\nThe buffer waits a little before passing each change onward, so the lamp trails the clock instead of matching it instantly.\n\nWatch the red flow move through both parts.",
    420,
    230
  );

  const icInA = addNode("SWITCH", sourceX, 2712);
  const icInB = addNode("SWITCH", sourceX, 2832);
  const icNode = addNode("IC", gateX + 12, 2712, { icDefId: tutorialDef.id });
  const icSum = addNode("OUTPUT", outputX + 36, 2712);
  const icCarry = addNode("OUTPUT", outputX + 36, 2808);
  connect(icInA, icNode, 0);
  connect(icInB, icNode, 1);
  connect(icNode, icSum, 0, 0);
  connect(icNode, icCarry, 0, 1);
  addNote(
    noteX,
    2616,
    "ICs / custom chips\n\nThis HALF ADDER is a reusable IC built from an XOR and an AND gate.\nToggle the two inputs and watch the SUM and CARRY outputs change.\n\nIn the editor, you can select a circuit and right-click -> Create IC.",
    420,
    250
  );

  const speakerSwitch = addNode("SWITCH", sourceX, 3432);
  const speakerNode = addNode("SPEAKER", gateX, 3432, {
    speakerFrequencyHz: 440,
  });
  const speakerLamp = addNode("OUTPUT", outputX, 3432);
  connect(speakerSwitch, speakerNode);
  connect(speakerSwitch, speakerLamp);
  addNote(
    noteX,
    3336,
    "Speaker\n\nThis is the simplest sound part in Cirkit.\n\nTry this:\n- Toggle the switch to hear a basic square-wave beep.\n- Right-click the speaker to change the tone.\n- Wire a clock into it later if you want repeating pulses instead of a steady tone.",
    432,
    240
  );

  const displayDemoWidth = 4;
  const displayDemo = addNode("DISPLAY", gateX + 84, 3792, {
    displayWidth: displayDemoWidth,
    displayHeight: 4,
  });
  const displaySwitchA = addNode("SWITCH", sourceX - 48, 3672);
  const displaySwitchB = addNode("SWITCH", sourceX - 48, 3792);
  const displaySwitchC = addNode("SWITCH", sourceX - 48, 3912);
  const displaySwitchD = addNode("SWITCH", sourceX - 48, 4032);
  const displayClock = addNode("CLOCK", sourceX + 120, 4032, {
    clockDelayMs: 460,
  });
  const displayBuf1 = addNode("BUFFER", gateX - 84, 4032, {
    bufferDelayMs: 150,
  });
  const displayBuf2 = addNode("BUFFER", gateX + 96, 4032, {
    bufferDelayMs: 150,
  });
  connect(displayClock, displayBuf1);
  connect(displayBuf1, displayBuf2);
  connectDisplayPixel(displaySwitchA, displayDemo, displayDemoWidth, 0, 0);
  connectDisplayPixel(displaySwitchB, displayDemo, displayDemoWidth, 3, 0);
  connectDisplayPixel(displaySwitchC, displayDemo, displayDemoWidth, 0, 3);
  connectDisplayPixel(displaySwitchD, displayDemo, displayDemoWidth, 3, 3);
  connectDisplayPixel(displayClock, displayDemo, displayDemoWidth, 1, 1);
  connectDisplayPixel(displayBuf1, displayDemo, displayDemoWidth, 2, 1);
  connectDisplayPixel(displayBuf2, displayDemo, displayDemoWidth, 2, 2);
  addNote(
    noteX,
    3672,
    "Display\n\nThe display is black-and-white and every input maps directly to one pixel.\n\nTry this:\n- Toggle the four switches to light the corners.\n- Watch the clock and buffers sweep a tiny trail through the middle.\n- Right-click the display to resize it with the custom controls.",
    438,
    250
  );

  const gameY = 4320;
  const snakeDisplayWidth = 24;
  const snakeDisplayHeight = 16;
  const snakeDisplay = addNode("DISPLAY", 1920, gameY + 48, {
    displayWidth: snakeDisplayWidth,
    displayHeight: snakeDisplayHeight,
  });

  const snakeClock = addNode("CLOCK", 768, gameY, { clockDelayMs: 1000 });
  const snakePulseWidth = addNode("BUFFER", 960, gameY, {
    bufferDelayMs: 700,
  });
  const snakePulse = addNode("XOR", 1188, gameY);
  connect(snakeClock, snakePulseWidth);
  connect(snakeClock, snakePulse, "a");
  connect(snakePulseWidth, snakePulse, "b");

  const snakeTurnKey = addNode("KEY", 768, gameY + 216, {
    keyChar: "d",
    keyMode: "hold",
  });
  const snakeTurnNot = addNode("NOT", 960, gameY + 216);
  connect(snakeTurnKey, snakeTurnNot);

  const entryCells = [
    { x: 1, y: 4 },
    { x: 2, y: 4 },
    { x: 3, y: 3 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
  ];
  const safeCells = [
    { x: 6, y: 1 },
    { x: 7, y: 0 },
    { x: 8, y: 0 },
    { x: 9, y: 1 },
    { x: 9, y: 2 },
    { x: 8, y: 3 },
    { x: 7, y: 3 },
  ];
  const riskyCells = [
    { x: 6, y: 3 },
    { x: 5, y: 3 },
    { x: 4, y: 3 },
    { x: 4, y: 2 },
    { x: 5, y: 2 },
  ];

  const entryStages = buildBufferChain(
    snakePulse,
    1500,
    gameY,
    entryCells.length - 1,
    90
  );
  const safeStart = addNode("AND", 1320, gameY + 216);
  const riskyStart = addNode("AND", 1320, gameY + 336);
  connect(entryStages[entryStages.length - 1], safeStart, "a");
  connect(snakeTurnNot, safeStart, "b");
  connect(entryStages[entryStages.length - 1], riskyStart, "a");
  connect(snakeTurnKey, riskyStart, "b");

  const safeStages = buildBufferChain(
    safeStart,
    1500,
    gameY + 216,
    safeCells.length - 1,
    90
  );
  const riskyStages = buildBufferChain(
    riskyStart,
    1500,
    gameY + 336,
    riskyCells.length - 1,
    90
  );

  paintSnakeCells(entryStages, snakeDisplay, snakeDisplayWidth, entryCells);
  paintSnakeCells(safeStages, snakeDisplay, snakeDisplayWidth, safeCells);
  paintSnakeCells(riskyStages, snakeDisplay, snakeDisplayWidth, riskyCells);

  const applePower = addNode("POWER", 768, gameY + 648);
  connectDisplayPoints(
    applePower,
    snakeDisplay,
    snakeDisplayWidth,
    snakeCellPixels({ x: 8, y: 0 })
  );

  const biteSignal = addNode("AND", 1140, gameY + 648);
  connect(safeStages[2], biteSignal, "a");
  connect(applePower, biteSignal, "b");

  const crashSignal = addNode("AND", 1140, gameY + 768);
  connect(riskyStages[4], crashSignal, "a");
  connect(entryStages[4], crashSignal, "b");

  const biteSpeaker = addNode("SPEAKER", 1500, gameY + 624, {
    speakerFrequencyHz: 880,
  });
  const biteLamp = addNode("OUTPUT", 1680, gameY + 624, {
    lightColor: "#22c55e",
  });
  connect(biteSignal, biteSpeaker);
  connect(biteSignal, biteLamp);

  const crashSpeaker = addNode("SPEAKER", 1500, gameY + 768, {
    speakerFrequencyHz: 220,
  });
  const crashLamp = addNode("OUTPUT", 1680, gameY + 768, {
    lightColor: "#ef4444",
  });
  connect(crashSignal, crashSpeaker);
  connect(crashSignal, crashLamp);

  addNote(
    noteX,
    4212,
    "Advanced build: playable snake fork\n\nThis now behaves like a tiny snake challenge.\n\nHow to play:\n- Leave D released for the long safe route.\n- Hold D before the fork to take the shortcut.\n- The safe route reaches the apple.\n- The shortcut cuts back into the still-lit tail and crashes.\n\nWhy it actually reads like snake:\n- The pulse source is XOR(clock, delayed clock), so a moving body appears after every clock edge instead of only once in a while.\n- Each buffer stage delays that pulse by less than the pulse width, so several adjacent stages stay ON together.\n- Each live stage draws one chunky body segment on the display, so you can actually see the snake instead of a few lonely pixels.\n- The crash check is a literal overlap AND gate between the shortcut head and an earlier body segment on the same cell.\n\nGreen lamp/speaker = apple. Red lamp/speaker = self-collision. No ICs are used here.",
    504,
    410
  );

  addNote(
    noteX,
    5232,
    "Tips\n\nRight-click nodes to open the custom control panels.\nUse the middle mouse button to pan.\nRight-click blank space to create your own note.\nUse Delete or Backspace to remove selected notes, wires, or gates.\n\nScroll back up and experiment with any section.",
    430,
    220
  );

  return {
    version: 1,
    nodes: tutorialNodes,
    notes: tutorialNotes,
    wires: tutorialWires,
    icDefinitions: [tutorialDef],
    nextIds: {
      nextNodeId: tutorialNextNodeId,
      nextWireId: tutorialWires.length + 1,
      nextICId: tutorialDef.id + 1,
      nextNoteId: tutorialNextNoteId,
    },
  };
}

function openTutorialInNewTab() {
  const url = new URL(window.location.href);
  url.searchParams.delete("openCircuitId");
  url.searchParams.set("tutorial", "basics");
  window.open(url.toString(), "_blank", "noopener");
}

tutorialButton.addEventListener("click", openTutorialInNewTab);


/* ---------- Save / Load ---------- */

interface SaveFileV1 {
  version: 1;
  nodes: NodeData[];
  notes?: NoteData[];
  wires: {
    fromNodeId: number;
    toNodeId: number;
    fromPortId: string;
    toPortId: string;
  }[];
  icDefinitions: ICDefinition[];
  nextIds: {
    nextNodeId: number;
    nextWireId: number;
    nextICId: number;
    nextNoteId?: number;
  };
}

function makeSaveObject(): SaveFileV1 {
  const serialNodes = Array.from(nodes.values()).map((n) => ({ ...n }));
  const serialNotes = Array.from(notes.values()).map((note) => ({ ...note }));
  const serialWires = wires.map((w) => ({
    fromNodeId: w.fromNodeId,
    toNodeId: w.toNodeId,
    fromPortId: w.fromPortId,
    toPortId: w.toPortId,
  }));
  const serialDefs = icDefinitions.map((d) => ({
    ...d,
    nodes: d.nodes.map((n) => ({ ...n })),
    wires: d.wires.map((w) => ({ ...w })),
  }));
  return {
    version: 1,
    nodes: serialNodes,
    notes: serialNotes,
    wires: serialWires,
    icDefinitions: serialDefs as ICDefinition[],
    nextIds: { nextNodeId, nextWireId, nextICId, nextNoteId },
  };
}

function saveToFile() {
  const data = makeSaveObject();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cirkit.json";
  a.click();
  URL.revokeObjectURL(url);
}

function loadFromObject(obj: any) {
  if (!obj || typeof obj !== "object") return;
  const version = obj.version ?? 1;
  if (version !== 1) {
    showNoticeModal("Can’t Load File", "Unsupported file version.");
    return;
  }
  const data = obj as SaveFileV1;

  if (mode === "ic-edit") {
    toast("Finish IC editing before loading a file.");
    return;
  }

  // clear timers and DOM
  nodes.forEach((n) => teardownNodeDynamicBehavior(n.id));
  workspace.querySelectorAll<HTMLDivElement>(".node").forEach((el) => el.remove());
  workspace.querySelectorAll<HTMLDivElement>(".workspace-note").forEach((el) => el.remove());
  wireLayer
    .querySelectorAll<SVGPathElement>(".wire-path")
    .forEach((p) => p.remove());
  clearCachedWorkspaceDom();
  clearSelection();
  hideContextMenu();

  nodes.clear();
  wires.length = 0;
  icDefinitions.length = 0;
  notes.clear();
  clockTimers.clear();
  bufferLastInput.clear();
  bufferTimeouts.clear();
  Array.from(speakerVoices.keys()).forEach((nodeId) => stopSpeakerVoice(nodeId));

  // ICs
  palette.querySelectorAll<HTMLDivElement>(".palette-item-ic").forEach((el) => el.remove());
  data.icDefinitions.forEach((d) => {
    const def: ICDefinition = {
      id: d.id,
// ===== SECTION 6: Save/Load + serialization + local persistence =====
      name: d.name,
      nodes: d.nodes.map((n: NodeData) => ({ ...n })),
      wires: d.wires.map((w) => ({ ...w })),
      inputNodeIds: d.inputNodeIds.slice(),
      outputNodeIds: d.outputNodeIds.slice(),
      ledNodeIds: d.ledNodeIds.slice(),
    };
    icDefinitions.push(def);
    addICPaletteButton(def);
  });

  // nodes
  data.nodes.forEach((n) => {
    const node: NodeData = { ...n };
    nodes.set(node.id, node);
  });

  (data.notes || []).forEach((n) => {
    const note: NoteData = { ...n };
    notes.set(note.id, note);
  });

  // wires
  data.wires.forEach((w) => {
    wires.push({
      id: nextWireId++,
      fromNodeId: w.fromNodeId,
      toNodeId: w.toNodeId,
      fromPortId: w.fromPortId,
      toPortId: w.toPortId,
      isActive: false,
    });
  });

  // ids
  nextNodeId = data.nextIds?.nextNodeId ?? (Math.max(0, ...Array.from(nodes.keys())) + 1);
  nextWireId = data.nextIds?.nextWireId ?? (wires.reduce((m, w) => Math.max(m, w.id), 0) + 1);
  nextICId = data.nextIds?.nextICId ?? (icDefinitions.reduce((m, d) => Math.max(m, d.id), 0) + 1);
  nextNoteId =
    data.nextIds?.nextNoteId ??
    (Math.max(0, ...Array.from(notes.keys())) + 1);

  withDeferredWireRendering(() => {
    nodes.forEach((n) => {
      renderNode(n);
      initializeNodeDynamicBehavior(n);
    });
  });
  notes.forEach((note) => renderNote(note));
  recomputeSignals();
  setEditingLabel(null);
  clearWorkspaceChanged();

}
function resetWorkspaceHard() {
  if (mode === "ic-edit") {
    toast("Finish IC editing before resetting.");
    return;
  }

  // stop timers + clear runtime maps
  nodes.forEach((n) => teardownNodeDynamicBehavior(n.id));
  clockTimers.clear();
  bufferLastInput.clear();
  bufferTimeouts.clear();
  Array.from(speakerVoices.keys()).forEach((nodeId) => stopSpeakerVoice(nodeId));

  // remove DOM nodes + wires
  workspace.querySelectorAll<HTMLDivElement>(".node").forEach((el) => el.remove());
  workspace.querySelectorAll<HTMLDivElement>(".workspace-note").forEach((el) => el.remove());
  wireLayer.querySelectorAll<SVGPathElement>(".wire-path").forEach((p) => p.remove());
  clearCachedWorkspaceDom();

  // clear data
  nodes.clear();
  wires.length = 0;
  notes.clear();

  // wipe ALL custom ICs from left column + definitions
  icDefinitions.length = 0;
  palette.querySelectorAll<HTMLDivElement>(".palette-item-ic").forEach((el) => el.remove());

  // reset selection / UI
  clearSelection();
  hideContextMenu();
  setPreviewMode(false);

  // reset ids + “current circuit” state
  nextNodeId = 1;
  nextWireId = 1;
  nextICId = 1;
  nextNoteId = 1;

  currentCircuitTitle = "Untitled";
  currentCircuitVisibility = "private";

  setEditingLabel(null);

  // optional: re-run signals just to ensure clean visuals (no nodes anyway)
  recomputeSignals();
  clearWorkspaceChanged();
}

saveButton.addEventListener("click", () => {
  saveToFile();
});

const loadInput = document.createElement("input");
loadInput.type = "file";
loadInput.accept = "application/json";
loadInput.style.display = "none";
document.body.appendChild(loadInput);

loadButton.addEventListener("click", () => {
  loadInput.value = "";
  loadInput.click();
});

loadInput.addEventListener("change", () => {
  const file = loadInput.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      loadFromObject(data);
    } catch {
      toast("Invalid file.");
    }
  };
  reader.readAsText(file);
});

// =======================
// Account + Community UI (Google Sign-In)
// =======================

interface CurrentUser {
  id: number;
  username: string; // we keep these for compatibility; server returns email here
  nickname: string;
  email?: string;
  picture?: string;
}

interface ServerCircuitSummary {
  id: number;
  title: string;
  visibility: "private" | "preview" | "open";
  ownerId: number;
}

interface ServerCircuit extends ServerCircuitSummary {
  data: SaveFileV1;
}

let currentUser: CurrentUser | null = null;
let currentCircuitTitle = "Untitled";
let currentCircuitVisibility: "private" | "preview" | "open" = "private";

// =======================
// IMPORTANT: FIX COMMUNITY / API BASE
// =======================
// Your old api() used relative paths, which breaks if the frontend runs on
// a different port than the backend (e.g. Vite :5173 vs server :4000).
// This is *very likely* why Community "stopped working".
const APP_BASE = (import.meta as any).env?.BASE_URL ?? "/";
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  ((import.meta as any).env?.DEV
    ? APP_BASE.startsWith("/cirkit/")
      ? "/cirkit/api"
      : "http://localhost:4000"
    : APP_BASE.startsWith("/cirkit/")
      ? "/cirkit/api"
      : "");

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = API_BASE ? API_BASE + path : path;
  const res = await fetch(url, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json() as Promise<T>;
}

// ============================================================
// Gallery UI + Preview generation (Circuit + IC Toolbox thumbs)
// ============================================================

type ThumbKey = string;

const previewCache = new Map<ThumbKey, string>();
const previewDataCache = new Map<number, SaveFileV1>(); // circuitId -> data cache

function svgToDataUrl(svg: string): string {
  // safest + simplest: url-encode the SVG
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatVisibility(vis: "private" | "preview" | "open"): string {
  if (vis === "open") return "Open";
  if (vis === "preview") return "Preview";
  return "Private";
}

function nodeApproxSize(
  node: NodeData,
  icDefMap: Map<number, ICDefinition>
): { w: number; h: number } {
  if (node.type === "IC") {
    const def = node.icDefId != null ? icDefMap.get(node.icDefId) : undefined;
    const inCount = def?.inputNodeIds.length ?? 0;
    const outCount = def?.outputNodeIds.length ?? 0;
    const ledCount = def?.ledNodeIds.length ?? 0;
    const rows = Math.max(inCount, outCount, ledCount, 1);
    const bodyHeight = Math.max(40, rows * 18 + 8);
    return { w: 140, h: 24 + bodyHeight };
  }
  if (node.type === "DISPLAY") {
    const layout = getDisplayLayout(node);
    return { w: layout.nodeWidth, h: layout.nodeHeight };
  }
  // default node box
  return getNodeLayoutSize(node);
}

function portPosForPreview(
  node: NodeData,
  portId: string,
  icDefMap: Map<number, ICDefinition>
): { x: number; y: number } {
  const { w, h } = nodeApproxSize(node, icDefMap);

  // base anchor points (relative to node top-left)
  const leftX = -7;
  const rightX = w + 7;

  const parts = portId.split(":");
  const role = parts[1] || "";
  const suffix = parts[2] || "";

  const isOut = role === "out";
  let yFrac = 0.5;

  if (node.type === "IC") {
    const def = node.icDefId != null ? icDefMap.get(node.icDefId) : undefined;
    const inCount = def?.inputNodeIds.length ?? 0;
    const outCount = def?.outputNodeIds.length ?? 0;

    if (role === "in") {
      const idx = Number(suffix);
      if (Number.isFinite(idx) && inCount > 0) {
        yFrac = (idx + 1) / (inCount + 1);
      }
    } else if (role === "out") {
      const idx = Number(suffix);
      if (Number.isFinite(idx) && outCount > 0) {
        yFrac = (idx + 1) / (outCount + 1);
      }
    }
  } else if (node.type === "DISPLAY" && role === "in") {
    const index = Number(suffix);
    if (Number.isFinite(index) && index >= 0) {
      return getDisplayPixelCoordinates(node, index);
    }
  } else {
    // A/B stacked inputs on some gates
    if (role === "in") {
      if (suffix === "a") yFrac = 0.32;
      else if (suffix === "b") yFrac = 0.68;
      else yFrac = 0.5;
    } else {
      yFrac = 0.5;
    }
  }

  const x = (isOut ? rightX : leftX) + node.x;
  const y = node.y + h * clamp(yFrac, 0.12, 0.88);
  return { x, y };
}

function computeBoundsForPreview(
  nodeList: NodeData[],
  icDefMap: Map<number, ICDefinition>
) {
  if (nodeList.length === 0) return { minX: 0, minY: 0, maxX: 320, maxY: 200 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const n of nodeList) {
    const { w, h } = nodeApproxSize(n, icDefMap);
    minX = Math.min(minX, n.x - 40);
    minY = Math.min(minY, n.y - 40);
    maxX = Math.max(maxX, n.x + w + 40);
    maxY = Math.max(maxY, n.y + h + 40);
  }

  if (!Number.isFinite(minX)) minX = 0;
  if (!Number.isFinite(minY)) minY = 0;
  if (!Number.isFinite(maxX)) maxX = 320;
  if (!Number.isFinite(maxY)) maxY = 200;

  return { minX, minY, maxX, maxY };
}

function wirePathD(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.abs(x2 - x1);
  const controlOffset = Math.max(40, dx / 2);
  const cx1 = x1 + controlOffset;
  const cx2 = x2 - controlOffset;
  return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
}

function renderCircuitThumbSvg(opts: {
  nodes: NodeData[];
  wires: { fromNodeId: number; toNodeId: number; fromPortId: string; toPortId: string }[];
  icDefinitions: ICDefinition[];
  width: number;
  height: number;
  title?: string;
}): string {
  const icDefMap = new Map<number, ICDefinition>();
  opts.icDefinitions.forEach((d) => icDefMap.set(d.id, d));

  const bounds = computeBoundsForPreview(opts.nodes, icDefMap);
  const vbW = Math.max(1, bounds.maxX - bounds.minX);
  const vbH = Math.max(1, bounds.maxY - bounds.minY);

  const nodeMap = new Map<number, NodeData>();
  opts.nodes.forEach((n) => nodeMap.set(n.id, n));

  const bg = "#0b1220";
  const fg = "rgba(255,255,255,0.85)";
  const stroke = "rgba(255,255,255,0.22)";
  const wire = "rgba(255,255,255,0.32)";

  const wiresSvg = opts.wires
    .map((w) => {
      const fromNode = nodeMap.get(w.fromNodeId);
      const toNode = nodeMap.get(w.toNodeId);
      if (!fromNode || !toNode) return "";
      const p1 = portPosForPreview(fromNode, w.fromPortId, icDefMap);
      const p2 = portPosForPreview(toNode, w.toPortId, icDefMap);
      const d = wirePathD(p1.x, p1.y, p2.x, p2.y);
      return `<path d="${d}" fill="none" stroke="${wire}" stroke-width="3" stroke-linecap="round" />`;
    })
    .join("");

  const nodesSvg = opts.nodes
    .map((n) => {
      const { w, h } = nodeApproxSize(n, icDefMap);
      const label =
        n.type === "IC"
          ? (n.icDefId != null ? icDefMap.get(n.icDefId)?.name : "IC") ?? "IC"
          : n.type;

      const isOutput = n.type === "OUTPUT" || n.type === "LED";
      const accent = isOutput ? "rgba(34,197,94,0.55)" : "rgba(99,102,241,0.45)";

      const rx = n.type === "IC" ? 6 : 10;

      return `
        <g>
          <rect x="${n.x}" y="${n.y}" width="${w}" height="${h}" rx="${rx}" ry="${rx}"
                fill="rgba(255,255,255,0.06)" stroke="${stroke}" stroke-width="2" />
          <rect x="${n.x}" y="${n.y}" width="${w}" height="22" rx="${rx}" ry="${rx}"
                fill="rgba(255,255,255,0.07)" stroke="none" />
          <circle cx="${n.x + 10}" cy="${n.y + 11}" r="4" fill="${accent}" />
          <text x="${n.x + 20}" y="${n.y + 15}"
                font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
                font-size="11" fill="${fg}">${escapeHtml(label)}</text>
        </g>
      `;
    })
    .join("");

  const titleSvg = opts.title
    ? `<text x="${bounds.minX + 10}" y="${bounds.minY + 18}" font-family="system-ui, -apple-system, Segoe UI"
             font-size="12" fill="rgba(255,255,255,0.55)">${escapeHtml(opts.title)}</text>`
    : "";

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${opts.width}" height="${opts.height}"
         viewBox="${bounds.minX} ${bounds.minY} ${vbW} ${vbH}"
         preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bg}" />
          <stop offset="1" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect x="${bounds.minX}" y="${bounds.minY}" width="${vbW}" height="${vbH}" fill="url(#g)" />
      ${titleSvg}
      ${wiresSvg}
      ${nodesSvg}
    </svg>
  `.trim();
}

function renderIcBlockThumbSvg(opts: {
  name: string;
  inputs: number;
  outputs: number;
  width: number;
  height: number;
}): string {
  const bg = "#0b1220";
  const stroke = "rgba(255,255,255,0.24)";
  const fg = "rgba(255,255,255,0.85)";

  const pad = 18;
  const boxX = pad;
  const boxY = pad;
  const boxW = opts.width - pad * 2;
  const boxH = opts.height - pad * 2;

  const dotR = 4;
  const inDots = Array.from({ length: Math.max(1, opts.inputs) })
    .map((_, i) => {
      const y = boxY + (boxH * (i + 1)) / (Math.max(1, opts.inputs) + 1);
      return `<circle cx="${boxX}" cy="${y}" r="${dotR}" fill="rgba(255,255,255,0.75)" />`;
    })
    .join("");

  const outDots = Array.from({ length: Math.max(1, opts.outputs) })
    .map((_, i) => {
      const y = boxY + (boxH * (i + 1)) / (Math.max(1, opts.outputs) + 1);
      return `<circle cx="${boxX + boxW}" cy="${y}" r="${dotR}" fill="rgba(255,255,255,0.00)" stroke="rgba(255,255,255,0.75)" stroke-width="2" />`;
    })
    .join("");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height}" viewBox="0 0 ${opts.width} ${opts.height}">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${bg}" />
          <stop offset="1" stop-color="#111827" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${opts.width}" height="${opts.height}" fill="url(#bg)" />
      <rect x="${boxX}" y="${boxY}" width="${boxW}" height="${boxH}" rx="10" ry="10"
            fill="rgba(255,255,255,0.06)" stroke="${stroke}" stroke-width="2" />
      <text x="${boxX + 12}" y="${boxY + 18}" font-size="12" fill="${fg}"
            font-family="system-ui, -apple-system, Segoe UI">${escapeHtml(opts.name)}</text>
      ${inDots}
      ${outDots}
    </svg>
  `.trim();
}

async function getCircuitThumbById(circuitId: number, title?: string): Promise<string> {
  const key: ThumbKey = `circuit:${circuitId}`;
  const cached = previewCache.get(key);
  if (cached) return cached;

  // try to reuse cached data
  let data = previewDataCache.get(circuitId);
  if (!data) {
    const c = await api<ServerCircuit>("/api/circuits/" + circuitId);
    data = c.data;
    previewDataCache.set(circuitId, c.data);
  }

  const svg = renderCircuitThumbSvg({
    nodes: data.nodes,
    wires: data.wires,
    icDefinitions: data.icDefinitions,
    width: 360,
    height: 220,
    title,
  });

  const url = svgToDataUrl(svg);
  previewCache.set(key, url);
  return url;
}

async function getToolboxThumbs(entryId: number): Promise<{ block: string; inside: string }> {
  const keyBlock: ThumbKey = `toolbox:${entryId}:block`;
  const keyInside: ThumbKey = `toolbox:${entryId}:inside`;

  const cachedBlock = previewCache.get(keyBlock);
  const cachedInside = previewCache.get(keyInside);
  if (cachedBlock && cachedInside) return { block: cachedBlock, inside: cachedInside };

  const entry = await api<ToolboxEntry>("/api/toolbox/" + entryId);

  const v = validateSingleIcBoard(entry.data);
  const defs = (entry.data.icDefinitions || []) as ICDefinition[];

  let blockUrl = cachedBlock;
  let insideUrl = cachedInside;

  if (v.ok) {
    const rootDef = v.rootDef;
    const blockSvg = renderIcBlockThumbSvg({
      name: entry.name || rootDef.name || "IC",
      inputs: rootDef.inputNodeIds.length,
      outputs: rootDef.outputNodeIds.length,
      width: 280,
      height: 180,
    });
    blockUrl = svgToDataUrl(blockSvg);

    const insideSvg = renderCircuitThumbSvg({
      nodes: rootDef.nodes,
      wires: rootDef.wires,
      icDefinitions: defs,
      width: 280,
      height: 180,
      title: "Inside",
    });
    insideUrl = svgToDataUrl(insideSvg);
  } else {
    // fallback thumbs
    const badSvg = renderIcBlockThumbSvg({
      name: entry.name || "IC",
      inputs: 1,
      outputs: 1,
      width: 280,
      height: 180,
    });
    blockUrl = svgToDataUrl(badSvg);
    insideUrl = svgToDataUrl(badSvg);
  }

  previewCache.set(keyBlock, blockUrl!);
  previewCache.set(keyInside, insideUrl!);
  return { block: blockUrl!, inside: insideUrl! };
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<void>
) {
  const queue = items.slice();
  const runners: Promise<void>[] = [];
  const realLimit = Math.max(1, limit);

  for (let i = 0; i < realLimit; i++) {
    runners.push(
      (async () => {
        while (queue.length) {
          const item = queue.shift()!;
          const idx = items.length - queue.length - 1;
          try {
            await worker(item, idx);
          } catch (e) {
            // swallow per-item errors so gallery still loads
            console.error(e);
          }
        }
      })()
    );
  }
  await Promise.all(runners);
}

function buildGalleryShell(opts: {
  container: HTMLElement;
  title?: string;
  subtitle?: string;
  searchPlaceholder: string;
  extraRightHTML?: string;
}) {
  opts.container.innerHTML = `
    <div class="gallery">
      <div class="gallery-toolbar">
        <div class="gallery-left">
          ${
            opts.title
              ? `<div class="gallery-title">${escapeHtml(opts.title)}</div>`
              : ""
          }
          ${
            opts.subtitle
              ? `<div class="gallery-subtitle">${escapeHtml(opts.subtitle)}</div>`
              : ""
          }
        </div>
        <div class="gallery-right">
          <input class="gallery-search" type="text" placeholder="${escapeHtml(
            opts.searchPlaceholder
          )}" />
          ${opts.extraRightHTML || ""}
        </div>
      </div>
      <div class="gallery-grid"></div>
    </div>
  `;

  return {
    searchEl: opts.container.querySelector<HTMLInputElement>(".gallery-search")!,
    gridEl: opts.container.querySelector<HTMLDivElement>(".gallery-grid")!,
  };
}

// --- Add "Save to Account" button next to Save/Load ---
const saveAccountButton = document.createElement("button");
saveAccountButton.type = "button";
saveAccountButton.className = "save-account-button";
saveAccountButton.textContent = "Save to Account";
saveButton.insertAdjacentElement("afterend", saveAccountButton);
// =======================
// Custom UI helpers: toast + modal
// =======================

let toastEl: HTMLDivElement | null = null;
function toast(message: string, ms = 2200) {
  if (toastEl) toastEl.remove();
  toastEl = document.createElement("div");
  toastEl.className = "cirkit-toast";
  toastEl.textContent = message;
  document.body.appendChild(toastEl);
  window.setTimeout(() => {
    toastEl?.remove();
    toastEl = null;
  }, ms);
}

type ModalButton = {
  label: string;
  kind?: "primary" | "danger" | "ghost";
  onClick: (ctx: { close: () => void; modal: HTMLDivElement; backdrop: HTMLDivElement }) => void;
};

function showModal(opts: { title: string; bodyHTML: string }) {
  const backdrop = document.createElement("div");
  backdrop.className = "cirkit-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "cirkit-modal";
  modal.innerHTML = `
    <div class="cirkit-modal-header">
      <div class="cirkit-modal-title"></div>
      <button type="button" class="cirkit-modal-x" aria-label="Close">×</button>
    </div>
    <div class="cirkit-modal-body"></div>
    <div class="cirkit-modal-footer"></div>
  `;

  (modal.querySelector(".cirkit-modal-title") as HTMLDivElement).textContent = opts.title;
  (modal.querySelector(".cirkit-modal-body") as HTMLDivElement).innerHTML = opts.bodyHTML;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.dispatchEvent(new CustomEvent("cirkit-modal:closing"));
    backdrop.remove();
  };

  (modal.querySelector(".cirkit-modal-x") as HTMLButtonElement).addEventListener("click", close);
  backdrop.addEventListener("click", (ev) => {
    if (ev.target === backdrop) close();
  });

  function setButtons(buttons: ModalButton[]) {
    const footer = modal.querySelector(".cirkit-modal-footer") as HTMLDivElement;
    footer.innerHTML = "";
    buttons.forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `cirkit-modal-btn ${b.kind || "ghost"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => b.onClick({ close, modal, backdrop }));
      footer.appendChild(btn);
    });
  }

  return { close, backdrop, modal, setButtons };
}

function showNoticeModal(title: string, message: string) {
  const m = showModal({
    title,
    bodyHTML: `<div class="cirkit-modal-copy">${escapeHtml(message).replace(/\n/g, "<br>")}</div>`,
  });
  m.setButtons([{ label: "OK", kind: "primary", onClick: ({ close }) => close() }]);
  return m;
}

async function promptTextModal(opts: {
  title: string;
  label: string;
  value: string;
  hint?: string;
  placeholder?: string;
  submitLabel?: string;
  validate?: (value: string) => string | null;
}): Promise<string | null> {
  return await new Promise((resolve) => {
    const m = showModal({
      title: opts.title,
      bodyHTML: `
        <div class="cirkit-modal-form">
          ${
            opts.hint
              ? `<div class="cirkit-modal-help">${escapeHtml(opts.hint)}</div>`
              : ""
          }
          <div class="cirkit-field-group">
            <label class="cirkit-field-label">${escapeHtml(opts.label)}</label>
            <input class="cirkit-text-prompt" type="text" value="${escapeHtml(opts.value)}" placeholder="${escapeHtml(
              opts.placeholder ?? ""
            )}" />
          </div>
          <div class="cirkit-field-error" style="display:none;"></div>
        </div>
      `,
    });

    let settled = false;
    const input = m.modal.querySelector<HTMLInputElement>(".cirkit-text-prompt")!;
    const errorEl = m.modal.querySelector<HTMLDivElement>(".cirkit-field-error")!;

    const closeWith = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      m.close();
    };

    const submit = () => {
      const value = input.value.trim();
      const error = opts.validate?.(value) ?? null;
      if (error) {
        errorEl.textContent = error;
        errorEl.style.display = "";
        return;
      }
      closeWith(value);
    };

    m.backdrop.addEventListener(
      "cirkit-modal:closing",
      () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
      { once: true }
    );

    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        submit();
      }
    });

    m.setButtons([
      { label: "Cancel", kind: "ghost", onClick: () => closeWith(null) },
      {
        label: opts.submitLabel ?? "OK",
        kind: "primary",
        onClick: () => submit(),
      },
    ]);

    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  });
}

async function promptNumberModal(opts: {
  title: string;
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  submitLabel?: string;
}): Promise<number | null> {
  return await new Promise((resolve) => {
    const m = showModal({
      title: opts.title,
      bodyHTML: `
        <div class="cirkit-modal-form">
          ${
            opts.hint
              ? `<div class="cirkit-modal-help">${escapeHtml(opts.hint)}</div>`
              : ""
          }
          <div class="cirkit-slider-group">
            <div class="cirkit-slider-head">
              <label class="cirkit-field-label">${escapeHtml(opts.label)}</label>
              <div class="cirkit-slider-readout"></div>
            </div>
            <div class="cirkit-slider-controls">
              <input class="cirkit-slider-range" type="range" min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}" />
              <input class="cirkit-slider-number" type="number" min="${opts.min}" max="${opts.max}" step="${opts.step}" value="${opts.value}" />
            </div>
          </div>
        </div>
      `,
    });

    let settled = false;
    const rangeEl = m.modal.querySelector<HTMLInputElement>(".cirkit-slider-range")!;
    const numberEl = m.modal.querySelector<HTMLInputElement>(".cirkit-slider-number")!;
    const readoutEl = m.modal.querySelector<HTMLDivElement>(".cirkit-slider-readout")!;

    const sync = (raw: number) => {
      const value = clamp(raw, opts.min, opts.max);
      rangeEl.value = String(value);
      numberEl.value = String(value);
      readoutEl.textContent = opts.suffix ? `${value}${opts.suffix}` : String(value);
      return value;
    };

    const closeWith = (value: number | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      m.close();
    };

    m.backdrop.addEventListener(
      "cirkit-modal:closing",
      () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
      { once: true }
    );

    rangeEl.addEventListener("input", () => {
      sync(Number(rangeEl.value));
    });
    numberEl.addEventListener("input", () => {
      sync(Number(numberEl.value || opts.min));
    });
    numberEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        closeWith(sync(Number(numberEl.value || opts.min)));
      }
    });

    sync(opts.value);

    m.setButtons([
      { label: "Cancel", kind: "ghost", onClick: () => closeWith(null) },
      {
        label: opts.submitLabel ?? "OK",
        kind: "primary",
        onClick: () => closeWith(sync(Number(numberEl.value || opts.min))),
      },
    ]);
  });
}

async function promptDisplaySizeModal(current: {
  width: number;
  height: number;
}): Promise<{ width: number; height: number } | null> {
  return await new Promise((resolve) => {
    const m = showModal({
      title: "Display Size",
      bodyHTML: `
        <div class="cirkit-modal-form">
          <div class="cirkit-modal-help">
            Resize the display without typing awkward values. Inputs still map left-to-right, top-to-bottom.
          </div>
          <div class="cirkit-display-size-summary">
            <span>Preview</span>
            <strong class="cirkit-display-size-readout"></strong>
          </div>
          <div class="cirkit-display-size-preview"></div>
          <div class="cirkit-display-size-preview-note"></div>
          <div class="cirkit-stepper-group">
            <div class="cirkit-slider-head">
              <label class="cirkit-field-label">Width</label>
              <div class="cirkit-slider-readout" data-size-readout="width"></div>
            </div>
            <div class="cirkit-stepper-controls">
              <button type="button" class="cirkit-stepper-btn" data-stepper="width" data-stepper-dir="-1">-</button>
              <input class="cirkit-slider-number" data-size-number="width" type="number" min="${MIN_DISPLAY_SIDE}" step="1" value="${current.width}" />
              <button type="button" class="cirkit-stepper-btn" data-stepper="width" data-stepper-dir="1">+</button>
            </div>
          </div>
          <div class="cirkit-stepper-group">
            <div class="cirkit-slider-head">
              <label class="cirkit-field-label">Height</label>
              <div class="cirkit-slider-readout" data-size-readout="height"></div>
            </div>
            <div class="cirkit-stepper-controls">
              <button type="button" class="cirkit-stepper-btn" data-stepper="height" data-stepper-dir="-1">-</button>
              <input class="cirkit-slider-number" data-size-number="height" type="number" min="${MIN_DISPLAY_SIDE}" step="1" value="${current.height}" />
              <button type="button" class="cirkit-stepper-btn" data-stepper="height" data-stepper-dir="1">+</button>
            </div>
          </div>
        </div>
      `,
    });

    let settled = false;
    const previewEl =
      m.modal.querySelector<HTMLDivElement>(".cirkit-display-size-preview")!;
    const previewNoteEl =
      m.modal.querySelector<HTMLDivElement>(".cirkit-display-size-preview-note")!;
    const readoutEl =
      m.modal.querySelector<HTMLHeadingElement>(".cirkit-display-size-readout")!;
    const widthNumber =
      m.modal.querySelector<HTMLInputElement>('[data-size-number="width"]')!;
    const heightNumber =
      m.modal.querySelector<HTMLInputElement>('[data-size-number="height"]')!;
    const widthReadout =
      m.modal.querySelector<HTMLDivElement>('[data-size-readout="width"]')!;
    const heightReadout =
      m.modal.querySelector<HTMLDivElement>('[data-size-readout="height"]')!;
    const stepperButtons = Array.from(
      m.modal.querySelectorAll<HTMLButtonElement>(".cirkit-stepper-btn")
    );

    const syncField = (value: number, numberEl: HTMLInputElement, fallback: number) => {
      const next = Math.max(
        MIN_DISPLAY_SIDE,
        Math.round(Number.isFinite(value) ? value : fallback)
      );
      numberEl.value = String(next);
      return next;
    };

    const syncPreview = () => {
      const width = syncField(Number(widthNumber.value || current.width), widthNumber, current.width);
      const height = syncField(
        Number(heightNumber.value || current.height),
        heightNumber,
        current.height
      );
      widthReadout.textContent = `${width} px`;
      heightReadout.textContent = `${height} px`;
      readoutEl.textContent = `${width} x ${height}`;
      const previewWidth = Math.min(width, 12);
      const previewHeight = Math.min(height, 12);
      previewEl.style.gridTemplateColumns = `repeat(${previewWidth}, 1fr)`;
      previewEl.innerHTML = "";
      for (let i = 0; i < previewWidth * previewHeight; i++) {
        const cell = document.createElement("div");
        cell.className = "cirkit-display-size-cell";
        previewEl.appendChild(cell);
      }
      previewNoteEl.textContent =
        width * height > 400
          ? "Large displays work, but very big ones will cost more performance."
          : width > previewWidth || height > previewHeight
            ? `Preview is capped at ${previewWidth} x ${previewHeight}, but the actual display can be larger.`
            : "Full preview shown.";
      return { width, height };
    };

    const closeWith = (value: { width: number; height: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
      m.close();
    };

    m.backdrop.addEventListener(
      "cirkit-modal:closing",
      () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
      { once: true }
    );

    [widthNumber, heightNumber].forEach((input) => {
      input.addEventListener("input", () => {
        syncPreview();
      });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          closeWith(syncPreview());
        }
      });
    });

    stepperButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const target = button.dataset.stepper;
        const dir = Number(button.dataset.stepperDir || "0");
        const input = target === "width" ? widthNumber : heightNumber;
        const currentValue = Math.max(MIN_DISPLAY_SIDE, Number(input.value || 1));
        input.value = String(currentValue + dir);
        syncPreview();
      });
    });

    syncPreview();

    m.setButtons([
      { label: "Cancel", kind: "ghost", onClick: () => closeWith(null) },
      {
        label: "Apply",
        kind: "primary",
        onClick: () => closeWith(syncPreview()),
      },
    ]);
  });
}

async function promptKeyConfigModal(current: {
  keyChar: string;
  keyMode: "toggle" | "hold" | "pulse";
}): Promise<{ keyChar: string; keyMode: "toggle" | "hold" | "pulse" } | null> {
  return await new Promise((resolve) => {
    const m = showModal({
      title: "Configure Key",
      bodyHTML: `
        <div class="cirkit-modal-form">
          <div class="cirkit-modal-help">
            Pick a key and how it should behave. Hold is best for live controls, pulse is best for taps.
          </div>
          <div class="cirkit-field-group">
            <label class="cirkit-field-label">Key</label>
            <input class="cirkit-key-prompt" type="text" maxlength="1" value="${escapeHtml(
              current.keyChar
            )}" />
          </div>
          <div class="cirkit-field-group">
            <label class="cirkit-field-label">Mode</label>
            <select class="cirkit-key-mode">
              <option value="toggle">Toggle</option>
              <option value="hold">Hold</option>
              <option value="pulse">Pulse</option>
            </select>
          </div>
          <div class="cirkit-field-error" style="display:none;"></div>
        </div>
      `,
    });

    let settled = false;
    const keyEl = m.modal.querySelector<HTMLInputElement>(".cirkit-key-prompt")!;
    const modeEl = m.modal.querySelector<HTMLSelectElement>(".cirkit-key-mode")!;
    const errorEl = m.modal.querySelector<HTMLDivElement>(".cirkit-field-error")!;
    modeEl.value = current.keyMode;

    const closeWith = (
      value: { keyChar: string; keyMode: "toggle" | "hold" | "pulse" } | null
    ) => {
      if (settled) return;
      settled = true;
      resolve(value);
      m.close();
    };

    const submit = () => {
      const keyChar = (keyEl.value.trim().slice(0, 1) || current.keyChar || "a").toLowerCase();
      const keyMode = modeEl.value as "toggle" | "hold" | "pulse";
      if (!keyChar) {
        errorEl.textContent = "Pick a single key.";
        errorEl.style.display = "";
        return;
      }
      closeWith({ keyChar, keyMode });
    };

    m.backdrop.addEventListener(
      "cirkit-modal:closing",
      () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      },
      { once: true }
    );

    keyEl.addEventListener("input", () => {
      keyEl.value = keyEl.value.slice(0, 1);
    });
    keyEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        submit();
      }
    });

    m.setButtons([
      { label: "Cancel", kind: "ghost", onClick: () => closeWith(null) },
      { label: "Apply", kind: "primary", onClick: () => submit() },
    ]);

    window.setTimeout(() => {
      keyEl.focus();
      keyEl.select();
    }, 0);
  });
}


// =======================
// Save to Account (FIX)
// =======================

function openSaveToAccountModal() {
  if (!currentUser) {
    toast("Sign in first to save online.");
    showOverlay(accountOverlay);
    void refreshMe();
    return;
  }

  const bodyHTML = `
    <div style="display:grid;gap:10px;">
      <div style="display:grid;gap:6px;">
        <label style="font-size:12px;color:#4b5563;">Title</label>
        <input class="saveacc-title" type="text" value="${escapeHtml(currentCircuitTitle || "Untitled")}" />
      </div>

      <div style="display:grid;gap:6px;">
        <label style="font-size:12px;color:#4b5563;">Visibility</label>
        <select class="saveacc-vis">
          <option value="private">Private (only you)</option>
          <option value="preview">Preview (view-only)</option>
          <option value="open">Open (community)</option>
        </select>
      </div>

      <div style="font-size:12px;color:#6b7280;line-height:1.3;">
        Saving creates a <b>new</b> circuit every time and then resets your workspace.
      </div>
    </div>
  `;

  const m = showModal({ title: "Save to Account", bodyHTML });

  const visEl = m.modal.querySelector<HTMLSelectElement>(".saveacc-vis");
  if (visEl) visEl.value = currentCircuitVisibility || "private";

  m.setButtons([
    { label: "Cancel", kind: "ghost", onClick: ({ close }) => close() },
    {
      label: "Save Online",
      kind: "primary",
      onClick: async ({ close, modal }) => {
        const titleEl = modal.querySelector<HTMLInputElement>(".saveacc-title");
        const visEl2 = modal.querySelector<HTMLSelectElement>(".saveacc-vis");

        const title = titleEl?.value.trim() || "Untitled";
        const visibility = (visEl2?.value as any) || "private";

        try {
          // IMPORTANT: no id here => server always creates a new circuit
          const payload = {
            title,
            visibility,
            data: makeSaveObject(),
          };

          await api<ServerCircuit>("/api/circuits", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });

          close();
          toast("Saved to your account. Workspace reset.");

          // hard reset (including ICs in the left column)
          resetWorkspaceHard();

          // refresh list so user sees it immediately
          void refreshMyCircuits();

          // not editing after reset
          setEditingLabel(null);

          // (optional) if you ever want to show “Editing …” only when opening:
          // setEditingLabel(null);
        } catch (err) {
          console.error(err);
          toast("Save failed. Is the server running?");
        }
      },
    },
  ]);

  const titleInput = m.modal.querySelector<HTMLInputElement>(".saveacc-title");
  titleInput?.focus();
  titleInput?.select();
}



// Basic escaping so title doesn’t break HTML
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;";
    if (c === "<") return "&lt;";
    if (c === ">") return "&gt;";
    if (c === '"') return "&quot;";
    return "&#039;";
  });
}

saveAccountButton.addEventListener("click", () => {
  openSaveToAccountModal();
});

// --- Global nav buttons (Workspace / Community / Account) ---
const globalNav = document.createElement("div");
globalNav.className = "global-nav";
globalNav.innerHTML = `
  <button type="button" class="nav-btn nav-workspace" title="Back to editor">Editor</button>
  <button type="button" class="nav-btn nav-community" title="Browse circuits shared by others">Explore</button>
  <button type="button" class="nav-btn nav-account" title="Sign in and manage your saved circuits">My Account</button>
`;

document.body.appendChild(globalNav);

const navWorkspaceBtn =
  globalNav.querySelector<HTMLButtonElement>(".nav-workspace")!;
const navCommunityBtn =
  globalNav.querySelector<HTMLButtonElement>(".nav-community")!;
const navAccountBtn =
  globalNav.querySelector<HTMLButtonElement>(".nav-account")!;

// --- Community overlay ---
const communityOverlay = document.createElement("div");
communityOverlay.className = "overlay overlay-community hidden";
communityOverlay.innerHTML = `
  <div class="overlay-panel">
    <div class="overlay-header">
      <h2>Community</h2>
      <div class="overlay-header-actions">
        <button type="button" class="community-refresh">Refresh</button>
        <button type="button" class="overlay-close">&times;</button>
      </div>
    </div>
    <div class="overlay-body">
      <div class="community-list"></div>
    </div>
  </div>
`;
document.body.appendChild(communityOverlay);

const communityListEl =
  communityOverlay.querySelector<HTMLDivElement>(".community-list")!;
const communityRefreshBtn =
  communityOverlay.querySelector<HTMLButtonElement>(".community-refresh")!;
const communityCloseBtn =
  communityOverlay.querySelector<HTMLButtonElement>(".overlay-close")!;

// --- Account overlay (Google Sign-In only) ---
const accountOverlay = document.createElement("div");
accountOverlay.className = "overlay overlay-account hidden";
accountOverlay.innerHTML = `
  <div class="overlay-panel">
    <div class="overlay-header">
      <h2>Account</h2>
      <div class="overlay-header-actions">
        <button type="button" class="overlay-close">&times;</button>
      </div>
    </div>
    <div class="overlay-body">
      <div class="account-unauth">
        <div style="font-size:12px;color:#6b7280;margin-bottom:10px;">
          Sign in with Google to save and share circuits.
        </div>
        <div class="google-signin-slot"></div>
        <div class="google-signin-error" style="display:none;font-size:12px;color:#b91c1c;margin-top:8px;"></div>
      </div>

      <div class="account-auth" style="display:none;">
        <div class="account-info" style="display:flex;align-items:center;gap:10px;">
          <img class="account-avatar" style="width:28px;height:28px;border-radius:999px;display:none;" />
          <div>
            Logged in as <span class="account-nickname"></span>
            <div style="font-size:12px;color:#6b7280;"><span class="account-username"></span></div>
          </div>
        </div>
        <div class="account-buttons" style="margin-top:10px;">
          <button type="button" class="account-logout">Log out</button>
        </div>
      </div>

      <div class="account-circuits" style="margin-top:12px;">
        <div class="account-circuit-header">
          <h3>My Circuits</h3>
          <button type="button" class="account-refresh-circuits">Refresh</button>
        </div>
        <div class="account-circuit-list"></div>
      </div>
    </div>
  </div>
`;
document.body.appendChild(accountOverlay);

const accountCloseBtn =
  accountOverlay.querySelector<HTMLButtonElement>(".overlay-close")!;
const unauthSection =
  accountOverlay.querySelector<HTMLDivElement>(".account-unauth")!;
const authSection =
  accountOverlay.querySelector<HTMLDivElement>(".account-auth")!;
const accountNicknameSpan =
  accountOverlay.querySelector<HTMLSpanElement>(".account-nickname")!;
const accountUsernameSpan =
  accountOverlay.querySelector<HTMLSpanElement>(".account-username")!;
const accountAvatarImg =
  accountOverlay.querySelector<HTMLImageElement>(".account-avatar")!;
const googleSlot =
  accountOverlay.querySelector<HTMLDivElement>(".google-signin-slot")!;
const googleErr =
  accountOverlay.querySelector<HTMLDivElement>(".google-signin-error")!;
const accountLogoutBtn =
  accountOverlay.querySelector<HTMLButtonElement>(".account-logout")!;
const accountRefreshCircuitsBtn =
  accountOverlay.querySelector<HTMLButtonElement>(".account-refresh-circuits")!;
const accountCircuitListEl =
  accountOverlay.querySelector<HTMLDivElement>(".account-circuit-list")!;

// --- Overlay helpers ---
function showOverlay(el: HTMLElement) {
  el.classList.remove("hidden");
}
function hideOverlay(el: HTMLElement) {
  el.classList.add("hidden");
}

// --- Nav button behavior ---
navWorkspaceBtn.addEventListener("click", () => {
  hideOverlay(communityOverlay);
  hideOverlay(accountOverlay);
});

navCommunityBtn.addEventListener("click", () => {
  hideOverlay(accountOverlay);
  showOverlay(communityOverlay);
  void refreshCommunity();
});

navAccountBtn.addEventListener("click", () => {
  hideOverlay(communityOverlay);
  showOverlay(accountOverlay);
  void refreshMe();
  void refreshMyCircuits();
});

communityCloseBtn.addEventListener("click", (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  hideOverlay(communityOverlay);
});
accountCloseBtn.addEventListener("click", () => hideOverlay(accountOverlay));

communityOverlay.addEventListener("click", (ev) => {
  if (ev.target === communityOverlay) hideOverlay(communityOverlay);
});
accountOverlay.addEventListener("click", (ev) => {
  if (ev.target === accountOverlay) hideOverlay(accountOverlay);
});

// =======================
// Google Sign-In (GIS)
// =======================
// You must set VITE_GOOGLE_CLIENT_ID in your frontend env (.env file).
const GOOGLE_CLIENT_ID =
  (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || "";

function loadGoogleGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google && w.google.accounts && w.google.accounts.id) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load error")));
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load error"));
    document.head.appendChild(s);
  });
}

let googleRendered = false;

async function initGoogleSignInIfNeeded() {
  if (googleRendered) return;
  googleRendered = true;

  if (!GOOGLE_CLIENT_ID) {
    googleErr.style.display = "";
    googleErr.textContent =
      "Missing VITE_GOOGLE_CLIENT_ID. Add it to your frontend env and restart.";
    return;
  }

  try {
    await loadGoogleGsiScript();
    const w = window as any;

    w.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: async (resp: { credential?: string }) => {
        try {
          googleErr.style.display = "none";
          const credential = resp.credential;
          if (!credential) throw new Error("Missing credential");

          const user = await api<CurrentUser>("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential }),
          });

          currentUser = user;
          applyAccountUI();
          await refreshMyCircuits();
        } catch (e) {
          console.error(e);
          googleErr.style.display = "";
          googleErr.textContent = "Google sign-in failed.";
          currentUser = null;
          applyAccountUI();
        }
      },
    });

    // Render button
    w.google.accounts.id.renderButton(googleSlot, {
      theme: "outline",
      size: "large",
      width: 260,
      text: "signin_with",
      shape: "pill",
    });

    // Optional: one tap
    // w.google.accounts.id.prompt();
  } catch (e) {
    console.error(e);
    googleErr.style.display = "";
    googleErr.textContent = "Failed to load Google Sign-In.";
  }
}

// --- Account state -> UI ---
function applyAccountUI() {
  if (currentUser) {
    unauthSection.style.display = "none";
    authSection.style.display = "";
    accountNicknameSpan.textContent = currentUser.nickname;
    accountUsernameSpan.textContent = currentUser.username;

    const pic = (currentUser as any).picture;
    if (pic && accountAvatarImg) {
      accountAvatarImg.src = pic;
      accountAvatarImg.style.display = "";
    } else if (accountAvatarImg) {
      accountAvatarImg.style.display = "none";
    }
  } else {
    unauthSection.style.display = "";
    authSection.style.display = "none";
    // ensure the Google button exists
    void initGoogleSignInIfNeeded();
  }
  updateUnsavedWarning();
}

// Check if already logged in (cookie)
async function refreshMe() {
  try {
    const me = await api<CurrentUser>("/api/me");
    currentUser = me;
  } catch {
    currentUser = null;
  }
  applyAccountUI();
}

// --- Logout ---
accountLogoutBtn.addEventListener("click", async () => {
  try {
    await api<{ ok: boolean }>("/api/logout", { method: "POST" });
  } catch {
    // ignore
  }
  currentUser = null;
  applyAccountUI();
  accountCircuitListEl.innerHTML = "";
});

// --- Load circuit from server by id ---
async function openCircuitFromServer(id: number) {
  try {
    const c = await api<ServerCircuit>("/api/circuits/" + id);
    loadFromObject(c.data);
    currentCircuitTitle = c.title;
    currentCircuitVisibility = c.visibility;

    if (currentUser && currentUser.id === c.ownerId) setEditingLabel(c.title);
    else setEditingLabel(null);

    setPreviewMode(false);
    hideContextMenu();
    clearSelection();
  } catch (err) {
    console.error(err);
    toast("Failed to open circuit.");
  }
}
void openStartupContentFromUrlParam();

function openCircuitInNewTab(id: number) {
  const url = new URL(window.location.href);
  url.searchParams.set("openCircuitId", String(id));
  window.open(url.toString(), "_blank", "noopener");
}

async function openCircuitFromUrlParam() {
  const url = new URL(window.location.href);
  const idStr = url.searchParams.get("openCircuitId");
  if (!idStr) return;

  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) return;

  try {
    await openCircuitFromServer(id);
  } finally {
    url.searchParams.delete("openCircuitId");
    history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash);
  }
}

async function openStartupContentFromUrlParam() {
  const url = new URL(window.location.href);
  const tutorialKey = url.searchParams.get("tutorial");

  if (tutorialKey === "basics") {
    loadFromObject(buildTutorialSaveObject());
    currentCircuitTitle = "Tutorial";
    currentCircuitVisibility = "private";
    setEditingLabel(null);
    setPreviewMode(true);
    url.searchParams.delete("tutorial");
    history.replaceState(
      {},
      "",
      url.pathname +
        (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
        url.hash
    );
    return;
  }

  await openCircuitFromUrlParam();
}


// --- My circuits list ---
async function refreshMyCircuits() {
  if (!currentUser) {
    accountCircuitListEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">Sign in to see your circuits.</div>';
    return;
  }

  let list: ServerCircuitSummary[] = [];
  try {
    list = await api<ServerCircuitSummary[]>("/api/my-circuits");
  } catch (err) {
    console.error(err);
    accountCircuitListEl.innerHTML =
      '<div style="font-size:12px;color:#b91c1c;">Failed to load circuits.</div>';
    return;
  }

  if (!list.length) {
    accountCircuitListEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">No circuits saved yet. Use "Save to Account" from the workspace.</div>';
    return;
  }

  const shell = buildGalleryShell({
    container: accountCircuitListEl,
    title: "My Circuits",
    subtitle: "Your saved projects (with previews).",
    searchPlaceholder: "Search your circuits…",
    extraRightHTML: `<button type="button" class="gallery-refresh">Refresh</button>`,
  });

  const refreshBtn = accountCircuitListEl.querySelector<HTMLButtonElement>(".gallery-refresh");
  refreshBtn?.addEventListener("click", () => void refreshMyCircuits());

  // render initial cards (skeleton thumbs)
  shell.gridEl.innerHTML = "";
  const cardEls: HTMLDivElement[] = [];

  function renderCards(filtered: ServerCircuitSummary[]) {
    shell.gridEl.innerHTML = "";
    cardEls.length = 0;

    filtered.forEach((c) => {
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.dataset.circuitId = String(c.id);

      card.innerHTML = `
        <div class="thumb-wrap">
          <div class="thumb-skeleton"></div>
          <img class="thumb-img" alt="Circuit preview" style="display:none;" />
        </div>
        <div class="card-body">
          <div class="card-title"></div>
          <div class="card-meta"></div>
        </div>
        <div class="card-actions">
          <button type="button" class="card-btn primary">Open</button>
          <button type="button" class="card-btn">Download</button>
        </div>
      `;

      (card.querySelector(".card-title") as HTMLDivElement).textContent = c.title;
      (card.querySelector(".card-meta") as HTMLDivElement).textContent =
        `Visibility: ${formatVisibility(c.visibility)}`;

      const openBtn = card.querySelector<HTMLButtonElement>(".card-btn.primary")!;
      openBtn.addEventListener("click", () => {
        openCircuitInNewTab(c.id);
      });
      

      const dlBtn = card.querySelector<HTMLButtonElement>(".card-btn:not(.primary)")!;
      dlBtn.addEventListener("click", async () => {
        try {
          const full = await api<ServerCircuit>("/api/circuits/" + c.id);
          const json = JSON.stringify(full.data, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${(c.title || "cirkit").replace(/[^\w\-]+/g, "_")}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.error(e);
          toast("Download failed.");
        }
      });

      shell.gridEl.appendChild(card);
      cardEls.push(card);
    });

    // fetch thumbs with concurrency; update cards in-place
    void runWithConcurrency(filtered, 4, async (c) => {
      const url = await getCircuitThumbById(c.id, c.title);
      const card = shell.gridEl.querySelector<HTMLDivElement>(
        `.gallery-card[data-circuit-id="${c.id}"]`
      );
      if (!card) return;
      const img = card.querySelector<HTMLImageElement>(".thumb-img")!;
      const skel = card.querySelector<HTMLDivElement>(".thumb-skeleton")!;
      img.src = url;
      img.style.display = "";
      skel.style.display = "none";
    });
  }

  // initial render
  renderCards(list);

  // search filter
  shell.searchEl.addEventListener("input", () => {
    const q = shell.searchEl.value.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((c) => (c.title || "").toLowerCase().includes(q));
    renderCards(filtered);
  });
}


accountRefreshCircuitsBtn.addEventListener("click", () => {
  void refreshMyCircuits();
});

// --- Community list ---
async function refreshCommunity() {
  let list: ServerCircuitSummary[] = [];
  try {
    list = await api<ServerCircuitSummary[]>("/api/community");
  } catch (err) {
    console.error(err);
    communityListEl.innerHTML =
      '<div style="font-size:12px;color:#b91c1c;">Failed to load community circuits.</div>';
    return;
  }

  if (!list.length) {
    communityListEl.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">No shared circuits yet.</div>';
    return;
  }

  const shell = buildGalleryShell({
    container: communityListEl,
    title: "Explore",
    subtitle: "Community circuits (with previews).",
    searchPlaceholder: "Search community…",
    extraRightHTML: `<button type="button" class="gallery-refresh">Refresh</button>`,
  });

  const refreshBtn = communityListEl.querySelector<HTMLButtonElement>(".gallery-refresh");
  refreshBtn?.addEventListener("click", () => void refreshCommunity());

  function renderCards(filtered: ServerCircuitSummary[]) {
    shell.gridEl.innerHTML = "";

    filtered.forEach((c) => {
      const card = document.createElement("div");
      card.className = "gallery-card";
      card.dataset.circuitId = String(c.id);

      const badge =
        c.visibility === "open"
          ? "Open"
          : c.visibility === "preview"
          ? "Preview"
          : "Private";

      card.innerHTML = `
        <div class="thumb-wrap">
          <div class="thumb-skeleton"></div>
          <img class="thumb-img" alt="Circuit preview" style="display:none;" />
          <div class="thumb-badge">${badge}</div>
        </div>
        <div class="card-body">
          <div class="card-title"></div>
          <div class="card-meta"></div>
        </div>
        <div class="card-actions">
          <button type="button" class="card-btn primary">Open</button>
          <button type="button" class="card-btn">Copy ID</button>
        </div>
      `;

      (card.querySelector(".card-title") as HTMLDivElement).textContent = c.title;
      (card.querySelector(".card-meta") as HTMLDivElement).textContent = `User #${c.ownerId}`;

      const openBtn = card.querySelector<HTMLButtonElement>(".card-btn.primary")!;
      openBtn.addEventListener("click", () => {
        openCircuitInNewTab(c.id);
      });
      

      const copyBtn = card.querySelector<HTMLButtonElement>(".card-btn:not(.primary)")!;
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(c.id));
          toast("Copied ID.");
        } catch {
          toast("Copy failed.");
        }
      });

      shell.gridEl.appendChild(card);
    });

    void runWithConcurrency(filtered, 4, async (c) => {
      const url = await getCircuitThumbById(c.id, c.title);
      const card = shell.gridEl.querySelector<HTMLDivElement>(
        `.gallery-card[data-circuit-id="${c.id}"]`
      );
      if (!card) return;
      const img = card.querySelector<HTMLImageElement>(".thumb-img")!;
      const skel = card.querySelector<HTMLDivElement>(".thumb-skeleton")!;
      img.src = url;
      img.style.display = "";
      skel.style.display = "none";
    });
  }

  renderCards(list);

  shell.searchEl.addEventListener("input", () => {
    const q = shell.searchEl.value.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((c) => (c.title || "").toLowerCase().includes(q));
    renderCards(filtered);
  });
}


communityRefreshBtn.addEventListener("click", () => {
  void refreshCommunity();
});

// --- Save current circuit to account ---
// (keep your existing save dialog below; it expects saveAccountButton/currentUser/etc)

// Try to pull existing session on load
void refreshMe();



// ===== IC Toolbox types =====
interface ToolboxEntrySummary {
  id: number;
  name: string;
  ownerId: number;
  createdAt: number;
}

interface ToolboxEntry extends ToolboxEntrySummary {
  description?: string;
  data: SaveFileV1;
}

// ===== IC Toolbox overlay =====
const icToolboxOverlay = document.createElement("div");
icToolboxOverlay.className = "overlay overlay-toolbox hidden";
icToolboxOverlay.innerHTML = `
  <div class="overlay-panel">
    <div class="overlay-header">
      <h2>IC TOOLBOX</h2>
      <div class="overlay-header-actions">
        <button type="button" class="toolbox-refresh">Refresh</button>
        <button type="button" class="overlay-close">&times;</button>
      </div>
    </div>
    <div class="overlay-body">
      <div class="toolbox-header-row">
        <div style="font-size:12px;color:#4b5563;">Shared IC modules from the community.</div>
        <button type="button" class="toolbox-upload-current">Upload current</button>
      </div>
      <div class="toolbox-list"></div>
    </div>
  </div>
`;
document.body.appendChild(icToolboxOverlay);

const icToolboxList =
  icToolboxOverlay.querySelector<HTMLDivElement>(".toolbox-list")!;
const icToolboxCloseBtn =
  icToolboxOverlay.querySelector<HTMLButtonElement>(".overlay-close")!;
const icToolboxRefreshBtn =
  icToolboxOverlay.querySelector<HTMLButtonElement>(".toolbox-refresh")!;
const icToolboxUploadBtn =
  icToolboxOverlay.querySelector<HTMLButtonElement>(".toolbox-upload-current")!;

icToolboxCloseBtn.addEventListener("click", () => {
  hideOverlay(icToolboxOverlay);
});
icToolboxOverlay.addEventListener("click", (ev) => {
  if (ev.target === icToolboxOverlay) hideOverlay(icToolboxOverlay);
});

// Add IC Toolbox nav button to the global nav
{
  const nav = document.querySelector<HTMLDivElement>(".global-nav");
  if (nav) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-btn nav-toolbox";
    btn.textContent = "IC Library";
    btn.title = "Browse and import reusable IC modules";
    
    nav.appendChild(btn);
    btn.addEventListener("click", () => {
      showOverlay(icToolboxOverlay);
      void refreshToolbox();
    });
  }
}

// Load toolbox list
async function refreshToolbox() {
  let list: ToolboxEntrySummary[] = [];
  try {
    list = await api<ToolboxEntrySummary[]>("/api/toolbox");
  } catch (err) {
    console.error(err);
    icToolboxList.innerHTML =
      '<div style="font-size:12px;color:#b91c1c;">Failed to load IC toolbox.</div>';
    return;
  }

  if (!list.length) {
    icToolboxList.innerHTML =
      '<div style="font-size:12px;color:#6b7280;">No IC entries yet. Upload your current circuit to share one.</div>';
    return;
  }

  const shell = buildGalleryShell({
    container: icToolboxList,
    title: "IC Library",
    subtitle: "Reusable IC modules (block + inside preview).",
    searchPlaceholder: "Search IC library…",
    extraRightHTML: `
      <button type="button" class="gallery-refresh">Refresh</button>
    `,
  });

  const refreshBtn = icToolboxList.querySelector<HTMLButtonElement>(".gallery-refresh");
  refreshBtn?.addEventListener("click", () => void refreshToolbox());

  function renderCards(filtered: ToolboxEntrySummary[]) {
    shell.gridEl.innerHTML = "";

    filtered.forEach((entry) => {
      const card = document.createElement("div");
      card.className = "gallery-card gallery-card-ic";
      card.dataset.toolboxId = String(entry.id);

      const created = new Date(entry.createdAt);

      card.innerHTML = `
        <div class="thumb-two">
          <div class="thumb-wrap small">
            <div class="thumb-label">Block</div>
            <div class="thumb-skeleton"></div>
            <img class="thumb-img thumb-block" alt="IC block preview" style="display:none;" />
          </div>
          <div class="thumb-wrap small">
            <div class="thumb-label">Inside</div>
            <div class="thumb-skeleton"></div>
            <img class="thumb-img thumb-inside" alt="IC inside preview" style="display:none;" />
          </div>
        </div>

        <div class="card-body">
          <div class="card-title"></div>
          <div class="card-meta"></div>
        </div>

        <div class="card-actions">
          <button type="button" class="card-btn primary">Import</button>
          <button type="button" class="card-btn">Copy ID</button>
        </div>
      `;

      (card.querySelector(".card-title") as HTMLDivElement).textContent = entry.name;
      (card.querySelector(".card-meta") as HTMLDivElement).textContent =
        `User #${entry.ownerId} · ${created.toLocaleString()}`;

      const importBtn = card.querySelector<HTMLButtonElement>(".card-btn.primary")!;
      importBtn.addEventListener("click", () => {
        void openToolboxEntry(entry.id);
        hideOverlay(icToolboxOverlay);
      });

      const copyBtn = card.querySelector<HTMLButtonElement>(".card-btn:not(.primary)")!;
      copyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(String(entry.id));
          toast("Copied ID.");
        } catch {
          toast("Copy failed.");
        }
      });

      shell.gridEl.appendChild(card);
    });

    void runWithConcurrency(filtered, 4, async (entry) => {
      const thumbs = await getToolboxThumbs(entry.id);

      const card = shell.gridEl.querySelector<HTMLDivElement>(
        `.gallery-card[data-toolbox-id="${entry.id}"]`
      );
      if (!card) return;

      const blockImg = card.querySelector<HTMLImageElement>(".thumb-block")!;
      const insideImg = card.querySelector<HTMLImageElement>(".thumb-inside")!;
      const skels = card.querySelectorAll<HTMLDivElement>(".thumb-skeleton");

      blockImg.src = thumbs.block;
      insideImg.src = thumbs.inside;

      blockImg.style.display = "";
      insideImg.style.display = "";

      skels.forEach((s) => (s.style.display = "none"));
    });
  }

  renderCards(list);

  shell.searchEl.addEventListener("input", () => {
    const q = shell.searchEl.value.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((e) => (e.name || "").toLowerCase().includes(q));
    renderCards(filtered);
  });
}


icToolboxRefreshBtn.addEventListener("click", () => {
  void refreshToolbox();
});

// Open toolbox entry as a full circuit
async function openToolboxEntry(id: number) {
  try {
    // Fetch the toolbox entry (single IC board) from the server
    const entry = await api<ToolboxEntry>("/api/toolbox/" + id);

    // Do NOT wipe the current workspace.
    // Instead, turn this toolbox entry into a palette IC.
    importIcFromToolbox(entry);
  } catch (err) {
    console.error("Failed to open toolbox entry", err);
    toast("Failed to import IC from toolbox.");
  }
}



// Upload current circuit into toolbox
icToolboxUploadBtn?.addEventListener("click", async () => {
  if (!currentUser) {
    toast("Log in first to upload to the IC Library.");
    showOverlay(accountOverlay);
    return;
  }

  const defaultName = (currentCircuitTitle && String(currentCircuitTitle)) || "New IC";

  const m = showModal({
    title: "Upload to IC Library",
    bodyHTML: `
      <div style="display:grid;gap:10px;">
        <div style="font-size:12px;color:#6b7280;line-height:1.35;">
          The IC Library is for reusable modules.
          To upload, your board must contain <b>exactly one IC block</b> and <b>no wires</b>.
        </div>

        <div style="display:grid;gap:6px;">
          <label style="font-size:12px;color:#4b5563;">IC Name</label>
          <input class="toolbox-name" type="text" value="${escapeHtml(defaultName)}" />
        </div>

        <div style="font-size:12px;color:#6b7280;">
          Tip: Select nodes → Create IC → place that IC alone on a blank board → upload.
        </div>
      </div>
    `,
  });

  m.setButtons([
    { label: "Cancel", kind: "ghost", onClick: ({ close }) => close() },
    {
      label: "Upload",
      kind: "primary",
      onClick: async ({ close, modal }) => {
        const nameEl = modal.querySelector<HTMLInputElement>(".toolbox-name");
        const name = nameEl?.value.trim() || "New IC";

        try {
          const data = makeSaveObject();
          await uploadSingleIcToToolbox(data, name);
          close();
          toast("Uploaded to IC Library.");
          await refreshToolbox();
        } catch (err: any) {
          console.error(err);
          toast(err?.message || "Upload failed.");
        }
      },
    },
  ]);

  const input = m.modal.querySelector<HTMLInputElement>(".toolbox-name");
  input?.focus();
  input?.select();
});




// Small "Upload to Toolbox" button next to Save-to-account
const uploadToolboxButton = document.createElement("button");
uploadToolboxButton.type = "button";
uploadToolboxButton.className = "upload-toolbox-button";
uploadToolboxButton.textContent = "Upload to Toolbox";
saveAccountButton.insertAdjacentElement("afterend", uploadToolboxButton);
uploadToolboxButton.addEventListener("click", (ev) => {
  ev.preventDefault();
  icToolboxUploadBtn.click();
});




// ============================================================
// IC TOOLBOX HELPERS
// ============================================================
// The IC toolbox is meant to store only "single IC on empty board"
// layouts, like a blank grid with exactly one IC block, nothing else.
//
// Use `isSingleIcBoard(save)` before uploading to toolbox.
// Use `uploadSingleIcToToolbox(save, name)` as a helper.
//
// To import from toolbox without wiping the workspace, wire
// `importIcFromToolbox(entry)` into your toolbox "open" handler.
// You still need to plug this into your own IC registration
// code (registerCustomIc / addIcToPalette).
// ============================================================

/** Return true only if save.nodes contains exactly one IC node. */

/**
 * Helper to upload a single-IC board into the toolbox.
 * Call this from your toolbox upload handler instead of
 * sending arbitrary circuits.
 */


/**
 * Helper to import an IC toolbox entry as a palette IC
 * instead of wiping the workspace.
 *
 * You MUST adapt the `icDef` extraction to match how your
 * save format stores IC definitions, and call your existing
 * IC registration helper (e.g. registerCustomIc/ic).
 */
/** Return true only if save.nodes contains exactly one IC node and no wires. */

type SingleIcValidation =
  | { ok: true; icNode: NodeData; rootDef: ICDefinition }
  | { ok: false; reason: string };

function validateSingleIcBoard(save: any): SingleIcValidation {
  if (!save || typeof save !== "object") {
    return { ok: false, reason: "Invalid save data." };
  }
  if (!Array.isArray(save.nodes)) {
    return { ok: false, reason: "This board has no nodes array." };
  }
  if (!Array.isArray(save.wires)) {
    return { ok: false, reason: "This board has no wires array." };
  }

  const nodeList = save.nodes as NodeData[];
  const wireList = save.wires as any[];

  if (nodeList.length !== 1) {
    return {
      ok: false,
      reason: `IC Library upload requires exactly 1 node (the IC). This board has ${nodeList.length}.`,
    };
  }

  const only = nodeList[0];
  if (!only || only.type !== "IC") {
    return {
      ok: false,
      reason: "IC Library upload requires the only node to be an IC block.",
    };
  }

  if (wireList.length > 0) {
    return {
      ok: false,
      reason: `IC Library upload requires 0 wires. This board has ${wireList.length}.`,
    };
  }

  const defs = (save.icDefinitions || []) as ICDefinition[];
  if (!Array.isArray(defs) || defs.length === 0) {
    return {
      ok: false,
      reason: "This IC has no definition data. Make sure it’s a real IC created via “Create IC”.",
    };
  }

  if (typeof only.icDefId !== "number") {
    return {
      ok: false,
      reason: "This IC block is missing its icDefId (definition reference). Recreate the IC and try again.",
    };
  }

  const rootDef = defs.find((d) => d.id === only.icDefId);
  if (!rootDef) {
    return {
      ok: false,
      reason: "Could not find the IC definition referenced by the IC block. Recreate the IC and try again.",
    };
  }

  return { ok: true, icNode: only, rootDef };
}

async function uploadSingleIcToToolbox(save: SaveFileV1, name: string): Promise<void> {
  if (!currentUser) throw new Error("Not logged in");

  const trimmed = name.trim();
  if (!trimmed) throw new Error("Missing name");

  const v = validateSingleIcBoard(save);
  if (!v.ok) throw new Error(v.reason);

  await api<ToolboxEntry>("/api/toolbox", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trimmed, data: save }),
  });
}

function importIcFromToolbox(entry: ToolboxEntry) {
  const data = entry.data;

  const v = validateSingleIcBoard(data);
  if (!v.ok) {
    toast(v.reason);
    return;
  }

  const icNode = v.icNode;
  const defs = (data.icDefinitions || []) as ICDefinition[];

  // Map old def ids -> new def ids so nested ICs still work
  const idMap = new Map<number, number>();
  defs.forEach((oldDef) => {
    const newId = nextICId++;
    idMap.set(oldDef.id, newId);
  });

  const newDefs: ICDefinition[] = defs.map((oldDef) => {
    const newId = idMap.get(oldDef.id)!;

    const clonedNodes = oldDef.nodes.map((n) => {
      const clone: NodeData = { ...n };
      if (clone.type === "IC" && typeof clone.icDefId === "number") {
        const mapped = idMap.get(clone.icDefId);
        if (mapped != null) clone.icDefId = mapped;
      }
      return clone;
    });

    return {
      id: newId,
      name: oldDef.id === icNode.icDefId ? uniqueICName(entry.name) : oldDef.name,
      nodes: clonedNodes,
      wires: oldDef.wires.map((w) => ({ ...w })),
      inputNodeIds: [...oldDef.inputNodeIds],
      outputNodeIds: [...oldDef.outputNodeIds],
      ledNodeIds: [...oldDef.ledNodeIds],
    };
  });

  newDefs.forEach((d) => icDefinitions.push(d));

  const rootNewId = idMap.get(icNode.icDefId!);
  const rootDef = newDefs.find((d) => d.id === rootNewId);
  if (!rootDef) {
    toast("Failed to register IC from toolbox.");
    return;
  }

  addICPaletteButton(rootDef);
  toast(`IC "${rootDef.name}" added to the palette.`);
}
