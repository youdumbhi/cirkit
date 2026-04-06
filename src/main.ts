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
  | "NUMBER_DISPLAY"
  | "GUIDE"
  | "CABLE"
  | "CLOCK"
  | "DFF"
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
  titleText?: string;
  badgeText?: string;
  icDefId?: number;
  lightColor?: string;
  clockDelayMs?: number;
  bufferDelayMs?: number;
  keyChar?: string; // single char, e.g. "a"
  keyMode?: "toggle" | "hold" | "pulse";
  speakerFrequencyHz?: number;
  displayWidth?: number;
  displayHeight?: number;
  numberDigits?: number;
  guideLength?: number;
  cableChannels?: number;
  cableLength?: number;
  cableStartX?: number;
  cableStartY?: number;
  cableEndX?: number;
  cableEndY?: number;
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
  startKind: PortKind;
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

interface ICCompactLayout {
  inputColumns?: number;
  outputColumns?: number;
  portPitch?: number;
  bodyHeight?: number;
  nodeWidth?: number;
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
  paletteHidden?: boolean;
  compactLayout?: ICCompactLayout;
}

const GRID_SIZE = 24;
const DEFAULT_LIGHT_COLOR = "#27ae60";
const DEFAULT_SPEAKER_FREQUENCY_HZ = 440;
const MIN_SPEAKER_FREQUENCY_HZ = 60;
const MAX_SPEAKER_FREQUENCY_HZ = 2000;
const MAX_SPEAKER_PLAYBACK_FREQUENCY_HZ = 8000;
const SPEAKER_INPUT_WEIGHTS = [1, 2, 4, 8] as const;
const DEFAULT_DISPLAY_WIDTH = 4;
const DEFAULT_DISPLAY_HEIGHT = 4;
const MIN_DISPLAY_SIDE = 1;
const NUMBER_DISPLAY_BITS_PER_DIGIT = 4;
const DEFAULT_NUMBER_DISPLAY_DIGITS = 1;
const MIN_NUMBER_DISPLAY_DIGITS = 1;
const MAX_NUMBER_DISPLAY_DIGITS = 8;
const DEFAULT_GUIDE_LENGTH = 5;
const MIN_GUIDE_LENGTH = 2;
const MAX_GUIDE_LENGTH = 16;
const GUIDE_THICKNESS = 28;
const GUIDE_SLOT_PITCH = GRID_SIZE;
const GUIDE_SLOT_HOLE_SIZE = 12;
const GUIDE_BODY_PADDING = 8;
const DEFAULT_CABLE_CHANNELS = 4;
const MIN_CABLE_CHANNELS = 1;
const MAX_CABLE_CHANNELS = 96;
const DEFAULT_CABLE_LENGTH = 168;
const MIN_CABLE_LENGTH = 96;
const MAX_CABLE_LENGTH = 720;
const CABLE_END_WIDTH = 22;
const CABLE_SOCKET_SIZE = 16;
const CABLE_CHANNEL_PITCH = 22;
const CABLE_PADDING_Y = 12;
const CABLE_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"] as const;
const DISPLAY_HEADER_HEIGHT = 24;
const DISPLAY_BODY_PADDING_X = 12;
const DISPLAY_BODY_PADDING_Y = 10;
const DISPLAY_PORT_SIZE = 10;
const DISPLAY_PORT_GAP = 4;
const DISPLAY_SCREEN_PIXEL_SIZE = 14;
const DISPLAY_SCREEN_PIXEL_GAP = 3;
const DISPLAY_SCREEN_FRAME = 12;
const DISPLAY_SECTION_GAP = 14;
const TIC_TAC_TOE_BOARD_SIZE = 3;
const WORKSPACE_BASE_WIDTH = 3200;
const WORKSPACE_BASE_HEIGHT = 6200;
const MIN_WORKSPACE_ZOOM = 0.35;
const MAX_WORKSPACE_ZOOM = 2.5;

interface SpeakerLayout {
  nodeWidth: number;
  nodeHeight: number;
  bodyHeight: number;
  iconX: number;
  iconY: number;
  portPlacements: {
    index: number;
    x: number;
    y: number;
    label: string;
    labelX: number;
    labelY: number;
    labelWeight: number;
  }[];
}

function getSpeakerIconMarkup(variant: "workspace" | "palette" = "workspace"): string {
  return `
    <div class="speaker-icon speaker-icon-${variant}">
      <div class="speaker-cabinet">
        <div class="speaker-driver speaker-driver-small"></div>
        <div class="speaker-driver speaker-driver-main"></div>
      </div>
      <div class="speaker-wave-stack" aria-hidden="true">
        <span class="speaker-wave-band speaker-wave-band-1"></span>
        <span class="speaker-wave-band speaker-wave-band-2"></span>
        <span class="speaker-wave-band speaker-wave-band-3"></span>
      </div>
    </div>
  `;
}

function getPaletteDisplayIconMarkup(): string {
  const litPixels = new Set([0, 2, 5, 6, 8, 11]);
  const pixels = Array.from({ length: 12 }, (_, index) => {
    const isOn = litPixels.has(index) ? " is-on" : "";
    return `<div class="palette-display-pixel${isOn}"></div>`;
  }).join("");

  return `
    <div class="palette-display-icon" aria-hidden="true">
      <div class="palette-display-shell">
        <div class="palette-display-grid">${pixels}</div>
      </div>
      <div class="palette-display-stand"></div>
    </div>
  `;
}

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

interface IcDefinitionSimulationCache {
  nodeById: Map<number, NodeData>;
  relevantNodeIds: Set<number> | null;
  relevantNodeIdList: number[];
  inputIndexByNodeId: Map<number, number>;
  wireEntries: { wire: ICDefinition["wires"][number]; index: number }[];
}

const icDefinitionMap = new Map<number, ICDefinition>();
const icDefinitionSimulationCaches = new Map<number, IcDefinitionSimulationCache>();
let icDefinitionsDirty = true;

function markIcDefinitionsDirty() {
  icDefinitionsDirty = true;
  icDefinitionSimulationCaches.clear();
}

function ensureIcDefinitionCaches() {
  if (!icDefinitionsDirty) return;
  icDefinitionMap.clear();
  icDefinitions.forEach((def) => icDefinitionMap.set(def.id, def));
  icDefinitionsDirty = false;
}

function getIcDefinitionById(icDefId: number | null | undefined): ICDefinition | undefined {
  if (typeof icDefId !== "number") return undefined;
  ensureIcDefinitionCaches();
  return icDefinitionMap.get(icDefId);
}

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
let activePaletteDragCreatedNode = false;
let paletteDragPayload: { type?: NodeType; icId?: number } | null = null;
let pendingCablePlacementId: number | null = null;
let pendingCableAnchorX = 0;
let pendingCableAnchorY = 0;
let pendingIcToolboxPickResolve: ((def: ICDefinition | null) => void) | null = null;

let derivedPortValues = new Map<string, boolean>();

type SpeakerVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

interface IcRuntimeState {
  defId: number;
  nodes: Map<number, NodeData>;
  portOutputs: Map<string, boolean>;
  wireStates: boolean[];
  bufferLastInput: Map<number, boolean>;
  bufferTimeouts: Map<number, Set<number>>;
  dffLastClockInput: Map<number, boolean>;
  clockTimers: Map<number, number>;
  clockLastTickAt: Map<number, number>;
}

interface IcSpeakerState {
  key: string;
  toneValue: number;
  frequency: number;
}

// dynamic behaviours
const clockTimers = new Map<number, number>();
const clockLastTickAt = new Map<number, number>();
const bufferLastInput = new Map<number, boolean>();
const bufferTimeouts = new Map<number, Set<number>>();
const dffLastClockInput = new Map<number, boolean>();
const speakerVoices = new Map<number, SpeakerVoice>();
const icSpeakerVoices = new Map<string, SpeakerVoice>();
const icRuntimeStates = new Map<string, IcRuntimeState>();
const workspaceIcResults = new Map<number, ICResult>();
let pendingSignalRecomputeFrame: number | null = null;
let pendingSignalRecomputeTimeout: number | null = null;
let signalRecomputeEpoch = 0;

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
let pendingWireRenderFrame: number | null = null;
let pendingWireRenderForceGeometry = false;

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <div class="cirkit-app">
    <aside class="sidebar">
      <h1 class="logo">CIRKIT</h1>
      <div class="palette">
        <section class="palette-section">
          <div class="palette-section-title">Input</div>
          <div class="palette-section-grid">
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
          </div>
        </section>

        <section class="palette-section">
          <div class="palette-section-title">Output</div>
          <div class="palette-section-grid">
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
                  ${getSpeakerIconMarkup("palette")}
                </div>
              </div>
            </button>
            <button class="palette-item" data-node-type="DISPLAY">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">DISPLAY</span></div>
                <div class="node-body">
                  ${getPaletteDisplayIconMarkup()}
                </div>
              </div>
            </button>
            <button class="palette-item" data-node-type="NUMBER_DISPLAY">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">NUMBER</span></div>
                <div class="node-body">
                  <div class="palette-number-icon">
                    <div class="palette-number-digit">8</div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="palette-section">
          <div class="palette-section-title">Timing</div>
          <div class="palette-section-grid">
            <button class="palette-item" data-node-type="CLOCK">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">CLOCK</span></div>
                <div class="node-body"><div class="clock-icon"></div></div>
              </div>
            </button>
          </div>
        </section>

        <section class="palette-section">
          <div class="palette-section-title">Super Advanced</div>
          <div class="palette-section-grid">
            <button class="palette-item" data-node-type="DFF">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">DFF</span></div>
                <div class="node-body">
                  <div class="palette-dff-icon">
                    <span class="palette-dff-label palette-dff-label-d">D</span>
                    <span class="palette-dff-label palette-dff-label-clk">CLK</span>
                    <span class="palette-dff-label palette-dff-label-q">Q</span>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="palette-section">
          <div class="palette-section-title">Logic Gates</div>
          <div class="palette-section-grid">
            <button class="palette-item" data-node-type="BUFFER">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">BUFFER</span></div>
                <div class="node-body"><div class="gate-shape gate-buffer"></div></div>
              </div>
            </button>
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
          </div>
        </section>

        <section class="palette-section">
          <div class="palette-section-title">Organization</div>
          <div class="palette-section-grid">
            <button class="palette-item" data-node-type="GUIDE">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">GUIDE</span></div>
                <div class="node-body">
                  <div class="palette-guide-icon">
                    <span class="palette-guide-hole"></span>
                    <span class="palette-guide-hole"></span>
                    <span class="palette-guide-hole"></span>
                    <span class="palette-guide-hole"></span>
                  </div>
                </div>
              </div>
            </button>
            <button class="palette-item" data-node-type="CABLE">
              <div class="palette-node">
                <div class="node-header"><span class="node-title">CABLE</span></div>
                <div class="node-body">
                  <div class="palette-cable-icon">
                    <div class="palette-cable-lane" style="--lane-color:#ef4444;"></div>
                    <div class="palette-cable-lane" style="--lane-color:#3b82f6;"></div>
                    <div class="palette-cable-lane" style="--lane-color:#22c55e;"></div>
                    <div class="palette-cable-lane" style="--lane-color:#f59e0b;"></div>
                  </div>
                </div>
              </div>
            </button>
          </div>
        </section>

        <section class="palette-section palette-section-custom-ic" hidden>
          <div class="palette-section-title">Custom ICs</div>
          <div class="palette-section-grid palette-section-grid-ics"></div>
        </section>
      </div>
    </aside>
    <main class="workspace-wrapper">
      <div class="top-toolbar">
        <button class="preview-toggle" type="button" title="Switch between editing and viewing mode">Mode: Editing</button>
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
const sidebar = document.querySelector<HTMLDivElement>(".sidebar")!;
const palette = document.querySelector<HTMLDivElement>(".palette")!;
const paletteCustomIcSection =
  palette.querySelector<HTMLElement>(".palette-section-custom-ic")!;
const paletteIcGrid =
  palette.querySelector<HTMLDivElement>(".palette-section-grid-ics")!;
const paletteUploadBanner = document.createElement("div");
paletteUploadBanner.className = "palette-upload-banner";
paletteUploadBanner.hidden = true;
paletteUploadBanner.innerHTML = `
  <div class="palette-upload-copy">Select an IC from the left column to upload it.</div>
  <button type="button" class="palette-upload-cancel">Cancel</button>
`;
palette.insertAdjacentElement("beforebegin", paletteUploadBanner);
const paletteUploadCancelBtn =
  paletteUploadBanner.querySelector<HTMLButtonElement>(".palette-upload-cancel")!;
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

const icEditToolbar = document.createElement("div");
icEditToolbar.className = "ic-edit-toolbar";
icEditToolbar.hidden = true;
icEditToolbar.innerHTML = `
  <span class="ic-edit-toolbar-title"></span>
  <span class="ic-edit-toolbar-note">Changes here affect every copy of this IC already on the board.</span>
  <button type="button" class="ic-edit-toolbar-rename">Rename</button>
  <button type="button" class="ic-edit-toolbar-done">Done</button>
`;
const icEditToolbarTitle =
  icEditToolbar.querySelector<HTMLSpanElement>(".ic-edit-toolbar-title")!;
const icEditToolbarRename =
  icEditToolbar.querySelector<HTMLButtonElement>(".ic-edit-toolbar-rename")!;
const icEditToolbarDone =
  icEditToolbar.querySelector<HTMLButtonElement>(".ic-edit-toolbar-done")!;

const unsavedWarning = document.createElement("div");
unsavedWarning.className = "unsaved-warning";
unsavedWarning.hidden = true;

// put it right after the simulate button
previewToggle.insertAdjacentElement("afterend", editingIndicator);
editingIndicator.insertAdjacentElement("afterend", icEditToolbar);
icEditToolbar.insertAdjacentElement("afterend", unsavedWarning);

function setEditingLabel(title: string | null) {
  if (!title) {
    editingIndicator.textContent = "";
    return;
  }
  editingIndicator.textContent = `Editing: ${title}`;
}

function setIcEditToolbar(def: ICDefinition | null) {
  if (!def) {
    icEditToolbar.hidden = true;
    icEditToolbarTitle.textContent = "";
    return;
  }
  icEditToolbar.hidden = false;
  icEditToolbarTitle.textContent = `Editing: ${def.name}`;
}

icEditToolbarDone.addEventListener("click", () => {
  exitICEdit();
});

icEditToolbarRename.addEventListener("click", () => {
  if (editingICId == null) return;
  const def = icDefinitions.find((item) => item.id === editingICId);
  if (!def) return;
  void renameICDefinition(def);
});

paletteUploadCancelBtn.addEventListener("click", () => {
  resolvePendingIcToolboxPick(null);
});

let workspaceDirty = false;

function hasReachedWorkspaceDraftThreshold() {
  return workspaceChangeCount >= WORKSPACE_DRAFT_CHANGE_THRESHOLD;
}

function hasWorkspaceContent(): boolean {
  return (
    nodes.size > 0 ||
    wires.length > 0 ||
    notes.size > 0 ||
    icDefinitions.length > 0
  );
}

function updateUnsavedWarning() {
  const shouldShow =
    workspaceDirty && hasWorkspaceContent() && hasReachedWorkspaceDraftThreshold();
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
  const now = performance.now();
  if (now - lastWorkspaceChangeCountAt >= WORKSPACE_CHANGE_COUNT_COOLDOWN_MS) {
    workspaceChangeCount += 1;
    lastWorkspaceChangeCountAt = now;
  }
  updateUnsavedWarning();
  if (hasReachedWorkspaceDraftThreshold()) {
    scheduleWorkspaceDraftAutosave();
  }
}

function clearWorkspaceChanged() {
  workspaceDirty = false;
  workspaceChangeCount = 0;
  lastWorkspaceChangeCountAt = 0;
  if (draftAutosaveTimeoutId != null) {
    window.clearTimeout(draftAutosaveTimeoutId);
    draftAutosaveTimeoutId = null;
  }
  updateUnsavedWarning();
}

function invalidateWorkspaceDraftAutosaveCache() {
  lastDraftAutosaveKey = "";
}

function getWorkspaceDraftPayload():
  | {
      title: string;
      visibility: "private" | "preview" | "open";
      data: SaveFileV1;
      cacheKey: string;
    }
  | null {
  if (!currentUser || mode === "ic-edit" || !workspaceDirty || !hasWorkspaceContent()) {
    return null;
  }
  if (!hasReachedWorkspaceDraftThreshold()) {
    return null;
  }

  const title = (currentCircuitTitle || "Untitled").trim() || "Untitled";
  const visibility = currentCircuitVisibility || "private";
  const data = makeSaveObject();
  return {
    title,
    visibility,
    data,
    cacheKey: JSON.stringify({ title, visibility, data }),
  };
}

async function saveWorkspaceDraft(force = false) {
  const payload = getWorkspaceDraftPayload();
  if (!payload) return false;
  if (!force && payload.cacheKey === lastDraftAutosaveKey) return false;

  if (draftAutosaveInFlight) {
    queuedDraftAutosave = true;
    return false;
  }

  draftAutosaveInFlight = true;
  try {
    await api<ServerWorkspaceDraft>("/api/workspace-draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title,
        visibility: payload.visibility,
        data: payload.data,
      }),
    });
    lastDraftAutosaveKey = payload.cacheKey;
    return true;
  } catch (err) {
    console.error("Failed to autosave temp workspace", err);
    return false;
  } finally {
    draftAutosaveInFlight = false;
    if (queuedDraftAutosave) {
      queuedDraftAutosave = false;
      void saveWorkspaceDraft();
    }
  }
}

function scheduleWorkspaceDraftAutosave(delayMs = TEMP_WORKSPACE_AUTOSAVE_DELAY_MS) {
  if (!currentUser) return;
  if (draftAutosaveTimeoutId != null) {
    window.clearTimeout(draftAutosaveTimeoutId);
  }
  draftAutosaveTimeoutId = window.setTimeout(() => {
    draftAutosaveTimeoutId = null;
    void saveWorkspaceDraft();
  }, delayMs);
}

async function deleteWorkspaceDraft() {
  invalidateWorkspaceDraftAutosaveCache();
  if (!currentUser) return;
  try {
    await api<{ ok: boolean }>("/api/workspace-draft", { method: "DELETE" });
  } catch (err) {
    console.error("Failed to delete temp workspace", err);
  }
}

function saveWorkspaceDraftOnLeave() {
  const payload = getWorkspaceDraftPayload();
  if (!payload) return;
  void fetch(API_BASE + "/workspace-draft", {
    method: "PUT",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      visibility: payload.visibility,
      data: payload.data,
    }),
  }).catch(() => {});
}

function restoreWorkspaceDraft(draft: ServerWorkspaceDraft) {
  loadFromObject(draft.data);
  currentCircuitTitle = draft.title;
  currentCircuitVisibility = draft.visibility;
  setEditingLabel(null);
  setPreviewMode(false);
  hideContextMenu();
  clearSelection();
  workspaceDirty = true;
  workspaceChangeCount = WORKSPACE_DRAFT_CHANGE_THRESHOLD;
  updateUnsavedWarning();
  invalidateWorkspaceDraftAutosaveCache();
  scheduleWorkspaceDraftAutosave(1500);
}

function formatDraftUpdatedAt(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "recently";
  return date.toLocaleString();
}

async function maybePromptWorkspaceDraftRestore() {
  if (!currentUser || workspaceDraftPromptShown) return;
  workspaceDraftPromptShown = true;

  await startupContentReady.catch(() => {});

  let draft: ServerWorkspaceDraft;
  try {
    draft = await api<ServerWorkspaceDraft>("/api/workspace-draft");
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (
      message &&
      !message.toLowerCase().includes("not found") &&
      !message.toLowerCase().includes("not logged in") &&
      !message.toLowerCase().includes("invalid session")
    ) {
      console.error("Failed to load temp workspace", err);
    }
    return;
  }

  const m = showModal({
    title: "Temp Workspace Found",
    bodyHTML: `
      <div style="display:grid;gap:10px;">
        <div style="font-size:13px;line-height:1.45;color:#334155;">
          We found an unsaved temp workspace from <b>${escapeHtml(formatDraftUpdatedAt(draft.updatedAt))}</b>.
        </div>
        <div style="font-size:12px;line-height:1.4;color:#64748b;">
          Open it to keep working, or delete it if you do not need it anymore.
        </div>
      </div>
    `,
  });

  m.setButtons([
    { label: "Keep for Later", kind: "ghost", onClick: ({ close }) => close() },
    {
      label: "Delete Temp File",
      kind: "danger",
      onClick: async ({ close }) => {
        await deleteWorkspaceDraft();
        close();
        toast("Temp workspace deleted.");
      },
    },
    {
      label: "Open Temp File",
      kind: "primary",
      onClick: async ({ close }) => {
        restoreWorkspaceDraft(draft);
        close();
        await deleteWorkspaceDraft();
        toast("Temp workspace restored.");
      },
    },
  ]);
}

function setPreviewMode(nextPreviewMode: boolean) {
  previewMode = nextPreviewMode;
  previewToggle.textContent = previewMode ? "Mode: Viewing" : "Mode: Editing";
  app.classList.toggle("is-previewing", previewMode);
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

const RENAMEABLE_NODE_TYPES = new Set<NodeType>([
  "SWITCH",
  "BUTTON",
  "POWER",
  "KEY",
  "OUTPUT",
  "LED",
  "SPEAKER",
  "DISPLAY",
  "NUMBER_DISPLAY",
  "CLOCK",
]);

function isRenameableNodeType(type: NodeType): boolean {
  return RENAMEABLE_NODE_TYPES.has(type);
}

function getDefaultNodeTitle(type: NodeType): string {
  switch (type) {
    case "SWITCH":
      return "SWITCH";
    case "BUTTON":
      return "BUTTON";
    case "POWER":
      return "POWER";
    case "KEY":
      return "KEY";
    case "OUTPUT":
      return "OUTPUT";
    case "LED":
      return "LED";
    case "SPEAKER":
      return "SPEAKER";
    case "DISPLAY":
      return "DISPLAY";
    case "NUMBER_DISPLAY":
      return "NUMBER";
    case "CLOCK":
      return "CLOCK";
    default:
      return type;
  }
}

function getVisibleNodeTitle(node: Pick<NodeData, "type" | "titleText">): string {
  const custom = node.titleText?.trim();
  return custom || getDefaultNodeTitle(node.type);
}

function getNodeHeaderActionReserve(type: NodeType): number {
  let reserve = 0;
  if (isRenameableNodeType(type)) reserve += 58;
  if (type === "CLOCK" || type === "BUFFER") reserve += 50;
  return reserve;
}

function getRenameableNodeWidth(node: Pick<NodeData, "type" | "titleText" | "badgeText">): number {
  const title = getVisibleNodeTitle(node);
  const actionReserve = getNodeHeaderActionReserve(node.type);
  const badgeReserve = node.badgeText ? Math.min(34, 12 + node.badgeText.length * 6) : 0;
  const titleReserve = 48 + Math.max(0, title.length - 6) * 6;
  return clamp(Math.max(120, titleReserve + actionReserve + badgeReserve), 120, 240);
}

function getIcNodeLayout(def?: ICDefinition): {
  nodeWidth: number;
  bodyHeight: number;
  previewWidth: number;
  previewHeight: number;
} {
  const inCount = def?.inputNodeIds.length ?? 0;
  const outCount = def?.outputNodeIds.length ?? 0;
  const nameLength = (def?.name.trim().length ?? 6) || 6;
  const portPitch = Math.max(8, def?.compactLayout?.portPitch ?? 18);
  const previewWidth = 116;
  const previewHeight = 72;
  const rows = Math.max(inCount, outCount, 1);
  const portSpan = Math.max(0, rows - 1) * portPitch;
  const computedBodyHeight = 84 + portSpan;
  const bodyHeight = clamp(
    Math.max(computedBodyHeight, def?.compactLayout?.bodyHeight ?? 0),
    84,
    2400
  );
  const nodeWidth = clamp(
    def?.compactLayout?.nodeWidth ?? 152 + Math.max(0, nameLength - 6) * 6,
    20,
    480
  );

  return {
    nodeWidth,
    bodyHeight,
    previewWidth,
    previewHeight,
  };
}

function getIcPortPlacement(
  def: ICDefinition | undefined,
  role: "in" | "out",
  index: number
): { x: number; y: number } {
  const layout = getIcNodeLayout(def);
  const count = role === "in" ? def?.inputNodeIds.length ?? 0 : def?.outputNodeIds.length ?? 0;
  const portPitch = Math.max(8, def?.compactLayout?.portPitch ?? 18);
  const portSpan = Math.max(0, count - 1) * portPitch;
  const topPad = (layout.bodyHeight - portSpan) / 2;
  return {
    x: role === "in" ? 0 : layout.nodeWidth,
    y: count <= 1 ? layout.bodyHeight / 2 : topPad + index * portPitch,
  };
}

function getNodeLayoutSize(
  node: Pick<
    NodeData,
    | "type"
    | "icDefId"
    | "displayWidth"
    | "displayHeight"
    | "numberDigits"
    | "guideLength"
    | "cableChannels"
    | "cableLength"
    | "titleText"
    | "badgeText"
    | "x"
    | "y"
    | "cableStartX"
    | "cableStartY"
    | "cableEndX"
    | "cableEndY"
  >
): {
  w: number;
  h: number;
} {
  if (node.type === "IC") {
    const def = node.icDefId != null ? icDefinitions.find((d) => d.id === node.icDefId) : undefined;
    const layout = getIcNodeLayout(def);
    return { w: layout.nodeWidth, h: layout.bodyHeight };
  }
  if (node.type === "DISPLAY") {
    const layout = getDisplayLayout(node);
    return { w: layout.nodeWidth, h: layout.nodeHeight };
  }
  if (node.type === "SPEAKER") {
    const layout = getSpeakerLayout();
    return { w: layout.nodeWidth, h: layout.nodeHeight };
  }
  if (node.type === "NUMBER_DISPLAY") {
    const layout = getNumberDisplayLayout(node);
    return { w: layout.nodeWidth, h: layout.nodeHeight };
  }
  if (node.type === "GUIDE") {
    const layout = getGuideLayout(node);
    return { w: layout.width, h: layout.height };
  }
  if (node.type === "CABLE") {
    const geometry = getCableGeometry(node);
    return { w: geometry.width, h: geometry.height };
  }
  return { w: getRenameableNodeWidth(node), h: 64 };
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

function scheduleWireRender(forceGeometry = false) {
  if (forceGeometry) pendingWireRenderForceGeometry = true;
  if (pendingWireRenderFrame != null) return;
  pendingWireRenderFrame = window.requestAnimationFrame(() => {
    const nextForceGeometry = pendingWireRenderForceGeometry;
    pendingWireRenderFrame = null;
    pendingWireRenderForceGeometry = false;
    renderAllWires(nextForceGeometry);
  });
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
  if (pendingWireRenderFrame != null) {
    window.cancelAnimationFrame(pendingWireRenderFrame);
    pendingWireRenderFrame = null;
    pendingWireRenderForceGeometry = false;
  }
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

function updateCableNodeGeometry(node: NodeData, el?: HTMLDivElement | null): CableGeometry {
  if (node.type !== "CABLE") {
    throw new Error("updateCableNodeGeometry called for non-cable node");
  }

  const geometry = syncCableBounds(node);
  const cableEl =
    el ??
    nodeElements.get(node.id) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`) ??
    null;
  if (!cableEl) return geometry;

  cableEl.style.width = `${geometry.width}px`;
  cableEl.style.height = `${geometry.height}px`;

  const body = cableEl.querySelector<HTMLDivElement>(".cable-body");
  if (body) {
    body.style.width = `${geometry.width}px`;
    body.style.height = `${geometry.height}px`;
    body.classList.toggle("is-dense", geometry.channels > 16);
  }

  const svg = cableEl.querySelector<SVGSVGElement>(".cable-lanes-svg");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${geometry.width} ${geometry.height}`);
    const laneEls = Array.from(svg.querySelectorAll<SVGLineElement>(".cable-lane-line"));
    laneEls.forEach((laneEl, channel) => {
      const rowOffset = geometry.rowOffsets[channel] ?? 0;
      laneEl.setAttribute("x1", String(geometry.startLocalX));
      laneEl.setAttribute("y1", String(geometry.startLocalY + rowOffset));
      laneEl.setAttribute("x2", String(geometry.endLocalX));
      laneEl.setAttribute("y2", String(geometry.endLocalY + rowOffset));
    });
  }

  (["left", "right"] as CableSide[]).forEach((side) => {
    for (let channel = 0; channel < geometry.channels; channel++) {
      const rowOffset = geometry.rowOffsets[channel] ?? 0;
      const socketX = side === "left" ? geometry.startLocalX : geometry.endLocalX;
      const socketY = (side === "left" ? geometry.startLocalY : geometry.endLocalY) + rowOffset;

      const socket = cableEl.querySelector<HTMLDivElement>(
        `.cable-socket[data-side="${side}"][data-channel="${channel}"]`
      );
      if (socket) {
        socket.style.left = `${socketX}px`;
        socket.style.top = `${socketY}px`;
      }

      const inputPort = cableEl.querySelector<HTMLDivElement>(
        `.node-port-input[data-port-id="${getCablePortId(node.id, "in", side, channel)}"]`
      );
      if (inputPort) {
        inputPort.style.left = `${socketX}px`;
        inputPort.style.top = `${socketY}px`;
      }

      const outputPort = cableEl.querySelector<HTMLDivElement>(
        `.node-port-output[data-port-id="${getCablePortId(node.id, "out", side, channel)}"]`
      );
      if (outputPort) {
        outputPort.style.left = `${socketX}px`;
        outputPort.style.top = `${socketY}px`;
      }
    }
  });

  const startHandle = cableEl.querySelector<HTMLDivElement>(".cable-end-block-start");
  if (startHandle) {
    startHandle.style.left = `${geometry.startLocalX}px`;
    startHandle.style.top = `${geometry.startLocalY}px`;
    startHandle.style.height = `${geometry.bodyHeight}px`;
  }

  const endHandle = cableEl.querySelector<HTMLDivElement>(".cable-end-block-end");
  if (endHandle) {
    endHandle.style.left = `${geometry.endLocalX}px`;
    endHandle.style.top = `${geometry.endLocalY}px`;
    endHandle.style.height = `${geometry.bodyHeight}px`;
  }

  applyNodeTransform(cableEl, node);
  return geometry;
}

applyWorkspaceZoom();

function getSpeakerFrequency(node: Pick<NodeData, "speakerFrequencyHz">): number {
  const raw = node.speakerFrequencyHz ?? DEFAULT_SPEAKER_FREQUENCY_HZ;
  return clamp(Math.round(raw), MIN_SPEAKER_FREQUENCY_HZ, MAX_SPEAKER_FREQUENCY_HZ);
}

function getSpeakerLayout(): SpeakerLayout {
  const nodeWidth = 136;
  const bodyHeight = 58;
  const portStartX = 16;
  const portGap = 24;
  const portY = 10;
  const labelY = 22;

  return {
    nodeWidth,
    nodeHeight: DISPLAY_HEADER_HEIGHT + bodyHeight,
    bodyHeight,
    iconX: 27,
    iconY: 24,
    portPlacements: SPEAKER_INPUT_WEIGHTS.map((weight, index) => ({
      index,
      x: portStartX + index * portGap,
      y: portY,
      label: String(weight),
      labelX: portStartX + index * portGap,
      labelY,
      labelWeight: weight,
    })),
  };
}

function getSpeakerPortId(nodeId: number, index: number): string {
  return `${nodeId}:in:${index}`;
}

const TIC_TAC_TOE_WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
] as const;
const TIC_TAC_TOE_MOVE_PRIORITY = [4, 0, 2, 6, 8, 1, 3, 5, 7] as const;
const TIC_TAC_TOE_LINES_BY_CELL = Array.from(
  { length: TIC_TAC_TOE_BOARD_SIZE * TIC_TAC_TOE_BOARD_SIZE },
  (_, cellIndex) =>
    TIC_TAC_TOE_WINNING_LINES.filter((line) =>
      (line as readonly number[]).includes(cellIndex)
    ).map(
      (line) => line.filter((cell) => cell !== cellIndex) as [number, number]
    )
);

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

interface NumberDisplayLayout {
  digits: number;
  inputCount: number;
  digitWidth: number;
  digitHeight: number;
  digitGap: number;
  groupWidth: number;
  groupGap: number;
  screenWidth: number;
  screenHeight: number;
  nodeWidth: number;
  nodeHeight: number;
  bodyHeight: number;
  digitPositions: { x: number; y: number }[];
  portPlacements: {
    index: number;
    x: number;
    y: number;
    label: string;
    labelX: number;
    labelY: number;
    labelPosition: "above" | "below";
    labelWeight: number;
  }[];
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

function getNumberDisplayDigits(node: Pick<NodeData, "numberDigits">): number {
  const raw = Math.round(node.numberDigits ?? DEFAULT_NUMBER_DISPLAY_DIGITS);
  return clamp(raw, MIN_NUMBER_DISPLAY_DIGITS, MAX_NUMBER_DISPLAY_DIGITS);
}

function getNumberDisplayInputCount(node: Pick<NodeData, "numberDigits">): number {
  return getNumberDisplayDigits(node) * NUMBER_DISPLAY_BITS_PER_DIGIT;
}

function getNumberDisplayBitWeight(_digits: number, index: number): number {
  const digitIndex = Math.floor(index / NUMBER_DISPLAY_BITS_PER_DIGIT);
  const localBitIndex = index % NUMBER_DISPLAY_BITS_PER_DIGIT;
  const power = digitIndex * NUMBER_DISPLAY_BITS_PER_DIGIT + localBitIndex;
  return 2 ** power;
}

function formatNumberDisplayBitWeight(weight: number): string {
  const units = ["", "K", "M", "G", "T"];
  let scaled = weight;
  let unitIndex = 0;
  while (scaled >= 1024 && scaled % 1024 === 0 && unitIndex < units.length - 1) {
    scaled /= 1024;
    unitIndex++;
  }
  return `${scaled}${units[unitIndex]}`;
}

function getNumberDisplayLayout(
  node: Pick<NodeData, "numberDigits">
): NumberDisplayLayout {
  const digits = getNumberDisplayDigits(node);
  const inputCount = getNumberDisplayInputCount(node);
  const digitWidth = 24;
  const digitHeight = 36;
  const digitGap = 4;
  const groupWidth = 72;
  const groupGap = 8;
  const bodyHeight = 76;
  const bodyPaddingX = 12;
  const upperY = 18;
  const lowerY = bodyHeight - 18;
  const digitY = Math.round((bodyHeight - digitHeight) / 2);
  const digitX = Math.round((groupWidth - digitWidth) / 2);
  const screenWidth = digits * groupWidth + Math.max(0, digits - 1) * groupGap;
  const screenHeight = digitHeight;

  const digitPositions = Array.from({ length: digits }, (_, digitIndex) => ({
    x: bodyPaddingX + digitIndex * (groupWidth + groupGap) + digitX,
    y: digitY,
  }));

  const portPlacements = Array.from({ length: digits }, (_, digitIndex) => {
    const groupLeft = bodyPaddingX + digitIndex * (groupWidth + groupGap);
    const baseIndex = digitIndex * NUMBER_DISPLAY_BITS_PER_DIGIT;
    return [
      {
        index: baseIndex + 0,
        x: groupLeft + 18,
        y: upperY,
        labelX: groupLeft + 18,
        labelY: upperY - 9,
        labelPosition: "above" as const,
      },
      {
        index: baseIndex + 1,
        x: groupLeft + groupWidth - 18,
        y: upperY,
        labelX: groupLeft + groupWidth - 18,
        labelY: upperY - 9,
        labelPosition: "above" as const,
      },
      {
        index: baseIndex + 2,
        x: groupLeft + 18,
        y: lowerY,
        labelX: groupLeft + 18,
        labelY: lowerY + 9,
        labelPosition: "below" as const,
      },
      {
        index: baseIndex + 3,
        x: groupLeft + groupWidth - 18,
        y: lowerY,
        labelX: groupLeft + groupWidth - 18,
        labelY: lowerY + 9,
        labelPosition: "below" as const,
      },
    ].map((placement) => {
      const weight = getNumberDisplayBitWeight(digits, placement.index);
      return {
        ...placement,
        label: formatNumberDisplayBitWeight(weight),
        labelWeight: weight,
      };
    });
  }).flat();

  return {
    digits,
    inputCount,
    digitWidth,
    digitHeight,
    digitGap,
    groupWidth,
    groupGap,
    screenWidth,
    screenHeight,
    nodeWidth: Math.max(108, screenWidth + bodyPaddingX * 2),
    nodeHeight: DISPLAY_HEADER_HEIGHT + bodyHeight,
    bodyHeight,
    digitPositions,
    portPlacements,
  };
}

interface GuideLayout {
  slotCount: number;
  width: number;
  height: number;
  slotCenters: number[];
}

type CableSide = "left" | "right";

interface CableLayout {
  channels: number;
  bodyHeight: number;
  rowOffsets: number[];
}

interface CableGeometry extends CableLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  startLocalX: number;
  startLocalY: number;
  endLocalX: number;
  endLocalY: number;
}

function getGuideLength(node: Pick<NodeData, "guideLength">): number {
  const raw = Math.round(node.guideLength ?? DEFAULT_GUIDE_LENGTH);
  return clamp(raw, MIN_GUIDE_LENGTH, MAX_GUIDE_LENGTH);
}

function getGuideLayout(node: Pick<NodeData, "guideLength">): GuideLayout {
  const slotCount = getGuideLength(node);
  return {
    slotCount,
    width: GUIDE_THICKNESS,
    height:
      GUIDE_BODY_PADDING * 2 +
      GUIDE_SLOT_PITCH * Math.max(0, slotCount - 1) +
      GUIDE_SLOT_HOLE_SIZE,
    slotCenters: Array.from({ length: slotCount }, (_, idx) =>
      GUIDE_BODY_PADDING + GUIDE_SLOT_HOLE_SIZE / 2 + idx * GUIDE_SLOT_PITCH
    ),
  };
}

function getCableChannels(node: Pick<NodeData, "cableChannels">): number {
  const raw = Math.round(node.cableChannels ?? DEFAULT_CABLE_CHANNELS);
  return clamp(raw, MIN_CABLE_CHANNELS, MAX_CABLE_CHANNELS);
}

function getCableLength(node: Pick<NodeData, "cableLength">): number {
  const raw = Math.round(node.cableLength ?? DEFAULT_CABLE_LENGTH);
  return clamp(snapCoord(raw), MIN_CABLE_LENGTH, MAX_CABLE_LENGTH);
}

function getCableLayout(node: Pick<NodeData, "cableChannels">): CableLayout {
  const channels = getCableChannels(node);
  const rowPitch =
    channels > 48 ? 8 : channels > 24 ? 10 : channels > 12 ? 14 : CABLE_CHANNEL_PITCH;
  return {
    channels,
    bodyHeight:
      CABLE_PADDING_Y * 2 +
      Math.max(0, channels - 1) * rowPitch +
      CABLE_SOCKET_SIZE,
    rowOffsets: Array.from({ length: channels }, (_, idx) =>
      (idx - (channels - 1) / 2) * rowPitch
    ),
  };
}

function getCableEndpoints(
  node: Pick<
    NodeData,
    | "x"
    | "y"
    | "cableLength"
    | "cableChannels"
    | "cableStartX"
    | "cableStartY"
    | "cableEndX"
    | "cableEndY"
  >
): { startX: number; startY: number; endX: number; endY: number } {
  const layout = getCableLayout(node);
  const hasExplicitEndpoints =
    typeof node.cableStartX === "number" &&
    typeof node.cableStartY === "number" &&
    typeof node.cableEndX === "number" &&
    typeof node.cableEndY === "number";

  if (hasExplicitEndpoints) {
    return {
      startX: snapCoord(node.cableStartX!),
      startY: snapCoord(node.cableStartY!),
      endX: snapCoord(node.cableEndX!),
      endY: snapCoord(node.cableEndY!),
    };
  }

  const startX = snapCoord(node.x + CABLE_END_WIDTH / 2);
  const startY = snapCoord(node.y + DISPLAY_HEADER_HEIGHT + layout.bodyHeight / 2);
  const endX = snapCoord(node.x + getCableLength(node) - CABLE_END_WIDTH / 2);
  return {
    startX,
    startY,
    endX,
    endY: startY,
  };
}

function getCableGeometry(
  node: Pick<
    NodeData,
    | "x"
    | "y"
    | "cableLength"
    | "cableChannels"
    | "cableStartX"
    | "cableStartY"
    | "cableEndX"
    | "cableEndY"
  >
): CableGeometry {
  const layout = getCableLayout(node);
  const { startX, startY, endX, endY } = getCableEndpoints(node);
  const left = Math.min(startX, endX) - CABLE_END_WIDTH / 2;
  const top = Math.min(startY, endY) - layout.bodyHeight / 2;
  const width = Math.max(CABLE_END_WIDTH, Math.abs(endX - startX) + CABLE_END_WIDTH);
  const height = Math.max(layout.bodyHeight, Math.abs(endY - startY) + layout.bodyHeight);

  return {
    ...layout,
    left,
    top,
    width,
    height,
    startX,
    startY,
    endX,
    endY,
    startLocalX: startX - left,
    startLocalY: startY - top,
    endLocalX: endX - left,
    endLocalY: endY - top,
  };
}

function syncCableBounds(node: NodeData): CableGeometry {
  if (node.type !== "CABLE") {
    throw new Error("syncCableBounds called for non-cable node");
  }

  const endpoints = getCableEndpoints(node);
  node.cableStartX = endpoints.startX;
  node.cableStartY = endpoints.startY;
  node.cableEndX = endpoints.endX;
  node.cableEndY = endpoints.endY;

  const geometry = getCableGeometry(node);
  node.x = geometry.left;
  node.y = geometry.top;
  node.cableLength = Math.round(
    Math.hypot(node.cableEndX - node.cableStartX, node.cableEndY - node.cableStartY)
  );
  return geometry;
}

function moveCableBy(node: NodeData, dx: number, dy: number) {
  if (node.type !== "CABLE") return;
  const { startX, startY, endX, endY } = getCableEndpoints(node);
  node.cableStartX = snapCoord(startX + dx);
  node.cableStartY = snapCoord(startY + dy);
  node.cableEndX = snapCoord(endX + dx);
  node.cableEndY = snapCoord(endY + dy);
  syncCableBounds(node);
}

function getGuideInputPortId(nodeId: number, slotIndex: number): string {
  return `${nodeId}:in:${slotIndex}`;
}

function getGuideOutputPortId(nodeId: number, slotIndex: number): string {
  return `${nodeId}:out:${slotIndex}`;
}

function parseGuidePortId(portId: string): {
  nodeId: number;
  role: "in" | "out";
  slotIndex: number;
} | null {
  const match = /^(\d+):(in|out):(\d+)$/.exec(portId);
  if (!match) return null;
  return {
    nodeId: Number(match[1]),
    role: match[2] as "in" | "out",
    slotIndex: Number(match[3]),
  };
}

function getGuidePairPortId(portId: string): string | null {
  const parsed = parseGuidePortId(portId);
  if (!parsed) return null;
  return parsed.role === "in"
    ? getGuideOutputPortId(parsed.nodeId, parsed.slotIndex)
    : getGuideInputPortId(parsed.nodeId, parsed.slotIndex);
}

function getCablePortId(
  nodeId: number,
  role: "in" | "out",
  side: CableSide,
  channel: number
): string {
  return `${nodeId}:${role}:${side}-${channel}`;
}

function parseCablePortId(portId: string): {
  nodeId: number;
  role: "in" | "out";
  side: CableSide;
  channel: number;
} | null {
  const match = /^(\d+):(in|out):(left|right)-(\d+)$/.exec(portId);
  if (!match) return null;
  return {
    nodeId: Number(match[1]),
    role: match[2] as "in" | "out",
    side: match[3] as CableSide,
    channel: Number(match[4]),
  };
}

function getCableChannelColor(channel: number): string {
  return CABLE_COLORS[((channel % CABLE_COLORS.length) + CABLE_COLORS.length) % CABLE_COLORS.length];
}

function getDisplayPortId(nodeId: number, index: number): string {
  return `${nodeId}:in:${index}`;
}

function getNumberDisplayPortId(nodeId: number, index: number): string {
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

function scheduleSignalRecompute() {
  if (document.visibilityState === "hidden") {
    if (pendingSignalRecomputeFrame != null) {
      window.cancelAnimationFrame(pendingSignalRecomputeFrame);
      pendingSignalRecomputeFrame = null;
    }
    if (pendingSignalRecomputeTimeout != null) return;
    pendingSignalRecomputeTimeout = window.setTimeout(() => {
      pendingSignalRecomputeTimeout = null;
      recomputeSignals();
    }, 0);
    return;
  }

  if (pendingSignalRecomputeFrame != null) return;
  pendingSignalRecomputeFrame = window.requestAnimationFrame(() => {
    pendingSignalRecomputeFrame = null;
    recomputeSignals();
  });
}

function nudgeAudioContext() {
  const ctx = ensureAudioContext();
  if (!ctx || ctx.state !== "suspended") return;
  void ctx.resume().catch(() => {});
}

function createSpeakerVoice(initialFrequency: number): SpeakerVoice | null {
  const ctx = ensureAudioContext();
  if (!ctx) return null;

  const oscillator = ctx.createOscillator();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(initialFrequency, ctx.currentTime);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start();

  return { oscillator, gain };
}

function destroySpeakerVoice(voice: SpeakerVoice) {
  try {
    voice.gain.gain.cancelScheduledValues(0);
    voice.gain.gain.setValueAtTime(0, voice.gain.context.currentTime);
    voice.oscillator.stop();
  } catch {}
  voice.oscillator.disconnect();
  voice.gain.disconnect();
}

function stopSpeakerVoice(nodeId: number) {
  const voice = speakerVoices.get(nodeId);
  if (!voice) return;
  speakerVoices.delete(nodeId);
  destroySpeakerVoice(voice);
}

function stopIcSpeakerVoice(key: string) {
  const voice = icSpeakerVoices.get(key);
  if (!voice) return;
  icSpeakerVoices.delete(key);
  destroySpeakerVoice(voice);
}

function ensureSpeakerVoice(node: NodeData) {
  const existing = speakerVoices.get(node.id);
  if (existing) return existing;
  const voice = createSpeakerVoice(getSpeakerFrequency(node));
  if (!voice) return null;
  speakerVoices.set(node.id, voice);
  return voice;
}

function ensureIcSpeakerVoice(key: string, initialFrequency: number) {
  const existing = icSpeakerVoices.get(key);
  if (existing) return existing;
  const voice = createSpeakerVoice(initialFrequency);
  if (!voice) return null;
  icSpeakerVoices.set(key, voice);
  return voice;
}

function teardownIcRuntimeState(runtimeKey: string) {
  const runtime = icRuntimeStates.get(runtimeKey);
  if (!runtime) return;

  runtime.clockTimers.forEach((timerId) => clearInterval(timerId));
  runtime.bufferTimeouts.forEach((pending) => {
    pending.forEach((timeoutId) => clearTimeout(timeoutId));
  });
  icRuntimeStates.delete(runtimeKey);
}

function dropIcRuntimeTree(rootKey: string) {
  Array.from(icRuntimeStates.keys()).forEach((runtimeKey) => {
    if (runtimeKey === rootKey || runtimeKey.startsWith(`${rootKey}/`)) {
      teardownIcRuntimeState(runtimeKey);
    }
  });
  Array.from(icSpeakerVoices.keys()).forEach((key) => {
    if (key.startsWith(`${rootKey}/`)) {
      stopIcSpeakerVoice(key);
    }
  });
}

function resetAllIcRuntimeState() {
  if (pendingSignalRecomputeFrame != null) {
    window.cancelAnimationFrame(pendingSignalRecomputeFrame);
    pendingSignalRecomputeFrame = null;
  }
  if (pendingSignalRecomputeTimeout != null) {
    window.clearTimeout(pendingSignalRecomputeTimeout);
    pendingSignalRecomputeTimeout = null;
  }
  Array.from(icRuntimeStates.keys()).forEach((runtimeKey) => {
    teardownIcRuntimeState(runtimeKey);
  });
  Array.from(icSpeakerVoices.keys()).forEach((key) => stopIcSpeakerVoice(key));
  workspaceIcResults.clear();
}

function resetNodeValueForDefinition(node: NodeData) {
  if (node.type === "POWER") {
    node.value = true;
    return;
  }
  if (node.type === "DFF") {
    return;
  }
  node.value = false;
}

function pruneUnusedIcRuntimeTrees(activeRoots: Set<string>) {
  const staleRoots = new Set<string>();

  Array.from(icRuntimeStates.keys()).forEach((runtimeKey) => {
    const rootKey = runtimeKey.split("/")[0] ?? runtimeKey;
    if (!activeRoots.has(rootKey)) staleRoots.add(rootKey);
  });
  Array.from(icSpeakerVoices.keys()).forEach((key) => {
    const rootKey = key.split("/")[0] ?? key;
    if (!activeRoots.has(rootKey)) staleRoots.add(rootKey);
  });

  staleRoots.forEach((rootKey) => dropIcRuntimeTree(rootKey));
}

const icHeldKeys = new Set<string>();

function refreshIcKeyRuntimeStates() {
  icRuntimeStates.forEach((runtime) => {
    const def = icDefinitions.find((candidate) => candidate.id === runtime.defId);
    if (!def) return;
    def.nodes.forEach((node) => {
      if (node.type !== "KEY") return;
      runtime.portOutputs.set(`${node.id}:out:0`, isIcKeyNodeActive(node));
    });
  });
}

window.addEventListener("keydown", (event) => {
  const key = event.key.trim().toLowerCase();
  if (key) icHeldKeys.add(key);
  refreshIcKeyRuntimeStates();
  recomputeSignals();
});

window.addEventListener("keyup", (event) => {
  const key = event.key.trim().toLowerCase();
  if (key) icHeldKeys.delete(key);
  refreshIcKeyRuntimeStates();
  recomputeSignals();
});

window.addEventListener("blur", () => {
  icHeldKeys.clear();
  refreshIcKeyRuntimeStates();
  recomputeSignals();
});

function isIcKeyNodeActive(node: NodeData) {
  const key = node.keyChar?.trim().toLowerCase() ?? "";
  if (!key) return false;
  return icHeldKeys.has(key);
}

function ensureIcRuntimeState(def: ICDefinition, runtimeKey: string): IcRuntimeState {
  const existing = icRuntimeStates.get(runtimeKey);
  if (existing && existing.defId === def.id) return existing;
  if (existing) teardownIcRuntimeState(runtimeKey);

  const runtime: IcRuntimeState = {
    defId: def.id,
    nodes: new Map<number, NodeData>(),
    portOutputs: new Map<string, boolean>(),
    wireStates: new Array(def.wires.length).fill(false),
    bufferLastInput: new Map<number, boolean>(),
    bufferTimeouts: new Map<number, Set<number>>(),
    dffLastClockInput: new Map<number, boolean>(),
    clockTimers: new Map<number, number>(),
    clockLastTickAt: new Map<number, number>(),
  };

  def.nodes.forEach((sourceNode) => {
    const clonedNode: NodeData = { ...sourceNode };
    if (clonedNode.type === "POWER") clonedNode.value = true;
    runtime.nodes.set(clonedNode.id, clonedNode);

    if (clonedNode.type === "CLOCK") {
      runtime.clockLastTickAt.set(clonedNode.id, performance.now());
      const delay = clonedNode.clockDelayMs ?? 100;
      const timerId = window.setInterval(() => {
        const liveRuntime = icRuntimeStates.get(runtimeKey);
        const liveNode = liveRuntime?.nodes.get(clonedNode.id);
        if (!liveRuntime || !liveNode) return;
        const advanced = advanceClockNode(
          liveNode,
          liveRuntime.clockLastTickAt,
          performance.now()
        );
        if (advanced || document.visibilityState === "hidden") {
          scheduleSignalRecompute();
        }
      }, delay);
      runtime.clockTimers.set(clonedNode.id, timerId);
    } else if (clonedNode.type === "BUFFER") {
      runtime.bufferLastInput.set(clonedNode.id, false);
    } else if (clonedNode.type === "DFF") {
      runtime.dffLastClockInput.set(clonedNode.id, false);
    }
  });

  icRuntimeStates.set(runtimeKey, runtime);
  return runtime;
}

function advanceClockNode(
  node: NodeData,
  lastTickMap: Map<number, number>,
  now = performance.now()
): boolean {
  if (node.type !== "CLOCK") return false;
  const delay = Math.max(1, node.clockDelayMs ?? 100);
  const lastTick = lastTickMap.get(node.id);
  if (lastTick == null) {
    lastTickMap.set(node.id, now);
    return false;
  }

  const elapsed = now - lastTick;
  if (elapsed < delay) return false;

  const ticks = Math.floor(elapsed / delay);
  if (ticks <= 0) return false;
  lastTickMap.set(node.id, lastTick + ticks * delay);
  if (ticks % 2 === 1) {
    node.value = !node.value;
    return true;
  }
  return false;
}

function catchUpWorkspaceClocks(now = performance.now()) {
  let changed = false;
  nodes.forEach((node) => {
    if (advanceClockNode(node, clockLastTickAt, now)) changed = true;
  });
  return changed;
}

function catchUpRuntimeClocks(runtime: IcRuntimeState, now = performance.now()) {
  let changed = false;
  runtime.nodes.forEach((node) => {
    if (advanceClockNode(node, runtime.clockLastTickAt, now)) changed = true;
  });
  return changed;
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

function pruneNumberDisplayWires(node: NodeData) {
  if (node.type !== "NUMBER_DISPLAY") return;
  const maxInputs = getNumberDisplayInputCount(node);
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

function pruneGuideWires(node: NodeData) {
  if (node.type !== "GUIDE") return;
  const slotCount = getGuideLength(node);
  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    if (wire.toNodeId !== node.id && wire.fromNodeId !== node.id) continue;

    const parsedTo = wire.toNodeId === node.id ? parseGuidePortId(wire.toPortId) : null;
    const parsedFrom = wire.fromNodeId === node.id ? parseGuidePortId(wire.fromPortId) : null;
    const slotIndex = parsedTo?.slotIndex ?? parsedFrom?.slotIndex ?? -1;
    if (slotIndex >= 0 && slotIndex < slotCount) continue;

    selectedWireIds.delete(wire.id);
    wires.splice(i, 1);
  }
}

function pruneCableWires(node: NodeData) {
  if (node.type !== "CABLE") return;
  const channelCount = getCableChannels(node);
  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    if (wire.toNodeId !== node.id && wire.fromNodeId !== node.id) continue;

    const parsedTo = wire.toNodeId === node.id ? parseCablePortId(wire.toPortId) : null;
    const parsedFrom = wire.fromNodeId === node.id ? parseCablePortId(wire.fromPortId) : null;
    const channel = parsedTo?.channel ?? parsedFrom?.channel ?? -1;
    if (channel >= 0 && channel < channelCount) continue;

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
    if (!clockLastTickAt.has(node.id)) {
      clockLastTickAt.set(node.id, performance.now());
    }
    if (!clockTimers.has(node.id)) {
      const delay = node.clockDelayMs;
      const timer = window.setInterval(() => {
        const advanced = advanceClockNode(node, clockLastTickAt, performance.now());
        if (advanced || document.visibilityState === "hidden") {
          scheduleSignalRecompute();
        }
      }, delay);
      clockTimers.set(node.id, timer);
    }
  } else if (node.type === "BUFFER") {
    if (!node.bufferDelayMs) node.bufferDelayMs = 100;
    if (!bufferLastInput.has(node.id)) {
      bufferLastInput.set(node.id, false);
    }
  } else if (node.type === "DFF") {
    if (!dffLastClockInput.has(node.id)) {
      dffLastClockInput.set(node.id, false);
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
  clockLastTickAt.delete(nodeId);
  clearBufferTimeouts(nodeId);
  bufferLastInput.delete(nodeId);
  dffLastClockInput.delete(nodeId);
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
  if (type === "DFF") {
    node.value = false;
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
  if (type === "NUMBER_DISPLAY") {
    node.numberDigits = DEFAULT_NUMBER_DISPLAY_DIGITS;
  }
  if (type === "GUIDE") {
    node.guideLength = DEFAULT_GUIDE_LENGTH;
  }
  if (type === "CABLE") {
    node.cableChannels = DEFAULT_CABLE_CHANNELS;
    node.cableLength = DEFAULT_CABLE_LENGTH;
    const layout = getCableLayout(node);
    node.cableStartX = snapCoord(node.x + CABLE_END_WIDTH / 2);
    node.cableStartY = snapCoord(node.y + layout.bodyHeight / 2);
    node.cableEndX = snapCoord(node.cableStartX + DEFAULT_CABLE_LENGTH - CABLE_END_WIDTH);
    node.cableEndY = node.cableStartY;
    syncCableBounds(node);
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

interface IcPreviewRenderState {
  nodeValues?: Map<number, boolean>;
  wireStates?: boolean[];
  portOutputs?: Map<string, boolean>;
  ledStates?: boolean[];
  activeIncomingPorts?: Set<string>;
}

function shouldUseStaticIcPreview(def?: ICDefinition): boolean {
  if (!def) return true;
  const layout = getIcNodeLayout(def);
  return (
    def.nodes.length > 48 ||
    def.wires.length > 96 ||
    def.outputNodeIds.length > 24 ||
    layout.bodyHeight > 520
  );
}

function renderStaticIcPreviewSummary(
  _def: ICDefinition,
  width: number,
  height: number
): string {
  const chipInset = 8;
  const bodyX = chipInset;
  const bodyY = chipInset;
  const bodyW = Math.max(24, width - chipInset * 2);
  const bodyH = Math.max(24, height - chipInset * 2);
  const insetX = 14;
  const insetY = 12;
  const innerX = bodyX + insetX;
  const innerY = bodyY + insetY;
  const innerW = Math.max(20, bodyW - insetX * 2);
  const innerH = Math.max(20, bodyH - insetY * 2);
  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}" height="${height}"
         viewBox="0 0 ${width} ${height}"
         preserveAspectRatio="xMidYMid meet">
      <rect x="${bodyX}" y="${bodyY}" width="${bodyW}" height="${bodyH}" rx="12"
        fill="rgba(255,255,255,0.94)" stroke="rgba(148,163,184,0.3)" stroke-width="1.5" />
      <rect x="${innerX}" y="${innerY}" width="${innerW}" height="${innerH}" rx="11"
        fill="rgba(248,250,252,0.88)"
        stroke="rgba(148,163,184,0.16)" stroke-width="1.2" />
    </svg>
  `.trim();
}

function getRelevantIcNodeIds(def: ICDefinition): Set<number> {
  const seeds = [
    ...def.outputNodeIds,
    ...def.ledNodeIds,
    ...def.nodes
      .filter((node) => node.type === "SPEAKER")
      .map((node) => node.id),
  ];
  if (seeds.length === 0) {
    return new Set(def.nodes.map((node) => node.id));
  }

  const reverse = new Map<number, number[]>();
  def.wires.forEach((wire) => {
    const arr = reverse.get(wire.toNodeId) ?? [];
    arr.push(wire.fromNodeId);
    reverse.set(wire.toNodeId, arr);
  });

  const visited = new Set<number>();
  const queue = [...seeds];
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    reverse.get(nodeId)?.forEach((prevId) => {
      if (!visited.has(prevId)) queue.push(prevId);
    });
  }
  return visited;
}

function getIcDefinitionSimulationCache(def: ICDefinition): IcDefinitionSimulationCache {
  const cached = icDefinitionSimulationCaches.get(def.id);
  if (cached) return cached;

  const nodeById = new Map<number, NodeData>();
  def.nodes.forEach((node) => nodeById.set(node.id, node));

  const relevantNodeIds =
    def.nodes.length > 72 || def.wires.length > 128 ? getRelevantIcNodeIds(def) : null;
  const relevantNodeIdList = relevantNodeIds
    ? def.nodes.filter((node) => relevantNodeIds.has(node.id)).map((node) => node.id)
    : def.nodes.map((node) => node.id);
  const inputIndexByNodeId = new Map<number, number>();
  def.inputNodeIds.forEach((nodeId, index) => inputIndexByNodeId.set(nodeId, index));
  const wireEntries = def.wires
    .map((wire, index) => ({ wire, index }))
    .filter(
      ({ wire }) =>
        !relevantNodeIds ||
        (relevantNodeIds.has(wire.fromNodeId) && relevantNodeIds.has(wire.toNodeId))
    );

  const nextCache: IcDefinitionSimulationCache = {
    nodeById,
    relevantNodeIds,
    relevantNodeIdList,
    inputIndexByNodeId,
    wireEntries,
  };
  icDefinitionSimulationCaches.set(def.id, nextCache);
  return nextCache;
}

interface IcPreviewWireRef {
  wire: ICDefinition["wires"][number];
  index: number;
}

interface IcPreviewScene {
  nodes: NodeData[];
  wires: IcPreviewWireRef[];
  nodeMap: Map<number, NodeData>;
  hiddenNodeIds: Set<number>;
  portAnchors: Map<string, { x: number; y: number }>;
}

function isIcPreviewRootNode(node: NodeData, def: ICDefinition): boolean {
  return (
    def.inputNodeIds.includes(node.id) ||
    node.type === "POWER" ||
    node.type === "BUTTON" ||
    node.type === "KEY" ||
    node.type === "CLOCK"
  );
}

function shouldHideIcPreviewNode(node: NodeData, def: ICDefinition): boolean {
  void def;
  if (node.type === "SWITCH" || node.type === "OUTPUT") return true;
  return false;
}

function buildIcPreviewScene(def: ICDefinition): IcPreviewScene {
  const nodeMap = new Map<number, NodeData>();
  const adjacency = new Map<number, Set<number>>();
  const wiredNodeIds = new Set<number>();

  def.nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  def.wires.forEach((wire) => {
    wiredNodeIds.add(wire.fromNodeId);
    wiredNodeIds.add(wire.toNodeId);
    if (!adjacency.has(wire.fromNodeId)) adjacency.set(wire.fromNodeId, new Set());
    if (!adjacency.has(wire.toNodeId)) adjacency.set(wire.toNodeId, new Set());
    adjacency.get(wire.fromNodeId)!.add(wire.toNodeId);
    adjacency.get(wire.toNodeId)!.add(wire.fromNodeId);
  });

  const reachableNodeIds = new Set<number>();
  const queue = def.nodes
    .filter((node) => wiredNodeIds.has(node.id) && isIcPreviewRootNode(node, def))
    .map((node) => node.id);

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (reachableNodeIds.has(nodeId)) continue;
    reachableNodeIds.add(nodeId);
    adjacency.get(nodeId)?.forEach((nextId) => {
      if (!reachableNodeIds.has(nextId)) queue.push(nextId);
    });
  }

  const hiddenNodeIds = new Set<number>();
  const nodes = def.nodes.filter((node) => {
    if (!wiredNodeIds.has(node.id) || !reachableNodeIds.has(node.id)) return false;
    if (shouldHideIcPreviewNode(node, def)) {
      hiddenNodeIds.add(node.id);
      return false;
    }
    return true;
  });

  let minVisibleX = Infinity;
  let maxVisibleX = -Infinity;
  nodes.forEach((node) => {
    const { w } = getNodeLayoutSize(node);
    minVisibleX = Math.min(minVisibleX, node.x);
    maxVisibleX = Math.max(maxVisibleX, node.x + w);
  });
  if (!Number.isFinite(minVisibleX) || !Number.isFinite(maxVisibleX)) {
    minVisibleX = 24;
    maxVisibleX = 144;
  }

  const portAnchors = new Map<string, { x: number; y: number }>();
  const leftAnchorX = minVisibleX - 26;
  const rightAnchorX = maxVisibleX + 26;

  def.inputNodeIds.forEach((nodeId) => {
    if (!reachableNodeIds.has(nodeId) || !hiddenNodeIds.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const { h } = getNodeLayoutSize(node);
    portAnchors.set(`${nodeId}:out:0`, {
      x: leftAnchorX,
      y: node.y + h / 2,
    });
  });

  def.outputNodeIds.forEach((nodeId) => {
    if (!reachableNodeIds.has(nodeId) || !hiddenNodeIds.has(nodeId)) return;
    const node = nodeMap.get(nodeId);
    if (!node) return;
    const { h } = getNodeLayoutSize(node);
    portAnchors.set(`${nodeId}:in:0`, {
      x: rightAnchorX,
      y: node.y + h / 2,
    });
  });

  const wires = def.wires
    .map((wire, index) => ({ wire, index }))
    .filter(
      ({ wire }) =>
        reachableNodeIds.has(wire.fromNodeId) &&
        reachableNodeIds.has(wire.toNodeId) &&
        (!hiddenNodeIds.has(wire.fromNodeId) || portAnchors.has(wire.fromPortId)) &&
        (!hiddenNodeIds.has(wire.toNodeId) || portAnchors.has(wire.toPortId))
    );

  return { nodes, wires, nodeMap, hiddenNodeIds, portAnchors };
}

function computeIcPreviewBounds(
  scene: IcPreviewScene,
  icDefMap: Map<number, ICDefinition>
) {
  if (scene.nodes.length === 0 && scene.wires.length === 0) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 200 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const addPoint = (x: number, y: number, pad = 28) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };

  scene.nodes.forEach((node) => {
    const { w, h } = nodeApproxSize(node, icDefMap);
    minX = Math.min(minX, node.x - 28);
    minY = Math.min(minY, node.y - 28);
    maxX = Math.max(maxX, node.x + w + 28);
    maxY = Math.max(maxY, node.y + h + 28);
  });

  scene.wires.forEach(({ wire }) => {
    const fromNode = scene.nodeMap.get(wire.fromNodeId);
    const toNode = scene.nodeMap.get(wire.toNodeId);
    if (!fromNode || !toNode) return;
    const from = portPosForPreview(fromNode, wire.fromPortId, icDefMap, scene.portAnchors);
    const to = portPosForPreview(toNode, wire.toPortId, icDefMap, scene.portAnchors);
    addPoint(from.x, from.y);
    addPoint(to.x, to.y);
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: 0, minY: 0, maxX: 320, maxY: 200 };
  }

  return { minX, minY, maxX, maxY };
}

function previewLabelForNode(node: NodeData, icDefMap: Map<number, ICDefinition>): string {
  if (node.type === "IC") {
    return node.icDefId != null ? icDefMap.get(node.icDefId)?.name || "IC" : "IC";
  }
  if (node.type === "KEY") return (node.keyChar || "a").slice(0, 1).toUpperCase();
  if (node.type === "BUTTON") return "BTN";
  if (node.type === "POWER") return "PWR";
  if (node.type === "OUTPUT") return "OUT";
  if (node.type === "SPEAKER") return "SPK";
  if (node.type === "DISPLAY") return "DSP";
  if (node.type === "CLOCK") return "CLK";
  if (node.type === "DFF") return "DFF";
  return node.type;
}

function renderPreviewGateNode(
  node: NodeData,
  active: boolean,
  inputAActive: boolean,
  inputBActive: boolean,
  outputActive: boolean
): string {
  const { w, h } = getNodeLayoutSize(node);
  const stroke = active ? "#f97316" : "#0f172a";
  const fill = active ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.86)";
  const lead = (x1: number, y1: number, x2: number, y2: number, on: boolean) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${on ? "#ef4444" : "rgba(15,23,42,0.35)"}" stroke-width="4" stroke-linecap="round" />`;
  const leftX = 8;
  const inputX = 28;
  const outputX = w - 8;
  const gateLeft = 28;
  const gateRight = w - 28;
  const topY = 12;
  const bottomY = h - 12;
  const midY = h / 2;
  const content = (() => {
    if (node.type === "AND" || node.type === "NAND") {
      const body =
        `M ${gateLeft} ${topY} ` +
        `L ${gateRight - 18} ${topY} ` +
        `Q ${gateRight + 8} ${midY} ${gateRight - 18} ${bottomY} ` +
        `L ${gateLeft} ${bottomY} Z`;
      const bubble =
        node.type === "NAND"
          ? `<circle cx="${gateRight - 6}" cy="${midY}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="3" />`
          : "";
      const leadStart = node.type === "NAND" ? gateRight : gateRight - 10;
      return `
        ${lead(leftX, topY + 8, inputX, topY + 8, inputAActive)}
        ${lead(leftX, bottomY - 8, inputX, bottomY - 8, inputBActive)}
        <path d="${body}" fill="${fill}" stroke="${stroke}" stroke-width="3" />
        ${bubble}
        ${lead(leadStart, midY, outputX, midY, outputActive)}
      `;
    }

    if (node.type === "OR" || node.type === "NOR" || node.type === "XOR") {
      const frontPath =
        `M ${gateLeft - 8} ${topY} ` +
        `Q ${gateRight - 6} ${midY} ${gateLeft - 8} ${bottomY} ` +
        `Q ${gateLeft + 18} ${midY} ${gateLeft - 8} ${topY} Z`;
      const backPath =
        `M ${gateLeft - 20} ${topY} ` +
        `Q ${gateLeft - 2} ${midY} ${gateLeft - 20} ${bottomY}`;
      const bubble =
        node.type === "NOR"
          ? `<circle cx="${gateRight - 2}" cy="${midY}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="3" />`
          : "";
      const leadStart = node.type === "NOR" ? gateRight + 4 : gateRight - 2;
      return `
        ${lead(leftX, topY + 8, inputX, topY + 8, inputAActive)}
        ${lead(leftX, bottomY - 8, inputX, bottomY - 8, inputBActive)}
        ${node.type === "XOR" ? `<path d="${backPath}" fill="none" stroke="${stroke}" stroke-width="3" />` : ""}
        <path d="${frontPath}" fill="${fill}" stroke="${stroke}" stroke-width="3" />
        ${bubble}
        ${lead(leadStart, midY, outputX, midY, outputActive)}
      `;
    }

    const triangle = `M ${gateLeft} ${topY} L ${gateRight - 14} ${midY} L ${gateLeft} ${bottomY} Z`;
    const bubble =
      node.type === "NOT"
        ? `<circle cx="${gateRight - 8}" cy="${midY}" r="5" fill="${fill}" stroke="${stroke}" stroke-width="3" />`
        : "";
    const leadStart = node.type === "NOT" ? gateRight - 2 : gateRight - 14;
    return `
      ${lead(leftX, midY, inputX, midY, inputAActive)}
      <path d="${triangle}" fill="${fill}" stroke="${stroke}" stroke-width="3" />
      ${bubble}
      ${lead(leadStart, midY, outputX, midY, outputActive)}
    `;
  })();

  return `<g transform="translate(${node.x},${node.y})">${content}</g>`;
}

function renderPreviewSimpleNode(
  node: NodeData,
  icDefMap: Map<number, ICDefinition>,
  state?: IcPreviewRenderState
): string {
  const { w, h } = getNodeLayoutSize(node);
  const active = state?.nodeValues?.get(node.id) ?? false;
  const stroke = active ? "#f97316" : "#0f172a";
  const fill = active ? "rgba(249,115,22,0.14)" : "rgba(255,255,255,0.86)";
  const label = previewLabelForNode(node, icDefMap);

  if (node.type === "OUTPUT" || node.type === "LED") {
    const color = node.lightColor || DEFAULT_LIGHT_COLOR;
    const lampCx = 62;
    const lampCy = h / 2;
    const lampOuterR = 14;
    const lampInnerR = 8;
    const leadLeftX = 30;
    const leadRightX = 94;
    const bodyStroke = active ? "#1f2937" : "#334155";
    const coreFill = active ? color : "#ffffff";
    const coreStroke = active ? color : "rgba(100,116,139,0.6)";
    return `
      <g transform="translate(${node.x},${node.y})">
        <line x1="${leadLeftX}" y1="${lampCy}" x2="${lampCx - lampOuterR}" y2="${lampCy}"
              stroke="${bodyStroke}" stroke-width="3" stroke-linecap="round" />
        <line x1="${lampCx + lampOuterR}" y1="${lampCy}" x2="${leadRightX}" y2="${lampCy}"
              stroke="${bodyStroke}" stroke-width="3" stroke-linecap="round" />
        <circle cx="${lampCx}" cy="${lampCy}" r="${lampOuterR}"
                fill="#ffffff"
                stroke="${bodyStroke}" stroke-width="3" />
        <circle cx="${lampCx}" cy="${lampCy}" r="${lampInnerR}"
                fill="${coreFill}"
                stroke="${coreStroke}" stroke-width="2.5" />
      </g>
    `;
  }

  if (node.type === "DISPLAY") {
    const layout = getDisplayLayout(node);
    const pixelSize = 6;
    const pixels = Array.from({ length: Math.min(layout.pixelCount, 16) }, (_, index) => {
      const col = index % Math.min(layout.width, 4);
      const row = Math.floor(index / Math.min(layout.width, 4));
      const isOn = state?.activeIncomingPorts?.has(`${node.id}:in:${index}`) ?? false;
      return `<rect x="${18 + col * (pixelSize + 2)}" y="${14 + row * (pixelSize + 2)}"
        width="${pixelSize}" height="${pixelSize}" rx="1"
        fill="${isOn ? "#f8fafc" : "#111827"}" />`;
    }).join("");
    return `
      <g transform="translate(${node.x},${node.y})">
        <rect x="14" y="10" width="${w - 28}" height="${h - 20}" rx="8"
              fill="#050505" stroke="${stroke}" stroke-width="3" />
        ${pixels}
      </g>
    `;
  }

  if (node.type === "NUMBER_DISPLAY") {
    const layout = getNumberDisplayLayout(node);
    const chars = new Array(layout.digits).fill(active ? "8" : "0");
    const digitsSvg = chars
      .map((char, index) => {
        const x = 18 + index * (18 + 6);
        return `<rect x="${x}" y="10" width="18" height="24" rx="4"
            fill="#0f172a" stroke="${stroke}" stroke-width="2" />
          <text x="${x + 9}" y="27" text-anchor="middle"
            font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
            font-size="16" fill="#fde68a">${escapeHtml(char)}</text>`;
      })
      .join("");
    return `
      <g transform="translate(${node.x},${node.y})">
        <rect x="10" y="8" width="${w - 20}" height="${h - 16}" rx="10"
              fill="${fill}" stroke="${stroke}" stroke-width="3" />
        ${digitsSvg}
      </g>
    `;
  }

  if (node.type === "GUIDE") {
    const layout = getGuideLayout(node);
    const holes = layout.slotCenters
      .map((slotCenter, idx) => {
        const activeSlot = state?.portOutputs?.get(getGuideOutputPortId(node.id, idx)) ?? false;
        return `<circle cx="${layout.width / 2}" cy="${slotCenter}" r="${GUIDE_SLOT_HOLE_SIZE / 2 - 1}"
          fill="${activeSlot ? "rgba(239,68,68,0.24)" : "#111827"}"
          stroke="${activeSlot ? "#ef4444" : "rgba(255,255,255,0.3)"}" stroke-width="2" />`;
      })
      .join("");
    return `
      <g transform="translate(${node.x},${node.y})">
        <rect x="4" y="4" width="${layout.width - 8}" height="${layout.height - 8}" rx="10"
              fill="rgba(15,23,42,0.92)" stroke="${stroke}" stroke-width="2.5" />
        ${holes}
      </g>
    `;
  }

  if (node.type === "CABLE") {
    const geometry = getCableGeometry(node);
    const visibleLaneIndexes =
      geometry.channels > 16
        ? geometry.rowOffsets
            .map((_rowOffset, channel) => channel)
            .filter(
              (channel) =>
                channel === 0 ||
                channel === geometry.channels - 1 ||
                channel % Math.max(1, Math.round(geometry.channels / 6)) === 0
            )
        : geometry.rowOffsets.map((_rowOffset, channel) => channel);
    const lanes = visibleLaneIndexes
      .map((channel) => {
        const realRowOffset = geometry.rowOffsets[channel] ?? 0;
        const color = getCableChannelColor(channel);
        const startY = geometry.startLocalY + realRowOffset;
        const endY = geometry.endLocalY + realRowOffset;
        return `
          <line x1="${geometry.startLocalX}" y1="${startY}" x2="${geometry.endLocalX}" y2="${endY}"
                stroke="${color}" stroke-opacity="${geometry.channels > 16 ? "0.18" : "0.5"}" stroke-width="${geometry.channels > 16 ? "3" : "6"}" stroke-linecap="round" />
          <circle cx="${geometry.startLocalX}" cy="${startY}" r="${geometry.channels > 16 ? "3.5" : "5.5"}" fill="#ffffff" stroke="${color}" stroke-width="2.2" />
          <circle cx="${geometry.endLocalX}" cy="${endY}" r="${geometry.channels > 16 ? "3.5" : "5.5"}" fill="#ffffff" stroke="${color}" stroke-width="2.2" />
        `;
      })
      .join("");
    return `
      <g transform="translate(${geometry.left},${geometry.top})">
        <rect x="${geometry.startLocalX - CABLE_END_WIDTH / 2}" y="${geometry.startLocalY - geometry.bodyHeight / 2}" width="${CABLE_END_WIDTH}" height="${geometry.bodyHeight}" rx="8"
              fill="rgba(15,23,42,0.9)" stroke="${stroke}" stroke-width="2.5" />
        <rect x="${geometry.endLocalX - CABLE_END_WIDTH / 2}" y="${geometry.endLocalY - geometry.bodyHeight / 2}" width="${CABLE_END_WIDTH}" height="${geometry.bodyHeight}" rx="8"
              fill="rgba(15,23,42,0.9)" stroke="${stroke}" stroke-width="2.5" />
        ${lanes}
      </g>
    `;
  }

  if (node.type === "POWER") {
    const iconCx = 54;
    const iconCy = h / 2;
    const iconR = 13;
    const leadEndX = 88;
    return `
      <g transform="translate(${node.x},${node.y})">
        <circle cx="${iconCx}" cy="${iconCy}" r="${iconR}"
                fill="#f97316"
                stroke="#0f172a" stroke-width="3" />
        <path d="M ${iconCx} ${iconCy - 8} L ${iconCx} ${iconCy - 1}"
              fill="none" stroke="#0f172a" stroke-width="3" stroke-linecap="round" />
        <line x1="${iconCx + iconR}" y1="${iconCy}" x2="${leadEndX}" y2="${iconCy}"
              stroke="#0f172a" stroke-width="3" stroke-linecap="round" />
      </g>
    `;
  }

  if (node.type === "DFF") {
    const dY = 22;
    const clkY = h - 20;
    const qY = h / 2;
    return `
      <g transform="translate(${node.x},${node.y})">
        <rect x="16" y="8" width="${w - 32}" height="${h - 16}" rx="9"
              fill="${fill}" stroke="${stroke}" stroke-width="3" />
        <text x="28" y="${dY + 4}" font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
              font-size="8" fill="#475569">D</text>
        <text x="24" y="${clkY + 4}" font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
              font-size="7.5" fill="#475569">CLK</text>
        <text x="${w - 28}" y="${qY + 4}" text-anchor="middle"
              font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
              font-size="8" fill="#475569">Q</text>
        <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle"
              font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
              font-size="10" fill="#0f172a">${active ? "1" : "0"}</text>
      </g>
    `;
  }

  if (node.type === "IC") {
    const labelSize = clamp(Math.round(Math.min(w, h) * 0.18), 12, 20);
    return `
      <g transform="translate(${node.x},${node.y})">
        <rect x="4" y="4" width="${w - 8}" height="${h - 8}" rx="4"
              fill="#efefef"
              stroke="#9ca3af" stroke-width="2" />
        <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle"
              font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-size="${labelSize}" fill="#5b5b5b">${escapeHtml(label)}</text>
      </g>
    `;
  }

  return `
    <g transform="translate(${node.x},${node.y})">
      <rect x="10" y="8" width="${w - 20}" height="${h - 16}" rx="10"
            fill="${fill}" stroke="${stroke}" stroke-width="3" />
      <text x="${w / 2}" y="${h / 2 + 4}" text-anchor="middle"
            font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
            font-size="10" fill="#0f172a">${escapeHtml(label)}</text>
    </g>
  `;
}

function getIcPreviewLedEntries(
  def: ICDefinition,
  state?: IcPreviewRenderState
) {
  return def.ledNodeIds
    .map((nodeId, index) => {
      const node = def.nodes.find((candidate) => candidate.id === nodeId);
      if (!node) return null;
      return {
        node,
        isOn: !!state?.ledStates?.[index],
        color: node.lightColor ?? "#22c55e",
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry != null)
    .sort((a, b) => a.node.y - b.node.y || a.node.x - b.node.x);
}

function renderIcPreviewLedStack(opts: {
  def: ICDefinition;
  width: number;
  height: number;
  minX: number;
  minY: number;
  state?: IcPreviewRenderState;
}): string {
  const ledEntries = getIcPreviewLedEntries(opts.def, opts.state);

  if (ledEntries.length === 0) return "";

  const radius = Math.max(4.5, Math.min(7.5, opts.height / Math.max(10, ledEntries.length * 4.25)));
  const gap = radius * 2.65;
  const totalHeight = gap * Math.max(0, ledEntries.length - 1);
  const cx = opts.minX + opts.width * 0.5;
  const startY = opts.minY + opts.height / 2 - totalHeight / 2;

  return ledEntries
    .map((entry, index) => {
      const cy = startY + index * gap;
      return `
        <g>
          ${entry.isOn ? `<circle cx="${cx}" cy="${cy}" r="${radius + 3}" fill="${entry.color}" opacity="0.16" />` : ""}
          <circle cx="${cx}" cy="${cy}" r="${radius}" fill="#f8fafc" stroke="rgba(15,23,42,0.68)" stroke-width="1.9" />
          <circle cx="${cx}" cy="${cy}" r="${Math.max(2.8, radius - 2.1)}" fill="${entry.color}" opacity="${entry.isOn ? 0.98 : 0.22}" />
        </g>
      `.trim();
    })
    .join("");
}

function getPreviewAnchorFromStore(
  portAnchors: unknown,
  portId: string
): { x: number; y: number } | null {
  const fromMap = (portAnchors as Map<string, { x: number; y: number }>)?.get?.(portId);
  if (fromMap) return fromMap;
  const fromObject = (portAnchors as Record<string, { x: number; y: number }> | undefined)?.[portId];
  return fromObject ?? null;
}

function renderIcPreviewSvg(opts: {
  def: ICDefinition;
  icDefinitions?: ICDefinition[];
  width: number;
  height: number;
  state?: IcPreviewRenderState;
}): string {
  const icDefMap = new Map<number, ICDefinition>();
  (opts.icDefinitions ?? icDefinitions).forEach((d) => icDefMap.set(d.id, d));
  icDefMap.set(opts.def.id, opts.def);
  const scene = buildIcPreviewScene(opts.def);
  const bounds = computeIcPreviewBounds(scene, icDefMap);
  const vbW = Math.max(1, bounds.maxX - bounds.minX);
  const vbH = Math.max(1, bounds.maxY - bounds.minY);
  const previewTooLarge =
    scene.nodes.length > 20 ||
    scene.wires.length > 28 ||
    vbW > 560 ||
    vbH > 280;
  const ledStackSvg = renderIcPreviewLedStack({
    def: opts.def,
    width: vbW,
    height: vbH,
    minX: bounds.minX,
    minY: bounds.minY,
    state: opts.state,
  });
  const wireStates = opts.state?.wireStates ?? [];
  const isWireActive = (wireIndex: number) => !!wireStates[wireIndex];
  const activeIncomingPorts = new Set<string>();
  scene.wires.forEach(({ wire, index }) => {
    if (isWireActive(index)) {
      activeIncomingPorts.add(wire.toPortId);
    }
  });
  const previewState: IcPreviewRenderState = {
    ...opts.state,
    activeIncomingPorts,
  };

  const hasActiveIncoming = (nodeId: number, slot?: "a" | "b") =>
    scene.wires.some(({ wire, index }) => {
      if (wire.toNodeId !== nodeId || !isWireActive(index)) return false;
      if (slot == null) return true;
      return wire.toPortId === `${nodeId}:in:${slot}`;
    });

  const hasActiveOutgoing = (node: NodeData) => {
    if (scene.wires.some(({ wire, index }) => wire.fromNodeId === node.id && isWireActive(index))) {
      return true;
    }
    return opts.state?.nodeValues?.get(node.id) ?? false;
  };

  const resolvePreviewPortPos = (node: NodeData | undefined, portId: string) => {
    if (node) return portPosForPreview(node, portId, icDefMap, scene.portAnchors);
    return getPreviewAnchorFromStore(scene.portAnchors, portId);
  };

  const wiresSvg = scene.wires
    .map(({ wire, index }) => {
      const fromNode = scene.nodeMap.get(wire.fromNodeId);
      const toNode = scene.nodeMap.get(wire.toNodeId);
      const p1 = resolvePreviewPortPos(fromNode, wire.fromPortId);
      const p2 = resolvePreviewPortPos(toNode, wire.toPortId);
      if (!p1 || !p2) return "";
      const active = isWireActive(index);
      return `<path d="${wirePathD(p1.x, p1.y, p2.x, p2.y)}"
        fill="none"
        stroke="${active ? "#ef4444" : "rgba(15,23,42,0.18)"}"
        stroke-width="${active ? 5 : 3.25}"
        stroke-linecap="round" />`;
    })
    .join("");

  const portDecorations = new Map<string, string>();
  scene.wires.forEach(({ wire, index }) => {
    const active = isWireActive(index);
    const decorate = (nodeId: number, portId: string) => {
      const node = scene.nodeMap.get(nodeId);
      if (!node) return;
      const anchor = resolvePreviewPortPos(node, portId);
      if (!anchor) return;
      const centerX = node.x + 18;
      const centerY = node.y + 12;
      const dx = centerX - anchor.x;
      const dy = centerY - anchor.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const stubLen = Math.min(8, len);
      const stubX = anchor.x + (dx / len) * stubLen;
      const stubY = anchor.y + (dy / len) * stubLen;
      portDecorations.set(
        `${nodeId}:${portId}`,
        `
          <g>
            <path d="M ${anchor.x} ${anchor.y} L ${stubX} ${stubY}"
              fill="none"
              stroke="${active ? "#ef4444" : "rgba(15,23,42,0.32)"}"
              stroke-width="${active ? 2.6 : 1.8}"
              stroke-linecap="round" />
            <circle cx="${anchor.x}" cy="${anchor.y}" r="${active ? 2.6 : 2.1}"
              fill="${active ? "#ef4444" : "rgba(15,23,42,0.28)"}" />
          </g>
        `.trim()
      );
    };
    decorate(wire.fromNodeId, wire.fromPortId);
    decorate(wire.toNodeId, wire.toPortId);
  });
  const portDecorationsSvg = Array.from(portDecorations.values()).join("");

  const nodesSvg = scene.nodes
    .map((node) => {
      if (node.type === "KEY") {
        const out = portPosForPreview(
          node,
          getDefaultPortId(node, "output"),
          icDefMap,
          scene.portAnchors
        );
        const keyOn = !!previewState.nodeValues?.get(node.id);
        const label = escapeHtml((node.keyChar ?? "?").toUpperCase());
        const keyWidth = 30;
        const keyHeight = 16;
        const keyX = out.x - keyWidth - 10;
        const keyY = out.y - keyHeight / 2;
        return `
          <g>
            <rect x="${keyX}" y="${keyY}" width="${keyWidth}" height="${keyHeight}" rx="4"
              fill="${keyOn ? "rgba(249,115,22,0.16)" : "#ffffff"}"
              stroke="${keyOn ? "#f97316" : "rgba(15,23,42,0.36)"}" stroke-width="1.8" />
            <text x="${keyX + keyWidth / 2}" y="${keyY + 11}" text-anchor="middle"
              font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
              font-size="8.5" fill="#0f172a">${label}</text>
            <path d="M ${keyX + keyWidth} ${out.y} C ${keyX + keyWidth + 4} ${out.y}, ${out.x - 4} ${out.y}, ${out.x} ${out.y}"
              fill="none" stroke="${keyOn ? "#ef4444" : "rgba(15,23,42,0.18)"}"
              stroke-width="${keyOn ? 3 : 2.2}" stroke-linecap="round" />
          </g>
        `.trim();
      }
      if (node.type === "IC") {
        const nestedDef = icDefMap.get(node.icDefId ?? -1);
        const nestedName = escapeHtml((nestedDef?.name ?? "IC").trim() || "IC");
        const nestedLayout = getIcNodeLayout(nestedDef);
        const nestedScale = Math.min(
          1,
          138 / Math.max(1, nestedLayout.nodeWidth),
          188 / Math.max(1, nestedLayout.bodyHeight)
        );
        const nestedWidth = Math.max(
          52,
          Math.min(138, Math.round(nestedLayout.nodeWidth * nestedScale))
        );
        const nestedHeight = Math.max(
          30,
          Math.min(188, Math.round(nestedLayout.bodyHeight * nestedScale))
        );
        const showNestedLabel = nestedHeight >= 42;
        return `
          <g>
            <rect x="${node.x}" y="${node.y}" width="${nestedWidth}" height="${nestedHeight}" rx="8"
              fill="#f8fafc" stroke="rgba(15,23,42,0.32)" stroke-width="1.7" />
            ${
              showNestedLabel
                ? `<text x="${node.x + 8}" y="${node.y + 12}"
                    font-family="ui-monospace, Menlo, Monaco, Consolas, 'Courier New', monospace"
                    font-size="7.4" font-weight="700" fill="#475569"
                    textLength="${Math.max(20, nestedWidth - 16)}" lengthAdjust="spacingAndGlyphs">${nestedName}</text>`
                : ""
            }
          </g>
        `.trim();
      }
      if (
        node.type === "AND" ||
        node.type === "NAND" ||
        node.type === "OR" ||
        node.type === "NOR" ||
        node.type === "XOR" ||
        node.type === "BUFFER" ||
        node.type === "NOT"
      ) {
        return renderPreviewGateNode(
          node,
          previewState.nodeValues?.get(node.id) ?? false,
          hasActiveIncoming(node.id, "a") || hasActiveIncoming(node.id),
          hasActiveIncoming(node.id, "b"),
          hasActiveOutgoing(node)
        );
      }
      return renderPreviewSimpleNode(node, icDefMap, previewState);
    })
    .join("");

  if (previewTooLarge) {
    return `
      <svg xmlns="http://www.w3.org/2000/svg"
           width="${opts.width}" height="${opts.height}"
           viewBox="${bounds.minX} ${bounds.minY} ${vbW} ${vbH}"
           preserveAspectRatio="xMidYMid meet">
        ${nodesSvg}
        ${ledStackSvg}
      </svg>
    `.trim();
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${opts.width}" height="${opts.height}"
         viewBox="${bounds.minX} ${bounds.minY} ${vbW} ${vbH}"
         preserveAspectRatio="xMidYMid meet">
      ${wiresSvg}
      ${portDecorationsSvg}
      ${nodesSvg}
      ${ledStackSvg}
    </svg>
  `.trim();
}



function forceTwoInputPortLayout(el: HTMLDivElement) {
  const a = el.querySelector<HTMLDivElement>(".node-port-input-a");
  const b = el.querySelector<HTMLDivElement>(".node-port-input-b");
  const out = el.querySelector<HTMLDivElement>(".node-port-output");
  if (a) a.style.top = "30%";
  if (b) b.style.top = "70%";
  if (out) out.style.top = "50%";
}

function displayNameForIcDefinition(def: ICDefinition | undefined, fallbackId?: number) {
  const trimmed = def?.name?.trim();
  if (trimmed) return trimmed;
  return fallbackId != null ? `IC ${fallbackId}` : "IC";
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
      const name = displayNameForIcDefinition(def, node.icDefId);
      const icLayout = getIcNodeLayout(def);
      const inCount = def?.inputNodeIds.length ?? 0;
      const outCount = def?.outputNodeIds.length ?? 0;
      const isCompactIc = icLayout.nodeWidth < 120;
      const renderWidth = icLayout.nodeWidth;
      const renderBodyHeight = icLayout.bodyHeight;
      const useEmptyPreviewShell = shouldUseStaticIcPreview(def);
      el.style.width = `${renderWidth}px`;
      if (isCompactIc) {
        el.classList.add("node-ic-compact");
      }

      el.innerHTML = `
        <div class="node-body ic-body${isCompactIc ? " ic-body-compact" : ""}" style="height:${renderBodyHeight}px">
          <div class="ic-chip-namebar">
            <span class="ic-chip-name">${escapeHtml(name)}</span>
          </div>
          <div class="ic-preview-shell${isCompactIc ? " ic-preview-shell-compact" : ""}${useEmptyPreviewShell ? " ic-preview-shell-empty" : ""}">
            <div class="ic-preview-canvas"></div>
          </div>
        </div>
      `;
      const body = el.querySelector<HTMLDivElement>(".ic-body")!;

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
        const placement = getIcPortPlacement(def, "in", idx);
        p.style.left = `${placement.x}px`;
        p.style.right = "auto";
        p.style.top = `${placement.y}px`;
      });
      outputPorts.forEach((p, idx) => {
        const placement = getIcPortPlacement(def, "out", idx);
        p.style.left = `${placement.x}px`;
        p.style.right = "auto";
        p.style.top = `${placement.y}px`;
      });

      workspace.appendChild(el);
      scheduleFitRenderedNodeText(el);
      cacheNodeElement(node.id, el);
      makeDraggableAndSelectable(el, node);
      setupPorts(el, node);
      updateICLedVisuals();
    } else {
      el = document.createElement("div");
      el.dataset.nodeId = String(node.id);
      const renderHeaderBadge = (fallback = "") => {
        const badgeText = node.badgeText ?? (node.titleText ? "" : fallback);
        return badgeText
          ? `<span class="node-port-label">${escapeHtml(badgeText)}</span>`
          : "";
      };

      if (node.type === "SWITCH") {
        el.className = "node node-switch";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">${escapeHtml(node.titleText ?? "SWITCH")}</span>
            ${renderHeaderBadge("Y")}
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
            <span class="node-title">${escapeHtml(node.titleText ?? "BUTTON")}</span>
            ${renderHeaderBadge("Y")}
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
        const keyLabel = escapeHtml((node.keyChar || "a").slice(0, 1).toUpperCase());
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">KEY</span>
            <span class="node-port-label">Y</span>
          </div>
          <div class="node-body">
            <div class="keycap">${keyLabel}</div>
            <div class="node-port node-port-output"></div>
          </div>
        `;
      } else if (node.type === "OUTPUT") {
        el.className = "node node-output";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">${escapeHtml(node.titleText ?? "OUTPUT")}</span>
            ${renderHeaderBadge("A")}
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
            <span class="node-title">${escapeHtml(node.titleText ?? "LED")}</span>
            ${renderHeaderBadge("")}
          </div>
          <div class="node-body">
            <div class="output-lamp"><div class="output-core"></div></div>
            <div class="node-port node-port-input"></div>
          </div>
        `;
      } else if (node.type === "SPEAKER") {
        const layout = getSpeakerLayout();
        el.className = "node node-speaker";
        el.style.width = `${layout.nodeWidth}px`;
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">SPEAKER</span>
            <span class="node-port-label">4-BIT</span>
          </div>
          <div class="node-body speaker-body">
            ${layout.portPlacements
              .map(
                (placement) => `
                  <div
                    class="node-port node-port-input speaker-port"
                    data-port-id="${getSpeakerPortId(node.id, placement.index)}"
                    data-bit-index="${placement.index}"
                    style="left:${placement.x}px; top:${placement.y}px;"
                    title="Tone bit ${placement.labelWeight}"
                  ></div>
                  <div
                    class="speaker-bit-label"
                    data-bit-index="${placement.index}"
                    style="left:${placement.labelX}px; top:${placement.labelY}px;"
                  >${placement.label}</div>
                `
              )
              .join("")}
            <div class="speaker-illustration" style="left:${layout.iconX}px; top:${layout.iconY}px;">
              ${getSpeakerIconMarkup("workspace")}
            </div>
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
        body.style.setProperty(
          "--display-input-zone-width",
          `${layout.inputGridWidth + DISPLAY_BODY_PADDING_X + DISPLAY_SECTION_GAP / 2}px`
        );

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
      } else if (node.type === "NUMBER_DISPLAY") {
        const layout = getNumberDisplayLayout(node);
        el.className = "node node-number-display";
        el.style.width = `${layout.nodeWidth}px`;
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">NUMBER</span>
            <span class="node-port-label">${layout.digits}D</span>
          </div>
          <div class="node-body number-display-body">
            <div class="number-display-groups"></div>
          </div>
        `;

        const body = el.querySelector<HTMLDivElement>(".number-display-body")!;
        const groups = body.querySelector<HTMLDivElement>(".number-display-groups")!;
        body.style.height = `${layout.bodyHeight}px`;
        groups.style.width = `${layout.screenWidth}px`;
        groups.style.gridTemplateColumns = `repeat(${layout.digits}, ${layout.groupWidth}px)`;
        groups.style.columnGap = `${layout.groupGap}px`;

        layout.portPlacements.forEach((placement) => {
          const port = document.createElement("div");
          port.className = "node-port node-port-input number-display-port";
          port.dataset.portId = getNumberDisplayPortId(node.id, placement.index);
          port.dataset.bitIndex = String(placement.index);
          port.style.left = `${placement.x}px`;
          port.style.top = `${placement.y}px`;
          port.title = `${placement.labelWeight}`;
          body.appendChild(port);

          const label = document.createElement("div");
          label.className = `number-display-bit-label number-display-bit-label-${placement.labelPosition}`;
          label.textContent = placement.label;
          label.style.left = `${placement.labelX}px`;
          label.style.top = `${placement.labelY}px`;
          label.title = `${placement.labelWeight}`;
          body.appendChild(label);
        });

        const digitInsetX = Math.round((layout.groupWidth - layout.digitWidth) / 2);
        const digitInsetY = Math.round((layout.bodyHeight - layout.digitHeight) / 2);

        layout.digitPositions.forEach((_digitPlacement, digitIndex) => {
          const group = document.createElement("div");
          group.className = "number-display-group";
          group.style.width = `${layout.groupWidth}px`;
          group.style.height = `${layout.bodyHeight}px`;

          const digit = document.createElement("div");
          digit.className = "number-display-digit";
          digit.dataset.digitIndex = String(digitIndex);
          digit.textContent = "0";
          digit.style.left = `${digitInsetX}px`;
          digit.style.top = `${digitInsetY}px`;
          group.appendChild(digit);

          groups.appendChild(group);
        });
      } else if (node.type === "GUIDE") {
        const layout = getGuideLayout(node);
        el.className = "node node-guide";
        el.style.width = `${layout.width}px`;
        el.innerHTML = `
          <div class="node-body guide-body"></div>
        `;

        const body = el.querySelector<HTMLDivElement>(".guide-body")!;
        body.style.height = `${layout.height}px`;

        layout.slotCenters.forEach((slotCenter, idx) => {
          const slot = document.createElement("div");
          slot.className = "guide-slot";
          slot.style.top = `${slotCenter}px`;

          const hole = document.createElement("div");
          hole.className = "guide-slot-hole";
          hole.dataset.slotIndex = String(idx);
          hole.title = `Guide slot ${idx + 1}`;
          slot.appendChild(hole);
          body.appendChild(slot);

          const inputPort = document.createElement("div");
          inputPort.className = "node-port node-port-input guide-port guide-port-hidden";
          inputPort.dataset.portId = getGuideInputPortId(node.id, idx);
          inputPort.dataset.slotIndex = String(idx);
          inputPort.style.left = "50%";
          inputPort.style.top = `${slotCenter}px`;
          body.appendChild(inputPort);

          const outputPort = document.createElement("div");
          outputPort.className = "node-port node-port-output guide-port guide-port-hidden";
          outputPort.dataset.portId = getGuideOutputPortId(node.id, idx);
          outputPort.dataset.slotIndex = String(idx);
          outputPort.style.left = "50%";
          outputPort.style.top = `${slotCenter}px`;
          body.appendChild(outputPort);
        });
      } else if (node.type === "CABLE") {
        const geometry = syncCableBounds(node);
        el.className = "node node-cable";
        el.style.width = `${geometry.width}px`;
        el.style.height = `${geometry.height}px`;
        el.innerHTML = `
          <div class="node-body cable-body${geometry.channels > 16 ? " is-dense" : ""}">
            <svg class="cable-lanes-svg" viewBox="0 0 ${geometry.width} ${geometry.height}" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="cable-end-block cable-end-block-start" data-end="start"></div>
            <div class="cable-end-block cable-end-block-end" data-end="end"></div>
          </div>
        `;

        const body = el.querySelector<HTMLDivElement>(".cable-body")!;
        body.style.width = `${geometry.width}px`;
        body.style.height = `${geometry.height}px`;

        const svg = body.querySelector<SVGSVGElement>(".cable-lanes-svg")!;
        const svgNs = "http://www.w3.org/2000/svg";

        geometry.rowOffsets.forEach((rowOffset, channel) => {
          const color = getCableChannelColor(channel);
          const startY = geometry.startLocalY + rowOffset;
          const endY = geometry.endLocalY + rowOffset;

          const lane = document.createElementNS(svgNs, "line");
          lane.setAttribute("class", "cable-lane-line");
          lane.setAttribute("x1", String(geometry.startLocalX));
          lane.setAttribute("y1", String(startY));
          lane.setAttribute("x2", String(geometry.endLocalX));
          lane.setAttribute("y2", String(endY));
          lane.setAttribute("stroke", color);
          lane.setAttribute("stroke-opacity", geometry.channels > 16 ? "0.18" : "0.5");
          lane.setAttribute("stroke-width", geometry.channels > 16 ? "3" : "8");
          lane.setAttribute("stroke-linecap", "round");
          svg.appendChild(lane);

          (["left", "right"] as CableSide[]).forEach((side) => {
            const socketX = side === "left" ? geometry.startLocalX : geometry.endLocalX;
            const socketY =
              (side === "left" ? geometry.startLocalY : geometry.endLocalY) + rowOffset;
            const socket = document.createElement("div");
            socket.className = `cable-socket cable-socket-${side}`;
            socket.dataset.side = side;
            socket.dataset.channel = String(channel);
            socket.style.left = `${socketX}px`;
            socket.style.top = `${socketY}px`;
            socket.style.setProperty("--cable-color", color);
            socket.title = `Cable channel ${channel + 1}`;
            body.appendChild(socket);

            const inputPort = document.createElement("div");
            inputPort.className = "node-port node-port-input cable-port cable-port-hidden";
            inputPort.dataset.portId = getCablePortId(node.id, "in", side, channel);
            inputPort.dataset.side = side;
            inputPort.dataset.channel = String(channel);
            inputPort.style.top = `${socketY}px`;
            inputPort.style.left = `${socketX}px`;
            body.appendChild(inputPort);

            const outputPort = document.createElement("div");
            outputPort.className = "node-port node-port-output cable-port cable-port-hidden";
            outputPort.dataset.portId = getCablePortId(node.id, "out", side, channel);
            outputPort.dataset.side = side;
            outputPort.dataset.channel = String(channel);
            outputPort.style.top = `${socketY}px`;
            outputPort.style.left = `${socketX}px`;
            body.appendChild(outputPort);
          });
        });

        const startHandle = body.querySelector<HTMLDivElement>(".cable-end-block-start");
        const endHandle = body.querySelector<HTMLDivElement>(".cable-end-block-end");
        if (startHandle) {
          startHandle.style.left = `${geometry.startLocalX}px`;
          startHandle.style.top = `${geometry.startLocalY}px`;
          startHandle.style.height = `${geometry.bodyHeight}px`;
        }
        if (endHandle) {
          endHandle.style.left = `${geometry.endLocalX}px`;
          endHandle.style.top = `${geometry.endLocalY}px`;
          endHandle.style.height = `${geometry.bodyHeight}px`;
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
      } else if (node.type === "DFF") {
        el.className = "node node-dff";
        el.innerHTML = `
          <div class="node-header">
            <span class="node-title">DFF</span>
          </div>
          <div class="node-body">
            <div class="dff-chip">
              <span class="dff-label dff-label-d">D</span>
              <span class="dff-label dff-label-clk">CLK</span>
              <span class="dff-label dff-label-q">Q</span>
              <span class="dff-state">0</span>
            </div>
            <div class="node-port node-port-input node-port-input-d"></div>
            <div class="node-port node-port-input node-port-input-clk"></div>
            <div class="node-port node-port-output node-port-output-q"></div>
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

      applyCustomNodeHeader(el, node);
      if (
        node.type !== "SPEAKER" &&
        node.type !== "DISPLAY" &&
        node.type !== "NUMBER_DISPLAY" &&
        node.type !== "GUIDE" &&
        node.type !== "CABLE"
      ) {
        el.style.width = `${getNodeLayoutSize(node).w}px`;
      }

      workspace.appendChild(el);
      scheduleFitRenderedNodeText(el);
      cacheNodeElement(node.id, el);
      makeDraggableAndSelectable(el, node);
      setupPorts(el, node);
      if (node.type === "GUIDE") {
        setupGuideSlotInteractions(el, node);
        updateGuideVisuals();
      }
      if (node.type === "CABLE") {
        setupCableSocketInteractions(el, node);
        setupCableHandleInteractions(el, node);
        updateCableVisuals();
      }

      if (node.type === "SWITCH") setupSwitch(el, node);
      if (node.type === "BUTTON") setupButton(el, node);
      if (isRenameableNodeType(node.type)) setupRenameButton(el, node);
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
  let lastDx = 0;
  let lastDy = 0;
  let hasLastDelta = false;
  let didMove = false;
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

    if (
      target.closest(".node-port") ||
      target.closest(".switch-shell") ||
      target.closest(".node-action-button")
    ) {
      return;
    }
    if (node.type === "CABLE") {
      return;
    }
    if (ev.button !== 0) return;

    dragging = true;
    const pos = workspaceCoordsFromClient(ev);
    startX = pos.x;
    startY = pos.y;
    lastDx = 0;
    lastDy = 0;
    hasLastDelta = false;
    didMove = false;

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
    const dx = snapCoord(pos.x - startX);
    const dy = snapCoord(pos.y - startY);
    if (hasLastDelta && dx === lastDx && dy === lastDy) return;
    hasLastDelta = true;
    lastDx = dx;
    lastDy = dy;
    didMove = true;

    dragOrigins.forEach((origin, id) => {
      const n = nodes.get(id);
      if (!n) return;
      n.x = origin.x + dx;
      n.y = origin.y + dy;
      const nEl = workspace.querySelector<HTMLDivElement>(
        `[data-node-id="${id}"]`
      );
      if (nEl) {
        applyNodeTransform(nEl, n);
      }
    });

    markWireGeometryDirty();
    scheduleWireRender(true);
  }

  function onUp() {
    dragging = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
    if (didMove) {
      markWorkspaceChanged();
    }
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
      else if (port.classList.contains("node-port-input-d")) suffix = "d";
      else if (port.classList.contains("node-port-input-clk")) suffix = "clk";
      else if (port.classList.contains("node-port-output-q")) suffix = "q";
      const role = isOutput ? "out" : "in";
      portId = `${node.id}:${role}:${suffix}`;
      port.dataset.portId = portId;
    }
    portElements.set(portId, port);

    if (node.type === "DISPLAY" && !isOutput) {
      port.addEventListener("mouseenter", () => setDisplayPortHover(portId, true));
      port.addEventListener("mouseleave", () => setDisplayPortHover(portId, false));
    }

    port.addEventListener("mousedown", (ev) => {
      if (previewMode) return;
      if (ev.button !== 0) return;
      if (finishPendingCablePlacement()) return;
      ev.stopPropagation();
      beginWireDrag(node.id, port, ev);
    });
  });
}

function removeMatchingWires(predicate: (wire: Wire) => boolean) {
  for (let i = wires.length - 1; i >= 0; i--) {
    if (!predicate(wires[i])) continue;
    selectedWireIds.delete(wires[i].id);
    wires.splice(i, 1);
  }
}

function clearGuideSlotWires(portId: string) {
  const parsed = parseGuidePortId(portId);
  if (!parsed) return;
  const inputPortId = getGuideInputPortId(parsed.nodeId, parsed.slotIndex);
  const outputPortId = getGuideOutputPortId(parsed.nodeId, parsed.slotIndex);
  removeMatchingWires(
    (wire) => wire.toPortId === inputPortId || wire.fromPortId === outputPortId
  );
}

function clearCableSocketWires(portId: string) {
  const parsed = parseCablePortId(portId);
  if (!parsed) return;
  const inputPortId = getCablePortId(parsed.nodeId, "in", parsed.side, parsed.channel);
  const outputPortId = getCablePortId(parsed.nodeId, "out", parsed.side, parsed.channel);
  removeMatchingWires(
    (wire) => wire.toPortId === inputPortId || wire.fromPortId === outputPortId
  );
}

function setupGuideSlotInteractions(el: HTMLDivElement, node: NodeData) {
  el.querySelectorAll<HTMLDivElement>(".guide-slot-hole").forEach((hole) => {
    hole.addEventListener("mousedown", (ev) => {
      if (previewMode) return;
      if (ev.button !== 0) return;
      if (finishPendingCablePlacement()) return;
      ev.preventDefault();
      ev.stopPropagation();

      const slotIndex = Number(hole.dataset.slotIndex);
      if (!Number.isFinite(slotIndex)) return;
      const outputPort = findPortElementById(getGuideOutputPortId(node.id, slotIndex));
      if (!outputPort) return;
      beginWireDrag(node.id, outputPort, ev);
    });
  });
}

function setupCableSocketInteractions(el: HTMLDivElement, node: NodeData) {
  el.querySelectorAll<HTMLDivElement>(".cable-socket").forEach((socket) => {
    socket.addEventListener("mousedown", (ev) => {
      if (previewMode) return;
      if (ev.button !== 0) return;
      if (finishPendingCablePlacement()) return;
      ev.preventDefault();
      ev.stopPropagation();

      const side = socket.dataset.side as CableSide | undefined;
      const channel = Number(socket.dataset.channel);
      if ((side !== "left" && side !== "right") || !Number.isFinite(channel)) return;
      const outputPort = findPortElementById(getCablePortId(node.id, "out", side, channel));
      if (!outputPort) return;
      beginWireDrag(node.id, outputPort, ev);
    });
  });
}

function setupCableHandleInteractions(el: HTMLDivElement, node: NodeData) {
  el.querySelectorAll<HTMLDivElement>(".cable-end-block").forEach((handle) => {
    handle.addEventListener("mousedown", (ev) => {
      if (previewMode) return;
      if (ev.button !== 0) return;
      if (finishPendingCablePlacement()) return;
      ev.preventDefault();
      ev.stopPropagation();

      if (!selectedNodeIds.has(node.id)) {
        handleNodeSelection(node.id, ev);
      }

      const targetEnd = handle.dataset.end === "start" ? "start" : "end";
      const start = workspaceCoordsFromClient(ev);
      const origin = getCableEndpoints(node);
      let didMove = false;

      const onMove = (moveEv: MouseEvent) => {
        const pos = workspaceCoordsFromClient(moveEv);
        const dx = pos.x - start.x;
        const dy = pos.y - start.y;
        const nextEndX = targetEnd === "end" ? snapCoord(origin.endX + dx) : node.cableEndX;
        const nextEndY = targetEnd === "end" ? snapCoord(origin.endY + dy) : node.cableEndY;
        const nextStartX = targetEnd === "start" ? snapCoord(origin.startX + dx) : node.cableStartX;
        const nextStartY = targetEnd === "start" ? snapCoord(origin.startY + dy) : node.cableStartY;

        if (
          nextStartX === node.cableStartX &&
          nextStartY === node.cableStartY &&
          nextEndX === node.cableEndX &&
          nextEndY === node.cableEndY
        ) {
          return;
        }

        if (targetEnd === "end") {
          node.cableEndX = nextEndX;
          node.cableEndY = nextEndY;
        } else {
          node.cableStartX = nextStartX;
          node.cableStartY = nextStartY;
        }

        updateCableNodeGeometry(node, el);
        markWireGeometryDirty();
        scheduleWireRender(true);
        didMove = true;
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        if (didMove) {
          markWorkspaceChanged();
        }
        recomputeSignals();
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });
}

function beginWireDrag(
  fromNodeId: number,
  portEl: HTMLDivElement,
  _ev: MouseEvent
) {
  const fromPortId = portEl.dataset.portId;
  const startKind = portEl.dataset.portKind as PortKind | undefined;
  if (!fromPortId || (startKind !== "input" && startKind !== "output")) return;

  const start = getPortCenter(portEl);
  const pathEl = createWirePath(true);

  portEl.classList.add("port-dragging");

  dragState = {
    fromNodeId,
    fromPortId,
    startKind,
    startX: start.x,
    startY: start.y,
    pathEl,
    originPort: portEl,
  };

  updateWirePath(pathEl, start.x, start.y, start.x, start.y);

  window.addEventListener("mousemove", onWireDragMove);
  window.addEventListener("mouseup", onWireDragEnd);
}

function resolvePortTarget(
  target: HTMLElement | null,
  desiredKind: PortKind
): HTMLDivElement | null {
  if (!target) return null;

  const selector =
    desiredKind === "input" ? ".node-port-input" : ".node-port-output";
  const directPort = target.closest<HTMLDivElement>(selector);
  if (directPort) return directPort;

  const guideHole = target.closest<HTMLDivElement>(".guide-slot-hole");
  if (guideHole) {
    const slotIndex = Number(guideHole.dataset.slotIndex);
    const guideNode = guideHole.closest<HTMLDivElement>(".node-guide");
    const nodeId = Number(guideNode?.dataset.nodeId);
    if (Number.isFinite(slotIndex) && Number.isFinite(nodeId)) {
      return (
        guideNode?.querySelector<HTMLDivElement>(
          `.${desiredKind === "input" ? "node-port-input" : "node-port-output"}[data-port-id="${
            desiredKind === "input"
              ? getGuideInputPortId(nodeId, slotIndex)
              : getGuideOutputPortId(nodeId, slotIndex)
          }"]`
        ) ?? null
      );
    }
  }

  const cableSocket = target.closest<HTMLDivElement>(".cable-socket");
  if (cableSocket) {
    const side = cableSocket.dataset.side as CableSide | undefined;
    const channel = Number(cableSocket.dataset.channel);
    const cableNode = cableSocket.closest<HTMLDivElement>(".node-cable");
    const nodeId = Number(cableNode?.dataset.nodeId);
    if (
      (side === "left" || side === "right") &&
      Number.isFinite(channel) &&
      Number.isFinite(nodeId)
    ) {
      const portId = getCablePortId(
        nodeId,
        desiredKind === "input" ? "in" : "out",
        side,
        channel
      );
      return (
        cableNode?.querySelector<HTMLDivElement>(
          `.${desiredKind === "input" ? "node-port-input" : "node-port-output"}[data-port-id="${portId}"]`
        ) ?? null
      );
    }
  }

  if (desiredKind !== "input") return null;
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

function describePortKind(kind: PortKind): string {
  return kind === "input" ? "an input" : "an output";
}

function tryAutoRouteGuideSlot(inputPort: HTMLDivElement, ev: MouseEvent): boolean {
  if (!dragState) return false;
  if (dragState.startKind !== "output") return false;

  const guideNodeId = Number(inputPort.dataset.nodeId);
  const inputPortId = inputPort.dataset.portId;
  if (!Number.isFinite(guideNodeId) || !inputPortId) return false;

  const guideNode = nodes.get(guideNodeId);
  if (!guideNode || guideNode.type !== "GUIDE") return false;

  const outputPortId = getGuidePairPortId(inputPortId);
  if (!outputPortId || dragState.fromPortId === outputPortId) return false;

  clearGuideSlotWires(inputPortId);

  wires.push({
    id: nextWireId++,
    fromNodeId: dragState.fromNodeId,
    toNodeId: guideNodeId,
    fromPortId: dragState.fromPortId,
    toPortId: inputPortId,
    isActive: false,
  });

  dragState.originPort.classList.remove("port-dragging");
  const outputPort = findPortElementById(outputPortId);
  if (!outputPort) {
    dragState.pathEl.remove();
    dragState = null;
    markWireGeometryDirty();
    markWorkspaceChanged();
    recomputeSignals();
    return true;
  }

  outputPort.classList.add("port-dragging");
  const start = getPortCenter(outputPort);
  dragState.fromNodeId = guideNodeId;
  dragState.fromPortId = outputPortId;
  dragState.startKind = "output";
  dragState.startX = start.x;
  dragState.startY = start.y;
  dragState.originPort = outputPort;

  const pos = workspaceCoordsFromClient(ev);
  updateWirePath(dragState.pathEl, start.x, start.y, pos.x, pos.y);
  markWireGeometryDirty();
  markWorkspaceChanged();
  recomputeSignals();
  return true;
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
  const desiredKind: PortKind = dragState.startKind === "output" ? "input" : "output";
  const targetPort = resolvePortTarget(target, desiredKind);
  if (
    dragState.startKind === "output" &&
    targetPort &&
    target?.closest(".guide-slot-hole") &&
    tryAutoRouteGuideSlot(targetPort, ev)
  ) {
    if (hoveredDisplayPortId) {
      setDisplayPortHover(hoveredDisplayPortId, false);
    }
    return;
  }
  const hoveredPortId = desiredKind === "input" ? targetPort?.dataset.portId ?? null : null;
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
  const desiredKind: PortKind = dragState.startKind === "output" ? "input" : "output";
  const targetPort = resolvePortTarget(target, desiredKind);
  const invalidSameKindPort = resolvePortTarget(target, dragState.startKind);

  if (targetPort) {
    const targetNodeId = Number(targetPort.dataset.nodeId);
    const targetPortId = targetPort.dataset.portId;
    if (!targetPortId) {
      dragState.pathEl.remove();
      dragState = null;
      renderAllWires();
      return;
    }

    const finalFromNodeId =
      dragState.startKind === "output" ? dragState.fromNodeId : targetNodeId;
    const finalToNodeId =
      dragState.startKind === "output" ? targetNodeId : dragState.fromNodeId;
    const finalFromPortId =
      dragState.startKind === "output" ? dragState.fromPortId : targetPortId;
    const finalToPortId =
      dragState.startKind === "output" ? targetPortId : dragState.fromPortId;

    const targetNode = nodes.get(finalToNodeId);
    if (
      targetNode?.type === "GUIDE" &&
      getGuidePairPortId(finalToPortId) === finalFromPortId
    ) {
      dragState.pathEl.remove();
      dragState = null;
      renderAllWires();
      return;
    }
    if (
      finalFromNodeId === finalToNodeId &&
      (targetNode?.type === "GUIDE" || targetNode?.type === "CABLE")
    ) {
      dragState.pathEl.remove();
      dragState = null;
      renderAllWires();
      return;
    }

    for (let i = wires.length - 1; i >= 0; i--) {
      if (wires[i].toPortId === finalToPortId) {
        wires.splice(i, 1);
      }
    }
    if (parseGuidePortId(finalToPortId)?.role === "in") {
      clearGuideSlotWires(finalToPortId);
    }
    if (parseCablePortId(finalToPortId)?.role === "in") {
      clearCableSocketWires(finalToPortId);
    }

    const wire: Wire = {
      id: nextWireId++,
      fromNodeId: finalFromNodeId,
      toNodeId: finalToNodeId,
      fromPortId: finalFromPortId,
      toPortId: finalToPortId,
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

  if (
    invalidSameKindPort &&
    invalidSameKindPort.dataset.portId &&
    invalidSameKindPort.dataset.portId !== dragState.fromPortId
  ) {
    toast(
      `You connected ${describePortKind(dragState.startKind)} to ${describePortKind(
        dragState.startKind
      )}. That won't do anything.`
    );
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
  wireLayer.classList.toggle("wire-layer-heavy", wires.length > 260);

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

    const activeFlag = wire.isActive ? "1" : "0";
    if (path.dataset.active !== activeFlag) {
      path.dataset.active = activeFlag;
      path.classList.toggle("wire-path-active", wire.isActive);
    }
    const selectedFlag = selectedWireIds.has(wire.id) ? "1" : "0";
    if (path.dataset.selected !== selectedFlag) {
      path.dataset.selected = selectedFlag;
      path.classList.toggle("wire-selected", selectedWireIds.has(wire.id));
    }
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
  portOutputs: Map<string, boolean>;
  nodeValues: Map<number, boolean>;
  wireStates: boolean[];
  speakerStates: IcSpeakerState[];
}

function getComputedPortSignal(
  node: NodeData,
  portId: string,
  nodeValues: Map<number, boolean>,
  portOutputs: Map<string, boolean>
): boolean {
  if (node.type === "IC" || node.type === "GUIDE" || node.type === "CABLE") {
    return portOutputs.get(portId) ?? false;
  }
  return nodeValues.get(node.id) ?? false;
}

function didBooleanMapChange(
  previous: Map<string, boolean>,
  next: Map<string, boolean>
): boolean {
  if (previous.size !== next.size) return true;
  for (const [key, value] of next) {
    if ((previous.get(key) ?? false) !== value) return true;
  }
  for (const [key, value] of previous) {
    if ((next.get(key) ?? false) !== value) return true;
  }
  return false;
}

function getWorkspacePortSignal(node: NodeData, portId: string): boolean {
  if (node.type === "IC" || node.type === "GUIDE" || node.type === "CABLE") {
    return derivedPortValues.get(portId) ?? false;
  }
  return node.value;
}

function simulateIC(
  def: ICDefinition,
  inputVals: boolean[],
  stack: number[] = [],
  runtimeKey?: string
): ICResult {
  if (stack.includes(def.id) || stack.length > 8) {
    return {
      outputs: new Array(def.outputNodeIds.length).fill(false),
      ledStates: new Array(def.ledNodeIds.length).fill(false),
      portOutputs: new Map<string, boolean>(),
      nodeValues: new Map<number, boolean>(),
      wireStates: new Array(def.wires.length).fill(false),
      speakerStates: [],
    };
  }

  const runtime = runtimeKey ? ensureIcRuntimeState(def, runtimeKey) : null;
  if (runtime) {
    catchUpRuntimeClocks(runtime, performance.now());
  }
  const simCache = getIcDefinitionSimulationCache(def);
  const relevantNodeIds = simCache.relevantNodeIds;
  const simWireEntries = simCache.wireEntries;
  const simNodeIds = simCache.relevantNodeIdList;
  const inputIndexByNodeId = simCache.inputIndexByNodeId;
  const dffClockState = new Map<number, boolean>(
    runtime ? Array.from(runtime.dffLastClockInput.entries()) : []
  );
  const localVals = new Map<number, boolean>();
  const nodeMap = new Map<number, NodeData>();
  simNodeIds.forEach((nodeId) => {
    const node = runtime?.nodes.get(nodeId) ?? simCache.nodeById.get(nodeId);
    if (!node) return;
    nodeMap.set(nodeId, node);
    localVals.set(nodeId, node.value ?? false);
  });

  simNodeIds.forEach((nodeId) => {
    const n = simCache.nodeById.get(nodeId);
    if (!n) return;
    if (n.type === "SWITCH") {
      const idx = inputIndexByNodeId.get(n.id) ?? -1;
      if (idx >= 0) localVals.set(n.id, !!inputVals[idx]);
    } else if (n.type === "POWER") {
      localVals.set(n.id, true);
    }
  });

  let derivedOutputs = new Map<string, boolean>();
  let finalWireStates = new Array(def.wires.length).fill(false);
  let finalSpeakerStates: IcSpeakerState[] = [];
  const nestedResultCache = new Map<string, ICResult>();

  const simNodeCount = nodeMap.size;
  const MAX_STEPS = Math.max(16, simNodeCount * 4 + simWireEntries.length * 2);

  for (let step = 0; step < MAX_STEPS; step++) {
    let changed = false;
    const incTrue = new Map<number, number>();
    const incAny = new Map<number, boolean>();
    const icInputs = new Map<number, boolean[]>();
    const guideInputs = new Map<number, boolean[]>();
    const cableInputs = new Map<number, { left: boolean[]; right: boolean[] }>();
    const speakerInputs = new Map<number, boolean[]>();
    const incomingPortSignals = new Map<string, boolean>();
    const stepSpeakerStates: IcSpeakerState[] = [];

    nodeMap.forEach((n) => {
      incTrue.set(n.id, 0);
      incAny.set(n.id, false);
    });

    const nextWireStates = new Array(def.wires.length).fill(false);

    simWireEntries.forEach(({ wire: w, index: wireIndex }) => {
      const fromNode = nodeMap.get(w.fromNodeId);
      if (!fromNode) return;

      const srcVal = getComputedPortSignal(
        fromNode,
        w.fromPortId,
        localVals,
        derivedOutputs
      );
      nextWireStates[wireIndex] = srcVal;
      if (!srcVal) return;
      incomingPortSignals.set(w.toPortId, true);

      const curCount = incTrue.get(w.toNodeId) ?? 0;
      incTrue.set(w.toNodeId, curCount + 1);
      incAny.set(w.toNodeId, true);

      const toNode = nodeMap.get(w.toNodeId);
      if (toNode?.type === "IC") {
        const [, role, suffix] = w.toPortId.split(":");
        if (role === "in") {
          const nestedDef = getIcDefinitionById(toNode.icDefId);
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
      } else if (toNode?.type === "GUIDE") {
        const parsed = parseGuidePortId(w.toPortId);
        if (!parsed || parsed.role !== "in") return;
        let arr = guideInputs.get(toNode.id);
        if (!arr) {
          arr = new Array(getGuideLength(toNode)).fill(false);
          guideInputs.set(toNode.id, arr);
        }
        if (parsed.slotIndex >= 0 && parsed.slotIndex < arr.length) {
          arr[parsed.slotIndex] = true;
        }
      } else if (toNode?.type === "CABLE") {
        const parsed = parseCablePortId(w.toPortId);
        if (!parsed || parsed.role !== "in") return;
        let entry = cableInputs.get(toNode.id);
        if (!entry) {
          const channelCount = getCableChannels(toNode);
          entry = {
            left: new Array(channelCount).fill(false),
            right: new Array(channelCount).fill(false),
          };
          cableInputs.set(toNode.id, entry);
        }
        const arr = parsed.side === "left" ? entry.left : entry.right;
        if (parsed.channel >= 0 && parsed.channel < arr.length) {
          arr[parsed.channel] = true;
        }
      } else if (toNode?.type === "SPEAKER") {
        const [, role, suffix] = w.toPortId.split(":");
        if (role !== "in") return;
        const idx = Number(suffix);
        if (!Number.isFinite(idx) || idx < 0 || idx >= SPEAKER_INPUT_WEIGHTS.length) return;
        let arr = speakerInputs.get(toNode.id);
        if (!arr) {
          arr = new Array(SPEAKER_INPUT_WEIGHTS.length).fill(false);
          speakerInputs.set(toNode.id, arr);
        }
        arr[idx] = true;
      }
    });

    finalWireStates = nextWireStates;
    const nextDerivedOutputs = new Map<string, boolean>();

    nodeMap.forEach((n) => {
      let newVal = localVals.get(n.id) ?? false;

      switch (n.type) {
        case "SWITCH": {
          const idx = inputIndexByNodeId.get(n.id) ?? -1;
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
        case "DFF": {
          const dInput = incomingPortSignals.get(`${n.id}:in:d`) ?? false;
          const clkInput = incomingPortSignals.get(`${n.id}:in:clk`) ?? false;
          const lastClock = dffClockState.get(n.id) ?? false;
          if (clkInput && !lastClock) {
            newVal = dInput;
          } else {
            newVal = localVals.get(n.id) ?? false;
          }
          dffClockState.set(n.id, clkInput);
          break;
        }
        case "OUTPUT":
        case "LED": {
          newVal = incAny.get(n.id) ?? false;
          break;
        }
        case "SPEAKER": {
          const toneInputs =
            speakerInputs.get(n.id) ?? new Array(SPEAKER_INPUT_WEIGHTS.length).fill(false);
          const toneValue = getSpeakerToneValue(toneInputs);
          if (runtimeKey) {
            stepSpeakerStates.push({
              key: `${runtimeKey}/speaker:${n.id}`,
              toneValue,
              frequency: getSpeakerPlaybackFrequency(n, toneValue),
            });
          }
          newVal = toneValue > 0;
          break;
        }
        case "DISPLAY": {
          newVal = incAny.get(n.id) ?? false;
          break;
        }
        case "NUMBER_DISPLAY": {
          newVal = incAny.get(n.id) ?? false;
          break;
        }
        case "GUIDE": {
          const slotInputs =
            guideInputs.get(n.id) ?? new Array(getGuideLength(n)).fill(false);
          const guideActive = slotInputs.some(Boolean);
          slotInputs.forEach((_isActive, idx) => {
            nextDerivedOutputs.set(getGuideOutputPortId(n.id, idx), guideActive);
          });
          newVal = guideActive;
          break;
        }
        case "CABLE": {
          const inputs = cableInputs.get(n.id) ?? {
            left: new Array(getCableChannels(n)).fill(false),
            right: new Array(getCableChannels(n)).fill(false),
          };
          for (let channel = 0; channel < inputs.left.length; channel++) {
            const leftActive = inputs.left[channel];
            const rightActive = inputs.right[channel];
            const laneActive = leftActive !== rightActive;
            nextDerivedOutputs.set(
              getCablePortId(n.id, "out", "left", channel),
              laneActive
            );
            nextDerivedOutputs.set(
              getCablePortId(n.id, "out", "right", channel),
              laneActive
            );
          }
          newVal = inputs.left.some(Boolean) || inputs.right.some(Boolean);
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
          if (!runtime || !runtimeKey) {
            newVal = any;
            break;
          }

          const last = runtime.bufferLastInput.get(n.id) ?? false;
          if (any !== last) {
            runtime.bufferLastInput.set(n.id, any);
            const delay = n.bufferDelayMs ?? 100;
            let pending = runtime.bufferTimeouts.get(n.id);
            if (!pending) {
              pending = new Set<number>();
              runtime.bufferTimeouts.set(n.id, pending);
            }
            const nextValue = any;
            const timeoutId = window.setTimeout(() => {
              const liveRuntime = icRuntimeStates.get(runtimeKey);
              const liveNode = liveRuntime?.nodes.get(n.id);
              if (!liveRuntime || !liveNode) return;
              liveNode.value = nextValue;
              const livePending = liveRuntime.bufferTimeouts.get(n.id);
              livePending?.delete(timeoutId);
              if (livePending && livePending.size === 0) {
                liveRuntime.bufferTimeouts.delete(n.id);
              }
              scheduleSignalRecompute();
            }, delay);
            pending.add(timeoutId);
          }
          newVal = localVals.get(n.id) ?? false;
          break;
        }
        case "CLOCK": {
          newVal = localVals.get(n.id) ?? false;
          break;
        }
        case "IC": {
          const nestedDef = getIcDefinitionById(n.icDefId);
          if (!nestedDef) {
            newVal = false;
            break;
          }
          const inputArr =
            icInputs.get(n.id) ??
            new Array(nestedDef.inputNodeIds.length).fill(false);
          const nestedRuntimeKey = runtimeKey ? `${runtimeKey}/ic:${n.id}` : undefined;
          const cacheKey = `${nestedDef.id}:${nestedRuntimeKey ?? ""}:${inputArr
            .map((value) => (value ? "1" : "0"))
            .join("")}`;
          let result = nestedResultCache.get(cacheKey);
          if (!result) {
            result = simulateIC(
              nestedDef,
              inputArr,
              [...stack, def.id],
              nestedRuntimeKey
            );
            nestedResultCache.set(cacheKey, result);
          }
          result.outputs.forEach((v, idx) => {
            const portId = `${n.id}:out:${idx}`;
            nextDerivedOutputs.set(portId, v);
          });
          stepSpeakerStates.push(...result.speakerStates);
          newVal = result.outputs.some(Boolean);
          break;
        }
      }

      if (newVal !== (localVals.get(n.id) ?? false)) {
        localVals.set(n.id, newVal);
        changed = true;
      }
    });

    const portOutputsChanged = didBooleanMapChange(derivedOutputs, nextDerivedOutputs);
    derivedOutputs = nextDerivedOutputs;
    finalSpeakerStates = stepSpeakerStates;
    if (!changed && portOutputsChanged) {
      changed = true;
    }
    if (!changed) break;
  }

  if (runtime) {
    runtime.nodes.forEach((runtimeNode, nodeId) => {
      if (relevantNodeIds && !relevantNodeIds.has(nodeId)) return;
      runtimeNode.value = localVals.get(nodeId) ?? runtimeNode.value;
    });
    runtime.portOutputs = new Map(derivedOutputs);
    runtime.wireStates = finalWireStates.slice();
    runtime.dffLastClockInput = new Map(dffClockState);
  }

  const outputs = def.outputNodeIds.map((id) => localVals.get(id) ?? false);
  const ledStates = def.ledNodeIds.map((id) => localVals.get(id) ?? false);
  return {
    outputs,
    ledStates,
    portOutputs: derivedOutputs,
    nodeValues: localVals,
    wireStates: finalWireStates,
    speakerStates: finalSpeakerStates,
  };
}

function recomputeSignals() {
  signalRecomputeEpoch += 1;
  workspaceIcResults.clear();
  catchUpWorkspaceClocks(performance.now());
  nodes.forEach((node) => {
    if (
      node.type !== "SWITCH" &&
      node.type !== "BUTTON" &&
      node.type !== "CLOCK" &&
      node.type !== "DFF" &&
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
  derivedPortValues = new Map<string, boolean>();
  const activeIcRuntimeRoots = new Set<string>();
  const nextDffClockState = new Map<number, boolean>(dffLastClockInput);

  const MAX_STEPS = Math.max(32, nodes.size * 4 + wires.length * 2);

  for (let step = 0; step < MAX_STEPS; step++) {
    let changed = false;

    const incomingTrueCount = new Map<number, number>();
    const incomingAnyTrue = new Map<number, boolean>();
    const icInputs = new Map<number, boolean[]>();
    const guideInputs = new Map<number, boolean[]>();
    const cableInputs = new Map<number, { left: boolean[]; right: boolean[] }>();
    const incomingPortSignals = new Map<string, boolean>();

    nodes.forEach((node) => {
      incomingTrueCount.set(node.id, 0);
      incomingAnyTrue.set(node.id, false);
    });

    wires.forEach((wire) => {
      const from = nodes.get(wire.fromNodeId);
      if (!from) return;

      const srcVal = getWorkspacePortSignal(from, wire.fromPortId);
      if (!srcVal) return;
      incomingPortSignals.set(wire.toPortId, true);

      const toId = wire.toNodeId;
      incomingAnyTrue.set(toId, true);
      const cur = incomingTrueCount.get(toId) ?? 0;
      incomingTrueCount.set(toId, cur + 1);

      const toNode = nodes.get(toId);
      if (toNode?.type === "IC") {
        const [, role, suffix] = wire.toPortId.split(":");
        if (role === "in") {
          const def = getIcDefinitionById(toNode.icDefId);
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
      } else if (toNode?.type === "GUIDE") {
        const parsed = parseGuidePortId(wire.toPortId);
        if (!parsed || parsed.role !== "in") return;
        let arr = guideInputs.get(toId);
        if (!arr) {
          arr = new Array(getGuideLength(toNode)).fill(false);
          guideInputs.set(toId, arr);
        }
        if (parsed.slotIndex >= 0 && parsed.slotIndex < arr.length) {
          arr[parsed.slotIndex] = true;
        }
      } else if (toNode?.type === "CABLE") {
        const parsed = parseCablePortId(wire.toPortId);
        if (!parsed || parsed.role !== "in") return;
        let entry = cableInputs.get(toId);
        if (!entry) {
          const channelCount = getCableChannels(toNode);
          entry = {
            left: new Array(channelCount).fill(false),
            right: new Array(channelCount).fill(false),
          };
          cableInputs.set(toId, entry);
        }
        const arr = parsed.side === "left" ? entry.left : entry.right;
        if (parsed.channel >= 0 && parsed.channel < arr.length) {
          arr[parsed.channel] = true;
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
        scheduleSignalRecompute();
      }, delay);
      pending.add(tid);
    });

    const nextDerivedPortValues = new Map<string, boolean>();

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
        case "DFF": {
          const dInput = incomingPortSignals.get(`${node.id}:in:d`) ?? false;
          const clkInput = incomingPortSignals.get(`${node.id}:in:clk`) ?? false;
          const lastClock = nextDffClockState.get(node.id) ?? false;
          if (clkInput && !lastClock) {
            newVal = dInput;
          } else {
            newVal = node.value;
          }
          nextDffClockState.set(node.id, clkInput);
          break;
        }
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
        case "NUMBER_DISPLAY": {
          newVal = incomingAnyTrue.get(node.id) ?? false;
          break;
        }
        case "GUIDE": {
          const slotInputs =
            guideInputs.get(node.id) ?? new Array(getGuideLength(node)).fill(false);
          const guideActive = slotInputs.some(Boolean);
          slotInputs.forEach((_isActive, idx) => {
            nextDerivedPortValues.set(getGuideOutputPortId(node.id, idx), guideActive);
          });
          newVal = guideActive;
          break;
        }
        case "CABLE": {
          const inputs = cableInputs.get(node.id) ?? {
            left: new Array(getCableChannels(node)).fill(false),
            right: new Array(getCableChannels(node)).fill(false),
          };
          for (let channel = 0; channel < inputs.left.length; channel++) {
            const leftActive = inputs.left[channel];
            const rightActive = inputs.right[channel];
            const laneActive = leftActive !== rightActive;
            nextDerivedPortValues.set(
              getCablePortId(node.id, "out", "left", channel),
              laneActive
            );
            nextDerivedPortValues.set(
              getCablePortId(node.id, "out", "right", channel),
              laneActive
            );
          }
          newVal = inputs.left.some(Boolean) || inputs.right.some(Boolean);
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
          const def = getIcDefinitionById(node.icDefId);
          if (!def) break;
          const inputArr =
            icInputs.get(node.id) ??
            new Array(def.inputNodeIds.length).fill(false);
          const runtimeKey = `workspace:${node.id}`;
          activeIcRuntimeRoots.add(runtimeKey);
          const result = simulateIC(def, inputArr, [], runtimeKey);
          workspaceIcResults.set(node.id, result);
          result.outputs.forEach((v, idx) => {
            const portId = `${node.id}:out:${idx}`;
            nextDerivedPortValues.set(portId, v);
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

    const portOutputsChanged = didBooleanMapChange(derivedPortValues, nextDerivedPortValues);
    derivedPortValues = nextDerivedPortValues;

    if (!changed && portOutputsChanged) {
      changed = true;
    }

    if (!changed) break;
  }

  dffLastClockInput.clear();
  nextDffClockState.forEach((value, nodeId) => {
    if (nodes.has(nodeId)) {
      dffLastClockInput.set(nodeId, value);
    }
  });

  wires.forEach((wire) => {
    const from = nodes.get(wire.fromNodeId);
    if (!from) return;
    wire.isActive = getWorkspacePortSignal(from, wire.fromPortId);
  });

  updateOutputVisuals();
  updateLEDVisuals();
  updateDffVisuals();
  updateSpeakerVisuals();
  updateDisplayVisuals();
  updateNumberDisplayVisuals();
  updateGuideVisuals();
  updateCableVisuals();
  updateICLedVisuals();
  updateGateVisuals();
  updateIcSpeakerVoices();
  pruneUnusedIcRuntimeTrees(activeIcRuntimeRoots);
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

function updateDffVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "DFF") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;
    el.classList.toggle("is-on", !!node.value);
    const stateEl = el.querySelector<HTMLSpanElement>(".dff-state");
    if (stateEl) stateEl.textContent = node.value ? "1" : "0";
  });
}

function getSpeakerInputValues(node: NodeData): boolean[] {
  const values = new Array(SPEAKER_INPUT_WEIGHTS.length).fill(false);
  wires.forEach((wire) => {
    if (wire.toNodeId !== node.id) return;
    const [, role, suffix] = wire.toPortId.split(":");
    if (role !== "in") return;
    const index = Number(suffix);
    if (!Number.isFinite(index) || index < 0 || index >= values.length) return;
    const fromNode = nodes.get(wire.fromNodeId);
    if (!fromNode) return;
    if (getWorkspacePortSignal(fromNode, wire.fromPortId)) {
      values[index] = true;
    }
  });
  return values;
}

function getSpeakerToneValue(inputValues: boolean[]): number {
  return inputValues.reduce(
    (sum, isOn, index) => sum + (isOn ? SPEAKER_INPUT_WEIGHTS[index] ?? 0 : 0),
    0
  );
}

function getSpeakerPlaybackFrequency(node: NodeData, toneValue: number): number {
  const baseFrequency = getSpeakerFrequency(node);
  if (toneValue <= 0) return baseFrequency;
  const noteOffset = toneValue - 1;
  return clamp(
    baseFrequency * 2 ** (noteOffset / 12),
    MIN_SPEAKER_FREQUENCY_HZ,
    MAX_SPEAKER_PLAYBACK_FREQUENCY_HZ
  );
}

function updateSpeakerVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "SPEAKER") return;

    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    const icon = el?.querySelector<HTMLDivElement>(".speaker-icon") ?? null;
    const inputValues = getSpeakerInputValues(node);
    const toneValue = getSpeakerToneValue(inputValues);
    const normalized = toneValue / 15;
    const levelBands = toneValue > 0 ? Math.max(1, Math.ceil(normalized * 3)) : 0;

    icon?.classList.toggle("is-on", toneValue > 0);
    icon?.style.setProperty("--speaker-level", normalized.toFixed(3));
    icon?.style.setProperty("--speaker-band-count", String(levelBands));

    el?.querySelectorAll<HTMLDivElement>(".speaker-port").forEach((portEl) => {
      const bitIndex = Number(portEl.dataset.bitIndex);
      portEl.classList.toggle("is-active", !!inputValues[bitIndex]);
    });
    el?.querySelectorAll<HTMLDivElement>(".speaker-bit-label").forEach((labelEl) => {
      const bitIndex = Number(labelEl.dataset.bitIndex);
      labelEl.classList.toggle("is-active", !!inputValues[bitIndex]);
    });

    const voice = toneValue > 0
      ? ensureSpeakerVoice(node)
      : (speakerVoices.get(node.id) ?? null);
    if (!voice) return;

    const ctx = voice.gain.context;
    const now = ctx.currentTime;
    voice.oscillator.frequency.setTargetAtTime(
      getSpeakerPlaybackFrequency(node, toneValue),
      now,
      0.03
    );
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(
      toneValue > 0 ? 0.01 + normalized * 0.032 : 0,
      now,
      toneValue > 0 ? 0.025 : 0.07
    );
  });

  Array.from(speakerVoices.keys()).forEach((nodeId) => {
    const node = nodes.get(nodeId);
    if (!node || node.type !== "SPEAKER") {
      stopSpeakerVoice(nodeId);
    }
  });
}

function updateIcSpeakerVoices() {
  const activeKeys = new Set<string>();

  workspaceIcResults.forEach((result) => {
    result.speakerStates.forEach((speakerState) => {
      activeKeys.add(speakerState.key);
      const existingVoice = icSpeakerVoices.get(speakerState.key);
      const voice =
        speakerState.toneValue > 0
          ? ensureIcSpeakerVoice(speakerState.key, speakerState.frequency)
          : existingVoice ?? null;
      if (!voice) return;

      const ctx = voice.gain.context;
      const now = ctx.currentTime;
      const normalized = speakerState.toneValue / 15;

      voice.oscillator.frequency.setTargetAtTime(
        speakerState.frequency,
        now,
        0.03
      );
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(
        speakerState.toneValue > 0 ? 0.008 + normalized * 0.026 : 0,
        now,
        speakerState.toneValue > 0 ? 0.025 : 0.07
      );
    });
  });

  Array.from(icSpeakerVoices.keys()).forEach((key) => {
    if (!activeKeys.has(key)) stopIcSpeakerVoice(key);
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
        const isOn = activeInputs.has(getDisplayPortId(node.id, index));
        const nextFlag = isOn ? "1" : "0";
        if (pixelEl.dataset.on === nextFlag) return;
        pixelEl.dataset.on = nextFlag;
        pixelEl.classList.toggle("is-on", isOn);
      });
  });
}

function getNumberDisplayInputValues(node: NodeData): boolean[] {
  const inputCount = getNumberDisplayInputCount(node);
  const values = new Array(inputCount).fill(false);
  wires.forEach((wire) => {
    if (wire.toNodeId !== node.id) return;
    const [, role, suffix] = wire.toPortId.split(":");
    if (role !== "in") return;
    const index = Number(suffix);
    if (!Number.isFinite(index) || index < 0 || index >= inputCount) return;
    const fromNode = nodes.get(wire.fromNodeId);
    if (!fromNode) return;
    if (getWorkspacePortSignal(fromNode, wire.fromPortId)) {
      values[index] = true;
    }
  });
  return values;
}

function numberDisplayCharsFromInputs(values: boolean[]): string[] {
  const chars: string[] = [];
  for (let offset = 0; offset < values.length; offset += NUMBER_DISPLAY_BITS_PER_DIGIT) {
    const nibble = values.slice(offset, offset + NUMBER_DISPLAY_BITS_PER_DIGIT);
    const weights = [1, 2, 4, 8];
    const numeric = nibble.reduce(
      (sum, bit, idx) => sum + (bit ? weights[idx] ?? 0 : 0),
      0
    );
    chars.push(numeric.toString(16).toUpperCase());
  }
  return chars;
}

function updateNumberDisplayVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "NUMBER_DISPLAY") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;

    const inputValues = getNumberDisplayInputValues(node);
    const chars = numberDisplayCharsFromInputs(inputValues);
    el.querySelectorAll<HTMLDivElement>(".number-display-digit").forEach((digitEl, index) => {
      digitEl.textContent = chars[index] ?? "0";
      digitEl.classList.toggle("is-on", (chars[index] ?? "0") !== "0");
    });
    el.querySelectorAll<HTMLDivElement>(".number-display-port").forEach((portEl) => {
      const bitIndex = Number(portEl.dataset.bitIndex);
      portEl.classList.toggle("is-active", !!inputValues[bitIndex]);
    });
    el.querySelectorAll<HTMLDivElement>(".number-display-bit-label").forEach((labelEl, index) => {
      labelEl.classList.toggle("is-active", !!inputValues[index]);
    });
  });
}

function updateGuideVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "GUIDE") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;

    const occupiedInputs = new Set(
      wires.filter((wire) => wire.toNodeId === node.id).map((wire) => wire.toPortId)
    );
    const occupiedOutputs = new Set(
      wires.filter((wire) => wire.fromNodeId === node.id).map((wire) => wire.fromPortId)
    );

    el.querySelectorAll<HTMLDivElement>(".guide-slot-hole").forEach((hole) => {
      const slotIndex = Number(hole.dataset.slotIndex);
      if (!Number.isFinite(slotIndex)) return;
      const inputPortId = getGuideInputPortId(node.id, slotIndex);
      const outputPortId = getGuideOutputPortId(node.id, slotIndex);
      const isOccupied =
        occupiedInputs.has(inputPortId) || occupiedOutputs.has(outputPortId);
      const isActive = derivedPortValues.get(outputPortId) ?? false;
      hole.classList.toggle("is-occupied", isOccupied);
      hole.classList.toggle("is-active", isActive);
    });
  });
}

function updateCableVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "CABLE") return;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!el) return;

    const occupied = new Set<string>();
    wires.forEach((wire) => {
      if (wire.toNodeId === node.id) occupied.add(wire.toPortId);
      if (wire.fromNodeId === node.id) occupied.add(wire.fromPortId);
    });

    el.querySelectorAll<HTMLDivElement>(".cable-socket").forEach((socket) => {
      const side = socket.dataset.side as CableSide | undefined;
      const channel = Number(socket.dataset.channel);
      if ((side !== "left" && side !== "right") || !Number.isFinite(channel)) return;
      const inputPortId = getCablePortId(node.id, "in", side, channel);
      const outputPortId = getCablePortId(node.id, "out", side, channel);
      const isOccupied = occupied.has(inputPortId) || occupied.has(outputPortId);
      const isActive =
        derivedPortValues.get(outputPortId) ||
        wires.some((wire) => wire.toPortId === inputPortId && wire.isActive);
      socket.classList.toggle("is-occupied", isOccupied);
      socket.classList.toggle("is-active", !!isActive);
    });
  });
}

function renderIcPreviewInto(
  container: HTMLElement,
  def: ICDefinition,
  width: number,
  height: number,
  state?: IcPreviewRenderState,
  defs?: ICDefinition[]
) {
  container.innerHTML = shouldUseStaticIcPreview(def)
    ? renderStaticIcPreviewSummary(def, width, height)
    : renderIcPreviewSvg({
        def,
        icDefinitions: defs,
        width,
        height,
        state,
      });
}

function renderPaletteIcIconInto(
  container: HTMLElement,
  _def: ICDefinition,
  width: number,
  height: number
) {
  const chipWidth = Math.min(width - 22, 92);
  const chipHeight = Math.min(height - 18, 54);
  const chipX = (width - chipWidth) / 2;
  const chipY = (height - chipHeight) / 2;
  const leftPortX = chipX - 7;
  const rightPortX = chipX + chipWidth + 7;
  const portY = chipY + chipHeight / 2;

  container.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}" height="${height}"
         viewBox="0 0 ${width} ${height}"
         preserveAspectRatio="xMidYMid meet"
         aria-hidden="true">
      <rect x="${chipX}" y="${chipY}" width="${chipWidth}" height="${chipHeight}" rx="4"
            fill="#efefef" stroke="#9ca3af" stroke-width="2" />
      <circle cx="${leftPortX}" cy="${portY}" r="7"
              fill="#111827" stroke="#111827" stroke-width="2" />
      <circle cx="${rightPortX}" cy="${portY}" r="7"
              fill="#ffffff" stroke="#6b7280" stroke-width="2" />
    </svg>
  `.trim();
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

function updateICLedVisuals() {
  nodes.forEach((node) => {
    if (node.type !== "IC") return;
    const icEl =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (!icEl) return;
    icEl.classList.remove("is-active");

    const previewCanvas = icEl.querySelector<HTMLDivElement>(".ic-preview-canvas");
    const def = getIcDefinitionById(node.icDefId);
    if (!previewCanvas || !def) return;

    const layout = getIcNodeLayout(def);
    icEl.style.width = `${layout.nodeWidth}px`;
    const body = icEl.querySelector<HTMLDivElement>(".ic-body");
    if (body) {
      body.style.height = `${layout.bodyHeight}px`;
      body.classList.toggle("ic-body-compact", layout.nodeWidth < 120);
      const inputPorts = Array.from(body.querySelectorAll<HTMLDivElement>(".ic-port-input"));
      const outputPorts = Array.from(body.querySelectorAll<HTMLDivElement>(".ic-port-output"));
      inputPorts.forEach((port, index) => {
        const placement = getIcPortPlacement(def, "in", index);
        port.style.left = `${placement.x}px`;
        port.style.top = `${placement.y}px`;
      });
      outputPorts.forEach((port, index) => {
        const placement = getIcPortPlacement(def, "out", index);
        port.style.left = `${placement.x}px`;
        port.style.top = `${placement.y}px`;
      });
    }
    const titleEl = icEl.querySelector<HTMLElement>(".ic-chip-name");
    if (titleEl) {
      titleEl.textContent = displayNameForIcDefinition(def, node.icDefId);
      scheduleFitRenderedNodeText(icEl);
    }
    const previewShell = icEl.querySelector<HTMLDivElement>(".ic-preview-shell");
    if (previewShell) {
      previewShell.classList.toggle("ic-preview-shell-empty", shouldUseStaticIcPreview(def));
    }
    const result = workspaceIcResults.get(node.id);
    const previewWidth = Math.max(92, layout.nodeWidth - 32);
    const previewHeight = Math.max(56, layout.bodyHeight - 22);
    const previewKey = shouldUseStaticIcPreview(def)
      ? `static:${def.id}:${previewWidth}:${previewHeight}`
      : `live:${def.id}:${previewWidth}:${previewHeight}:${
          def.nodes.map((entry) => (result?.nodeValues?.get(entry.id) ? "1" : "0")).join("")
        }:${(result?.wireStates ?? []).map((value) => (value ? "1" : "0")).join("")}:${
          (result?.ledStates ?? []).map((value) => (value ? "1" : "0")).join("")
        }`;
    if (previewCanvas.dataset.previewKey === previewKey) return;
    previewCanvas.dataset.previewKey = previewKey;
    renderIcPreviewInto(
      previewCanvas,
      def,
      previewWidth,
      previewHeight,
      result
        ? {
            nodeValues: result.nodeValues,
            wireStates: result.wireStates,
            portOutputs: result.portOutputs,
            ledStates: result.ledStates,
          }
        : undefined
    );
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

function uniqueICName(baseName: string, excludeId?: number): string {
  let name = baseName.trim() || "New IC";
  const collides = (candidate: string) =>
    icDefinitions.some((d) => d.id !== excludeId && d.name === candidate);
  if (!collides(name)) return name;
  let idx = 2;
  while (collides(`${name}${idx}`)) idx++;
  return `${name}${idx}`;
}

function rerenderWorkspaceIcInstances(_defId?: number) {
  resetAllIcRuntimeState();
  let touched = false;
  nodes.forEach((node) => {
    if (node.type !== "IC") return;
    rerenderNode(node);
    touched = true;
  });
  if (!touched) return;
  updateSelectionStyles();
  recomputeSignals();
}

async function renameICDefinition(def: ICDefinition) {
  const rawName = await promptTextModal({
    title: "Rename IC",
    label: "IC name",
    value: def.name,
    hint: "This updates the palette card and every visible copy on the board.",
    submitLabel: "Rename",
    validate: (value) => (!value.trim() ? "Give the IC a name first." : null),
  });
  if (!rawName) return;

  const nextName = uniqueICName(rawName, def.id);
  if (nextName === def.name) return;

  def.name = nextName;
  refreshICPalette(def);
  rerenderWorkspaceIcInstances(def.id);
  if (mode === "ic-edit" && editingICId === def.id) {
    setIcEditToolbar(def);
  }
  markWorkspaceChanged();
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
  markIcDefinitionsDirty();
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
    hint: "This sets the base pitch. The 1/2/4/8 inputs step around it like a crude 4-bit synth.",
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

async function setNumberDisplayDigitsForNodes(numberDisplays: NodeData[]) {
  if (numberDisplays.length === 0) return;

  const current = getNumberDisplayDigits(numberDisplays[0]);
  const next = await promptNumberModal({
    title: "Set Number Display Digits",
    label: "Digits",
    hint: "Each digit always consumes 4 inputs. So 1 digit needs 4 inputs, 2 digits need 8, and so on.",
    min: MIN_NUMBER_DISPLAY_DIGITS,
    max: MAX_NUMBER_DISPLAY_DIGITS,
    step: 1,
    value: current,
    submitLabel: "Apply",
  });
  if (next == null) return;

  numberDisplays.forEach((node) => {
    node.numberDigits = next;
    pruneNumberDisplayWires(node);
    rerenderNode(node);
  });

  recomputeSignals();
  markWorkspaceChanged();
}

function setNumberDisplayDigitsForSelection() {
  const numberDisplays = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "NUMBER_DISPLAY");
  if (numberDisplays.length === 0) return;
  void setNumberDisplayDigitsForNodes(numberDisplays);
}

async function setGuideLengthForNodes(guideNodes: NodeData[]) {
  if (guideNodes.length === 0) return;

  const current = getGuideLength(guideNodes[0]);
  const next = await promptNumberModal({
    title: "Set Guide Length",
    label: "Slots",
    hint: "Cable guides stay one tile wide. This changes how many holes the guide has.",
    min: MIN_GUIDE_LENGTH,
    max: MAX_GUIDE_LENGTH,
    step: 1,
    value: current,
    submitLabel: "Apply",
  });
  if (next == null) return;

  guideNodes.forEach((node) => {
    node.guideLength = next;
    pruneGuideWires(node);
    rerenderNode(node);
  });

  recomputeSignals();
  markWorkspaceChanged();
}

function setGuideLengthForSelection() {
  const guides = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "GUIDE");
  if (guides.length === 0) return;
  void setGuideLengthForNodes(guides);
}

async function setCableChannelsForNodes(cables: NodeData[]) {
  if (cables.length === 0) return;

  const current = getCableChannels(cables[0]);
  const next = await promptNumberModal({
    title: "Set Cable Channels",
    label: "Channels",
    hint: "Each color lane is a separate wire path through the cable.",
    min: MIN_CABLE_CHANNELS,
    max: MAX_CABLE_CHANNELS,
    step: 1,
    value: current,
    submitLabel: "Apply",
  });
  if (next == null) return;

  cables.forEach((node) => {
    node.cableChannels = next;
    pruneCableWires(node);
    rerenderNode(node);
  });

  recomputeSignals();
  markWorkspaceChanged();
}

function setCableChannelsForSelection() {
  const cables = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((n): n is NodeData => !!n && n.type === "CABLE");
  if (cables.length === 0) return;
  void setCableChannelsForNodes(cables);
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

function fitTextToAvailableWidth(
  textEl: HTMLElement,
  options: { minFontSizePx?: number; minLetterSpacingEm?: number } = {}
) {
  const minFontSizePx = options.minFontSizePx ?? 7.5;
  const minLetterSpacingEm = options.minLetterSpacingEm ?? 0.02;
  textEl.style.fontSize = "";
  textEl.style.letterSpacing = "";
  textEl.classList.remove("node-title-compact", "node-title-tight");

  const computed = window.getComputedStyle(textEl);
  let fontSizePx = Number.parseFloat(computed.fontSize) || 10;
  let letterSpacingPx = Number.parseFloat(computed.letterSpacing);
  if (!Number.isFinite(letterSpacingPx)) {
    letterSpacingPx = fontSizePx * 0.16;
  }

  let guard = 0;
  while (textEl.scrollWidth > textEl.clientWidth && guard < 40) {
    if (fontSizePx > minFontSizePx) {
      fontSizePx -= 0.4;
      textEl.style.fontSize = `${fontSizePx}px`;
    } else if (letterSpacingPx > fontSizePx * minLetterSpacingEm) {
      letterSpacingPx -= 0.15;
      textEl.style.letterSpacing = `${Math.max(
        fontSizePx * minLetterSpacingEm,
        letterSpacingPx
      )}px`;
    } else {
      break;
    }
    guard++;
  }
}

function applyNodeTitleSizing(titleEl: HTMLElement, text: string) {
  titleEl.title = text;
}

function applyCustomNodeHeader(el: HTMLDivElement, node: NodeData) {
  const header = el.querySelector<HTMLDivElement>(".node-header");
  if (!header) return;

  const titleEl = header.querySelector<HTMLElement>(".node-title");
  if (titleEl) {
    const text = getVisibleNodeTitle(node);
    titleEl.textContent = text;
    applyNodeTitleSizing(titleEl, text);
  }

  let actionsEl = header.querySelector<HTMLDivElement>(".node-header-actions");
  if (!actionsEl) {
    actionsEl = document.createElement("div");
    actionsEl.className = "node-header-actions";
    Array.from(header.children).forEach((child) => {
      if (child === titleEl) return;
      actionsEl!.appendChild(child);
    });
    if (actionsEl.childElementCount > 0 || isRenameableNodeType(node.type)) {
      header.appendChild(actionsEl);
    }
  }

  const badgeEl = actionsEl?.querySelector<HTMLSpanElement>(".node-port-label");
  if (badgeEl && node.badgeText != null) {
    if (node.badgeText.trim()) {
      badgeEl.textContent = node.badgeText;
    } else {
      badgeEl.remove();
    }
  }

  if (isRenameableNodeType(node.type) && actionsEl) {
    let renameButton = actionsEl.querySelector<HTMLButtonElement>(".node-rename-button");
    if (!renameButton) {
      renameButton = document.createElement("button");
      renameButton.type = "button";
      renameButton.className = "node-action-button node-rename-button";
      renameButton.textContent = "Rename";
      actionsEl.insertBefore(renameButton, actionsEl.firstChild);
    }
  }

  if (actionsEl && actionsEl.childElementCount === 0) {
    actionsEl.remove();
  }
}

function fitRenderedNodeText(el: HTMLElement) {
  const nodeTitle = el.querySelector<HTMLElement>(".node-title");
  if (nodeTitle) {
    fitTextToAvailableWidth(nodeTitle, { minFontSizePx: 7.25, minLetterSpacingEm: 0.01 });
  }

  const icName = el.querySelector<HTMLElement>(".ic-chip-name");
  if (icName) {
    fitTextToAvailableWidth(icName, { minFontSizePx: 7, minLetterSpacingEm: 0.01 });
  }
}

function scheduleFitRenderedNodeText(el: HTMLElement) {
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    fitRenderedNodeText(el);
  });
}

async function renameNodeLabel(node: NodeData) {
  if (!isRenameableNodeType(node.type)) return;

  const nextLabel = await promptTextModal({
    title: "Rename Node",
    label: "Visible label",
    value: node.titleText ?? getDefaultNodeTitle(node.type),
    hint: "Leave blank to reset back to the default label.",
    submitLabel: "Apply",
  });
  if (nextLabel == null) return;

  const trimmed = nextLabel.trim();
  const fallback = getDefaultNodeTitle(node.type);
  node.titleText = trimmed && trimmed !== fallback ? trimmed : undefined;
  rerenderNode(node);
  markWorkspaceChanged();
}

function setupRenameButton(el: HTMLDivElement, node: NodeData) {
  const button = el.querySelector<HTMLButtonElement>(".node-rename-button");
  if (!button) return;

  button.addEventListener("mousedown", (ev) => {
    ev.stopPropagation();
  });

  button.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (previewMode) return;
    void renameNodeLabel(node);
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
    newNode.titleText = n.titleText;
    newNode.badgeText = n.badgeText;
    newNode.lightColor = n.lightColor;
    newNode.clockDelayMs = n.clockDelayMs;
    newNode.bufferDelayMs = n.bufferDelayMs;
    newNode.keyChar = n.keyChar;
    newNode.keyMode = n.keyMode;
    newNode.rotation = n.rotation ?? 0;
    newNode.speakerFrequencyHz = n.speakerFrequencyHz;
    newNode.displayWidth = n.displayWidth;
    newNode.displayHeight = n.displayHeight;
    newNode.numberDigits = n.numberDigits;
    newNode.guideLength = n.guideLength;
    newNode.cableChannels = n.cableChannels;
    newNode.cableLength = n.cableLength;
    newNode.cableStartX =
      typeof n.cableStartX === "number" ? n.cableStartX + lastPasteOffset : undefined;
    newNode.cableStartY =
      typeof n.cableStartY === "number" ? n.cableStartY + lastPasteOffset : undefined;
    newNode.cableEndX =
      typeof n.cableEndX === "number" ? n.cableEndX + lastPasteOffset : undefined;
    newNode.cableEndY =
      typeof n.cableEndY === "number" ? n.cableEndY + lastPasteOffset : undefined;
    if (
      newNode.type === "DISPLAY" ||
      newNode.type === "NUMBER_DISPLAY" ||
      newNode.type === "GUIDE" ||
      newNode.type === "CABLE"
    ) {
      if (newNode.type === "CABLE") {
        syncCableBounds(newNode);
      }
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

function remapPortIdToNode(portId: string, nodeId: number): string {
  const [, role, suffix] = portId.split(":");
  return `${nodeId}:${role}:${suffix}`;
}

function getNodeIcDefinition(node: NodeData | null | undefined): ICDefinition | undefined {
  if (!node || node.type !== "IC" || node.icDefId == null) return undefined;
  return icDefinitions.find((entry) => entry.id === node.icDefId);
}

function parseIcPortIndex(portId: string, role: "in" | "out"): number | null {
  const [, parsedRole, suffix] = portId.split(":");
  if (parsedRole !== role) return null;
  const index = Number(suffix);
  return Number.isFinite(index) && index >= 0 ? index : null;
}

function cloneNodeIntoWorkspaceFromIc(
  source: NodeData,
  offsetX: number,
  offsetY: number
): NodeData {
  const clone: NodeData = {
    ...source,
    id: nextNodeId++,
    x: snapCoord(source.x + offsetX),
    y: snapCoord(source.y + offsetY),
  };

  if (clone.type === "CABLE") {
    clone.cableStartX =
      typeof source.cableStartX === "number"
        ? snapCoord(source.cableStartX + offsetX)
        : undefined;
    clone.cableStartY =
      typeof source.cableStartY === "number"
        ? snapCoord(source.cableStartY + offsetY)
        : undefined;
    clone.cableEndX =
      typeof source.cableEndX === "number"
        ? snapCoord(source.cableEndX + offsetX)
        : undefined;
    clone.cableEndY =
      typeof source.cableEndY === "number"
        ? snapCoord(source.cableEndY + offsetY)
        : undefined;
    syncCableBounds(clone);
  }

  nodes.set(clone.id, clone);
  renderNode(clone);
  initializeNodeDynamicBehavior(clone);
  return clone;
}

function ungroupIcNode(icNode: NodeData): number[] {
  if (!icNode || icNode.type !== "IC" || icNode.icDefId == null) return [];

  const def = getNodeIcDefinition(icNode);
  if (!def) {
    toast("This IC is missing its definition, so it can’t be ungrouped.");
    return [];
  }

  const omittedNodeIds = new Set<number>([
    ...def.inputNodeIds,
    ...def.outputNodeIds,
  ]);
  const innerNodes = def.nodes.filter((node) => !omittedNodeIds.has(node.id));
  if (innerNodes.length === 0) {
    toast("This IC only contains input/output shells, so there’s nothing to ungroup.");
    return [];
  }

  const minX = Math.min(...innerNodes.map((node) => node.x));
  const minY = Math.min(...innerNodes.map((node) => node.y));
  const offsetX = icNode.x + GRID_SIZE - minX;
  const offsetY = icNode.y + GRID_SIZE - minY;

  const externalIncoming = new Map<number, Wire[]>();
  const externalOutgoing = new Map<number, Wire[]>();
  wires.forEach((wire) => {
    if (wire.toNodeId === icNode.id) {
      const inputIndex = parseIcPortIndex(wire.toPortId, "in");
      if (inputIndex != null) {
        const arr = externalIncoming.get(inputIndex) ?? [];
        arr.push({ ...wire });
        externalIncoming.set(inputIndex, arr);
      }
    }
    if (wire.fromNodeId === icNode.id) {
      const outputIndex = parseIcPortIndex(wire.fromPortId, "out");
      if (outputIndex != null) {
        const arr = externalOutgoing.get(outputIndex) ?? [];
        arr.push({ ...wire });
        externalOutgoing.set(outputIndex, arr);
      }
    }
  });

  const idMap = new Map<number, number>();
  const newNodeIds: number[] = [];
  const addedWireKeys = new Set<string>();

  const addWireIfMissing = (
    fromNodeId: number,
    fromPortId: string,
    toNodeId: number,
    toPortId: string
  ) => {
    const key = `${fromNodeId}|${fromPortId}|${toNodeId}|${toPortId}`;
    if (addedWireKeys.has(key)) return;
    addedWireKeys.add(key);
    wires.push({
      id: nextWireId++,
      fromNodeId,
      fromPortId,
      toNodeId,
      toPortId,
      isActive: false,
    });
  };

  innerNodes.forEach((node) => {
    const clone = cloneNodeIntoWorkspaceFromIc(node, offsetX, offsetY);
    idMap.set(node.id, clone.id);
    newNodeIds.push(clone.id);
  });

  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    if (wire.fromNodeId !== icNode.id && wire.toNodeId !== icNode.id) continue;
    selectedWireIds.delete(wire.id);
    wires.splice(i, 1);
  }

  teardownNodeDynamicBehavior(icNode.id);
  nodes.delete(icNode.id);
  const icEl =
    nodeElements.get(icNode.id) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${icNode.id}"]`);
  uncacheNodeElement(icNode.id);
  icEl?.remove();

  def.wires.forEach((wireDef) => {
    const fromMappedId = idMap.get(wireDef.fromNodeId);
    const toMappedId = idMap.get(wireDef.toNodeId);
    const fromInputIndex = def.inputNodeIds.indexOf(wireDef.fromNodeId);
    const toOutputIndex = def.outputNodeIds.indexOf(wireDef.toNodeId);

    if (fromMappedId != null && toMappedId != null) {
      addWireIfMissing(
        fromMappedId,
        remapPortIdToNode(wireDef.fromPortId, fromMappedId),
        toMappedId,
        remapPortIdToNode(wireDef.toPortId, toMappedId)
      );
      return;
    }

    if (fromInputIndex >= 0 && toMappedId != null) {
      const incoming = externalIncoming.get(fromInputIndex) ?? [];
      incoming.forEach((externalWire) => {
        addWireIfMissing(
          externalWire.fromNodeId,
          externalWire.fromPortId,
          toMappedId,
          remapPortIdToNode(wireDef.toPortId, toMappedId)
        );
      });
      return;
    }

    if (fromMappedId != null && toOutputIndex >= 0) {
      const outgoing = externalOutgoing.get(toOutputIndex) ?? [];
      outgoing.forEach((externalWire) => {
        addWireIfMissing(
          fromMappedId,
          remapPortIdToNode(wireDef.fromPortId, fromMappedId),
          externalWire.toNodeId,
          externalWire.toPortId
        );
      });
      return;
    }

    if (fromInputIndex >= 0 && toOutputIndex >= 0) {
      const incoming = externalIncoming.get(fromInputIndex) ?? [];
      const outgoing = externalOutgoing.get(toOutputIndex) ?? [];
      incoming.forEach((externalIn) => {
        outgoing.forEach((externalOut) => {
          addWireIfMissing(
            externalIn.fromNodeId,
            externalIn.fromPortId,
            externalOut.toNodeId,
            externalOut.toPortId
          );
        });
      });
    }
  });

  return newNodeIds;
}

function ungroupSelectedIcs() {
  const selectedIcs = Array.from(selectedNodeIds)
    .map((id) => nodes.get(id))
    .filter((node): node is NodeData => !!node && node.type === "IC");
  if (selectedIcs.length === 0) return;

  const newNodeIds: number[] = [];
  withDeferredWireRendering(() => {
    selectedIcs.forEach((icNode) => {
      newNodeIds.push(...ungroupIcNode(icNode));
    });
  });

  clearSelection();
  newNodeIds.forEach((nodeId) => selectedNodeIds.add(nodeId));
  updateSelectionStyles();
  markWireGeometryDirty();
  recomputeSignals();
  markWorkspaceChanged();
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

  const hasNumberDisplayNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "NUMBER_DISPLAY";
  });

  const hasGuideNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "GUIDE";
  });

  const hasCableNode = Array.from(selectedNodeIds).some((id) => {
    const n = nodes.get(id);
    return n && n.type === "CABLE";
  });

  const selectedIcCount = Array.from(selectedNodeIds).reduce((count, id) => {
    const node = nodes.get(id);
    return count + (node?.type === "IC" ? 1 : 0);
  }, 0);
  const canUngroupIc = selectedIcCount > 0;

  function addItem(label: string, handler: () => void, disabled?: boolean) {
    if (disabled) return;
    const item = document.createElement("button");
    item.className = "context-menu-item";
    item.textContent = label;
    item.addEventListener("click", () => {
      hideContextMenu();
      handler();
    });
    contextMenuEl!.appendChild(item);
  }

  if (targetKind === "node") {
    addItem("Copy", () => copySelection(), !hasNode);
    addItem("Paste", () => pasteSelection(), !canPaste);
    addItem("Create IC", () => void createICFromSelection(), !hasNode);
    addItem(
      selectedIcCount > 1 ? "Ungroup ICs" : "Ungroup IC",
      () => ungroupSelectedIcs(),
      !canUngroupIc
    );
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
    addItem(
      "Set Number Display Digits…",
      () => void setNumberDisplayDigitsForSelection(),
      !hasNumberDisplayNode
    );
    addItem(
      "Set Guide Length…",
      () => void setGuideLengthForSelection(),
      !hasGuideNode
    );
    addItem(
      "Set Cable Channels…",
      () => void setCableChannelsForSelection(),
      !hasCableNode
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

function updateIcToolboxPickUi() {
  const isPicking = !!pendingIcToolboxPickResolve;
  paletteUploadBanner.hidden = !isPicking;
  palette.classList.toggle("palette-is-picking-upload", isPicking);
  palette
    .querySelectorAll<HTMLElement>(".palette-item-ic")
    .forEach((card) => card.classList.toggle("is-upload-eligible", isPicking));
}

function resolvePendingIcToolboxPick(def: ICDefinition | null) {
  const resolve = pendingIcToolboxPickResolve;
  pendingIcToolboxPickResolve = null;
  updateIcToolboxPickUi();
  resolve?.(def);
}

async function promptIcDefinitionForToolboxUpload(): Promise<ICDefinition | null> {
  if (icDefinitions.length === 0) {
    toast("Create an IC first, then upload it from the left column.");
    return null;
  }

  if (pendingIcToolboxPickResolve) {
    resolvePendingIcToolboxPick(null);
  }

  cancelActivePaletteDrag();
  finishPendingCablePlacement();

  return await new Promise((resolve) => {
    pendingIcToolboxPickResolve = resolve;
    updateIcToolboxPickUi();
    toast("Select an IC from the left column to upload it.");
  });
}

function addICPaletteButton(def: ICDefinition, beforeEl?: ChildNode | null) {
  if (def.paletteHidden) return;
  paletteCustomIcSection.hidden = false;
  const btn = document.createElement("div");
  btn.className = "palette-item palette-item-ic";
  btn.dataset.icId = String(def.id);
  btn.innerHTML = `
    <div class="palette-node palette-ic-node">
      <div class="ic-mini-header">
        <span class="node-title ic-mini-title">${escapeHtml(def.name)}</span>
      </div>
      <div class="node-body ic-mini-body">
        <div class="ic-mini-preview"></div>
        <div class="ic-mini-footer">
          <div class="ic-card-actions">
            <button class="ic-card-button ic-rename-button" type="button">Rename</button>
            <button class="ic-card-button ic-edit-button" type="button">Edit</button>
          </div>
        </div>
      </div>
    </div>
  `;
  if (beforeEl) paletteIcGrid.insertBefore(btn, beforeEl);
  else paletteIcGrid.appendChild(btn);

  const preview = btn.querySelector<HTMLDivElement>(".ic-mini-preview")!;
  renderPaletteIcIconInto(preview, def, 92, 42);

  const coreBtn = btn.querySelector<HTMLDivElement>(".palette-ic-node")!;
  coreBtn.addEventListener("click", () => {
    if (previewMode) return;
    if (pendingIcToolboxPickResolve) {
      resolvePendingIcToolboxPick(def);
      return;
    }
    finishPendingCablePlacement();
    const center = visibleWorkspaceCenter();
    instantiateIC(def.id, center.x, center.y);
  });

  btn.draggable = true;
  btn.addEventListener("dragstart", (ev) => {
    if (previewMode || pendingIcToolboxPickResolve) {
      ev.preventDefault();
      return;
    }
    cancelActivePaletteDrag();
    finishPendingCablePlacement();
    paletteDragPayload = { icId: def.id };
    if (ev.dataTransfer) {
      ev.dataTransfer.setData("text/plain", "IC");
      ev.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }
  });
  btn.addEventListener("dragend", (ev) => {
    if (previewMode) return;
    if (tryFinalizePaletteDragFromClientPoint(ev.clientX, ev.clientY)) return;
    cancelActivePaletteDrag();
  });

  const editBtn = btn.querySelector<HTMLButtonElement>(".ic-edit-button")!;
  editBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (previewMode) return;
    if (pendingIcToolboxPickResolve) {
      resolvePendingIcToolboxPick(def);
      return;
    }
    enterICEdit(def.id);
  });

  const renameBtn = btn.querySelector<HTMLButtonElement>(".ic-rename-button")!;
  renameBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (previewMode) return;
    if (pendingIcToolboxPickResolve) {
      resolvePendingIcToolboxPick(def);
      return;
    }
    void renameICDefinition(def);
  });

  updateIcToolboxPickUi();
}

function updateCustomIcPaletteSectionVisibility() {
  paletteCustomIcSection.hidden = paletteIcGrid.children.length === 0;
}

function refreshICPalette(def: ICDefinition) {
  const btn = palette.querySelector<HTMLElement>(
    `.palette-item-ic[data-ic-id="${def.id}"]`
  );
  if (!btn) return;
  const nextSibling = btn.nextSibling;
  btn.remove();
  addICPaletteButton(def, nextSibling);
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
  resetAllIcRuntimeState();
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
    resetNodeValueForDefinition(clone);
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
  setIcEditToolbar(def);
}

function exitICEdit() {
  if (mode !== "ic-edit" || editingICId == null) return;
  const def = icDefinitions.find((d) => d.id === editingICId);
  if (!def || !mainNodesSnapshot || !mainWiresSnapshot || !mainNotesSnapshot) {
    mode = "main";
    editingICId = null;
    setIcEditToolbar(null);
    return;
  }

  const editedNodes = Array.from(nodes.values()).map((n) => {
    const clone = { ...n };
    resetNodeValueForDefinition(clone);
    return clone;
  });
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
  markIcDefinitionsDirty();

  refreshICPalette(def);
  resetAllIcRuntimeState();

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
  setIcEditToolbar(null);

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

function finishPendingCablePlacement(): boolean {
  if (pendingCablePlacementId == null) return false;
  pendingCablePlacementId = null;
  recomputeSignals();
  markWorkspaceChanged();
  return true;
}

function cancelActivePaletteDrag() {
  const activeNodeId = activePaletteDragNodeId;
  const shouldRemoveNode = activePaletteDragCreatedNode && activeNodeId != null;

  activePaletteDragNodeId = null;
  activePaletteDragCreatedNode = false;
  paletteDragPayload = null;

  if (!shouldRemoveNode || activeNodeId == null) return;

  for (let i = wires.length - 1; i >= 0; i--) {
    const wire = wires[i];
    if (wire.fromNodeId === activeNodeId || wire.toNodeId === activeNodeId) {
      selectedWireIds.delete(wire.id);
      wires.splice(i, 1);
    }
  }

  const node = nodes.get(activeNodeId);
  if (node) {
    teardownNodeDynamicBehavior(activeNodeId);
    nodes.delete(activeNodeId);
  }

  selectedNodeIds.delete(activeNodeId);
  const el =
    nodeElements.get(activeNodeId) ??
    workspace.querySelector<HTMLDivElement>(`[data-node-id="${activeNodeId}"]`);
  uncacheNodeElement(activeNodeId);
  el?.remove();

  markWireGeometryDirty();
  recomputeSignals();
  markWorkspaceChanged();
}

function isClientPointInsideWorkspace(clientX: number, clientY: number): boolean {
  const rect = workspaceWrapper.getBoundingClientRect();
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

function materializePaletteDragNodeAt(baseX: number, baseY: number): NodeData | null {
  if (activePaletteDragNodeId != null) {
    return nodes.get(activePaletteDragNodeId) ?? null;
  }
  if (paletteDragPayload?.icId != null) {
    const node = instantiateIC(paletteDragPayload.icId, baseX, baseY);
    if (!node) return null;
    activePaletteDragNodeId = node.id;
    activePaletteDragCreatedNode = true;
    return node;
  }
  if (paletteDragPayload?.type) {
    const node = createNode(paletteDragPayload.type, baseX, baseY);
    activePaletteDragNodeId = node.id;
    activePaletteDragCreatedNode = true;
    return node;
  }
  return null;
}

function positionPaletteDragNode(node: NodeData, baseX: number, baseY: number) {
  if (node.type === "CABLE") {
    const nextX = snapCoord(baseX);
    const nextY = snapCoord(baseY);
    const dx = nextX - node.x;
    const dy = nextY - node.y;
    if (dx === 0 && dy === 0) return;
    moveCableBy(node, dx, dy);
    updateCableNodeGeometry(node);
  } else {
    const nextX = snapCoord(baseX);
    const nextY = snapCoord(baseY);
    if (nextX === node.x && nextY === node.y) return;
    node.x = nextX;
    node.y = nextY;
    const el =
      nodeElements.get(node.id) ??
      workspace.querySelector<HTMLDivElement>(`[data-node-id="${node.id}"]`);
    if (el) {
      applyNodeTransform(el, node);
    }
  }
  markWireGeometryDirty();
  scheduleWireRender(true);
}

function finalizePaletteDragNode(node: NodeData) {
  if (node.type === "CABLE") {
    syncCableBounds(node);
    pendingCablePlacementId = node.id;
    pendingCableAnchorX = node.cableStartX ?? getCableGeometry(node).startX;
    pendingCableAnchorY = node.cableStartY ?? getCableGeometry(node).startY;
  }
  activePaletteDragNodeId = null;
  activePaletteDragCreatedNode = false;
  paletteDragPayload = null;
  recomputeSignals();
}

function tryFinalizePaletteDragFromClientPoint(clientX: number, clientY: number): boolean {
  if (!paletteDragPayload && activePaletteDragNodeId == null) return false;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return false;
  if (!isClientPointInsideWorkspace(clientX, clientY)) return false;

  const pos = workspaceCoordsFromClientPoint(clientX, clientY);
  const node = materializePaletteDragNodeAt(pos.x, pos.y);
  if (!node) return false;
  positionPaletteDragNode(node, pos.x, pos.y);
  finalizePaletteDragNode(node);
  return true;
}

function setupPrimitivePaletteButton(btn: HTMLButtonElement, type: NodeType) {
  btn.addEventListener("click", () => {
    if (previewMode) return;
    finishPendingCablePlacement();
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
    cancelActivePaletteDrag();
    finishPendingCablePlacement();
    paletteDragPayload = { type };
    if (ev.dataTransfer) {
      ev.dataTransfer.setData("text/plain", type);
      ev.dataTransfer.setDragImage(transparentDragImage, 0, 0);
    }
  });
  btn.addEventListener("dragend", (ev) => {
    if (previewMode) return;
    if (tryFinalizePaletteDragFromClientPoint(ev.clientX, ev.clientY)) return;
    cancelActivePaletteDrag();
  });
}

palette
  .querySelectorAll<HTMLButtonElement>(".palette-item[data-node-type]")
  .forEach((btn) => {
    const type = btn.dataset.nodeType as NodeType;
    setupPrimitivePaletteButton(btn, type);
  });

palette.addEventListener("mousedown", () => {
  if (previewMode) return;
  finishPendingCablePlacement();
});

sidebar.addEventListener(
  "wheel",
  (ev) => {
    ev.stopPropagation();
  },
  { passive: true }
);

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

  const node = materializePaletteDragNodeAt(baseX, baseY);
  if (!node) return;
  positionPaletteDragNode(node, baseX, baseY);
});

workspace.addEventListener("drop", (ev) => {
  ev.preventDefault();
  if (previewMode) return;
  const pos = workspaceCoordsFromClient(ev);
  const droppedNode = materializePaletteDragNodeAt(pos.x, pos.y);
  if (!droppedNode) {
    cancelActivePaletteDrag();
    return;
  }
  positionPaletteDragNode(droppedNode, pos.x, pos.y);
  finalizePaletteDragNode(droppedNode);
});

window.addEventListener("mousemove", (ev) => {
  if (pendingCablePlacementId == null) return;
  const wrapperRect = workspaceWrapper.getBoundingClientRect();
  if (
    ev.clientX < wrapperRect.left ||
    ev.clientX > wrapperRect.right ||
    ev.clientY < wrapperRect.top ||
    ev.clientY > wrapperRect.bottom
  ) {
    return;
  }
  const node = nodes.get(pendingCablePlacementId);
  if (!node || node.type !== "CABLE") return;

  const pos = workspaceCoordsFromClient(ev);
  const nextStartX = snapCoord(pendingCableAnchorX);
  const nextStartY = snapCoord(pendingCableAnchorY);
  const nextEndX = snapCoord(pos.x);
  const nextEndY = snapCoord(pos.y);
  if (
    nextStartX === node.cableStartX &&
    nextStartY === node.cableStartY &&
    nextEndX === node.cableEndX &&
    nextEndY === node.cableEndY
  ) {
    return;
  }
  node.cableStartX = nextStartX;
  node.cableStartY = nextStartY;
  node.cableEndX = nextEndX;
  node.cableEndY = nextEndY;
  updateCableNodeGeometry(node);
  markWireGeometryDirty();
  scheduleWireRender(true);
});

workspace.addEventListener("mousedown", (ev) => {
  if (previewMode) return;
  if (ev.button !== 0) return;

  if (finishPendingCablePlacement()) {
    return;
  }

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
          scheduleSignalRecompute();
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
      case "DFF":
        return `${node.id}:out:q`;
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
    case "DFF":
      return `${node.id}:in:${slot}`;
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
  if (type === "DFF") node.value = false;
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
  if (type === "NUMBER_DISPLAY") {
    node.numberDigits = DEFAULT_NUMBER_DISPLAY_DIGITS;
  }
  if (type === "GUIDE") {
    node.guideLength = DEFAULT_GUIDE_LENGTH;
  }
  if (type === "CABLE") {
    node.cableChannels = DEFAULT_CABLE_CHANNELS;
    node.cableLength = DEFAULT_CABLE_LENGTH;
    const layout = getCableLayout(node);
    node.cableStartX = snapCoord(node.x + CABLE_END_WIDTH / 2);
    node.cableStartY = snapCoord(node.y + layout.bodyHeight / 2);
    node.cableEndX = snapCoord(node.cableStartX + DEFAULT_CABLE_LENGTH - CABLE_END_WIDTH);
    node.cableEndY = node.cableStartY;
    syncCableBounds(node);
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

type LogicSignal = {
  nodeId: number;
  portId: string;
};

interface LogicBuilder {
  nextId: number;
  nodes: NodeData[];
  wires: ICDefinition["wires"];
  trueSignal?: LogicSignal;
  falseSignal?: LogicSignal;
}

function createLogicBuilder(startId = 1): LogicBuilder {
  return {
    nextId: startId,
    nodes: [],
    wires: [],
  };
}

function addLogicNode(
  builder: LogicBuilder,
  type: NodeType,
  x: number,
  y: number,
  patch: Partial<NodeData> = {}
): NodeData {
  const node = {
    ...makePresetNode(builder.nextId++, type, x, y),
    ...patch,
  };
  builder.nodes.push(node);
  return node;
}

function signalFromNode(
  node: Pick<NodeData, "id" | "type">,
  slot: "a" | "b" | number = 0
): LogicSignal {
  return {
    nodeId: node.id,
    portId: getDefaultPortId(node, "output", slot),
  };
}

function signalFromPort(nodeId: number, portId: string): LogicSignal {
  return { nodeId, portId };
}

function connectSignalToNode(
  builder: LogicBuilder,
  signal: LogicSignal,
  node: Pick<NodeData, "id" | "type">,
  slot: "a" | "b" | number = 0
) {
  builder.wires.push({
    fromNodeId: signal.nodeId,
    toNodeId: node.id,
    fromPortId: signal.portId,
    toPortId: getDefaultPortId(node, "input", slot),
  });
}

function connectSignalToPort(
  builder: LogicBuilder,
  signal: LogicSignal,
  toNodeId: number,
  toPortId: string
) {
  builder.wires.push({
    fromNodeId: signal.nodeId,
    toNodeId,
    fromPortId: signal.portId,
    toPortId,
  });
}

function ensureTrueSignal(builder: LogicBuilder): LogicSignal {
  if (!builder.trueSignal) {
    const power = addLogicNode(builder, "POWER", 24, 24);
    builder.trueSignal = signalFromNode(power);
  }
  return builder.trueSignal;
}

function ensureFalseSignal(builder: LogicBuilder): LogicSignal {
  if (!builder.falseSignal) {
    const alwaysOff = addLogicNode(builder, "NOT", 96, 24);
    connectSignalToNode(builder, ensureTrueSignal(builder), alwaysOff);
    builder.falseSignal = signalFromNode(alwaysOff);
  }
  return builder.falseSignal;
}

function addNotGate(
  builder: LogicBuilder,
  input: LogicSignal,
  x: number,
  y: number
): LogicSignal {
  const gate = addLogicNode(builder, "NOT", x, y);
  connectSignalToNode(builder, input, gate);
  return signalFromNode(gate);
}

function addBinaryGate(
  builder: LogicBuilder,
  type: "AND" | "OR" | "XOR" | "NAND" | "NOR",
  a: LogicSignal,
  b: LogicSignal,
  x: number,
  y: number
): LogicSignal {
  const gate = addLogicNode(builder, type, x, y);
  connectSignalToNode(builder, a, gate, "a");
  connectSignalToNode(builder, b, gate, "b");
  return signalFromNode(gate);
}

function addAndMany(
  builder: LogicBuilder,
  inputs: LogicSignal[],
  x: number,
  y: number
): LogicSignal {
  if (inputs.length === 0) return ensureTrueSignal(builder);
  if (inputs.length === 1) return inputs[0];

  let current = inputs[0];
  for (let index = 1; index < inputs.length; index++) {
    current = addBinaryGate(builder, "AND", current, inputs[index], x + (index - 1) * 72, y);
  }
  return current;
}

function addOrMany(
  builder: LogicBuilder,
  inputs: LogicSignal[],
  x: number,
  y: number
): LogicSignal {
  if (inputs.length === 0) return ensureFalseSignal(builder);
  if (inputs.length === 1) return inputs[0];

  let current = inputs[0];
  for (let index = 1; index < inputs.length; index++) {
    current = addBinaryGate(builder, "OR", current, inputs[index], x + (index - 1) * 72, y);
  }
  return current;
}

function addPrioritySelection(
  builder: LogicBuilder,
  categories: LogicSignal[][],
  order: readonly number[],
  x: number,
  y: number
): LogicSignal[] {
  const falseSignal = ensureFalseSignal(builder);
  const selected = Array<LogicSignal | null>(categories[0]?.length ?? 0).fill(null);
  let blocked: LogicSignal = falseSignal;
  let row = 0;

  categories.forEach((category, categoryIndex) => {
    order.forEach((moveIndex) => {
      const notBlocked = addNotGate(builder, blocked, x + categoryIndex * 252, y + row * 24);
      row++;
      const picked = addBinaryGate(
        builder,
        "AND",
        category[moveIndex] ?? falseSignal,
        notBlocked,
        x + categoryIndex * 252 + 84,
        y + row * 24
      );
      row++;
      selected[moveIndex] =
        selected[moveIndex] == null
          ? picked
          : addBinaryGate(
              builder,
              "OR",
              selected[moveIndex]!,
              picked,
              x + categoryIndex * 252 + 168,
              y + row * 24
            );
      row++;
      blocked = addBinaryGate(
        builder,
        "OR",
        blocked,
        category[moveIndex] ?? falseSignal,
        x + categoryIndex * 252 + 252,
        y + row * 24
      );
      row++;
    });
  });

  return selected.map((signal) => signal ?? falseSignal);
}

function connectDff(
  builder: LogicBuilder,
  dffNode: Pick<NodeData, "id">,
  dSignal: LogicSignal,
  clockSignal: LogicSignal
) {
  connectSignalToPort(builder, dSignal, dffNode.id, `${dffNode.id}:in:d`);
  connectSignalToPort(builder, clockSignal, dffNode.id, `${dffNode.id}:in:clk`);
}

function buildTicTacToeWinCheckDefinition(id: number): ICDefinition {
  const builder = createLogicBuilder();
  const inputs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "SWITCH", 24, 48 + index * 72)
  );
  const output = addLogicNode(builder, "OUTPUT", 780, 312);
  const inputSignals = inputs.map((node) => signalFromNode(node));
  const lineSignals = TIC_TAC_TOE_WINNING_LINES.map(([a, b, c], lineIndex) =>
    addAndMany(builder, [inputSignals[a], inputSignals[b], inputSignals[c]], 180, 72 + lineIndex * 72)
  );
  const anyWin = addOrMany(builder, lineSignals, 468, 312);
  connectSignalToNode(builder, anyWin, output);

  return {
    id,
    name: "TTT WIN CHECK",
    nodes: builder.nodes,
    wires: builder.wires,
    inputNodeIds: inputs.map((node) => node.id),
    outputNodeIds: [output.id],
    ledNodeIds: [],
    paletteHidden: false,
    compactLayout: {
      nodeWidth: 212,
      bodyHeight: 240,
      portPitch: 14,
    },
  };
}

function buildTicTacToeAiDefinition(id: number): ICDefinition {
  const builder = createLogicBuilder();
  const xInputs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "SWITCH", 24, 48 + index * 72)
  );
  const oInputs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "SWITCH", 96, 48 + index * 72)
  );
  const outputs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "OUTPUT", 1524, 48 + index * 72)
  );

  const xSignals = xInputs.map((node) => signalFromNode(node));
  const oSignals = oInputs.map((node) => signalFromNode(node));
  let row = 0;
  const nextY = () => 48 + row++ * 24;

  const notX = xSignals.map((signal) => addNotGate(builder, signal, 204, nextY()));
  const notO = oSignals.map((signal) => addNotGate(builder, signal, 288, nextY()));
  const empty = xSignals.map((_, index) =>
    addBinaryGate(builder, "AND", notX[index], notO[index], 372, nextY())
  );

  const buildWinningMoves = (playerSignals: LogicSignal[], baseX: number) =>
    Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, cellIndex) => {
      const lineMatches = TIC_TAC_TOE_LINES_BY_CELL[cellIndex].map(([a, b]) =>
        addBinaryGate(builder, "AND", playerSignals[a], playerSignals[b], baseX, nextY())
      );
      const anyLine = addOrMany(builder, lineMatches, baseX + 84, nextY());
      return addBinaryGate(builder, "AND", empty[cellIndex], anyLine, baseX + 168, nextY());
    });

  const winningMoves = buildWinningMoves(oSignals, 516);
  const blockingMoves = buildWinningMoves(xSignals, 816);
  const pickedMoves = addPrioritySelection(
    builder,
    [winningMoves, blockingMoves, empty],
    TIC_TAC_TOE_MOVE_PRIORITY,
    1128,
    48
  );

  pickedMoves.forEach((signal, index) => {
    connectSignalToNode(builder, signal, outputs[index]);
  });

  return {
    id,
    name: "TTT SIMPLE AI",
    nodes: builder.nodes,
    wires: builder.wires,
    inputNodeIds: [...xInputs.map((node) => node.id), ...oInputs.map((node) => node.id)],
    outputNodeIds: outputs.map((node) => node.id),
    ledNodeIds: [],
    paletteHidden: false,
    compactLayout: {
      nodeWidth: 224,
      bodyHeight: 288,
      portPitch: 12,
    },
  };
}

function buildTicTacToeGameDefinition(
  id: number,
  aiDefId: number,
  winCheckDefId: number
): ICDefinition {
  const builder = createLogicBuilder();
  const moveInputs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "SWITCH", 24, 48 + index * 72)
  );
  const resetInput = addLogicNode(builder, "SWITCH", 24, 768);
  const outputs = Array.from({ length: 23 }, (_, index) =>
    addLogicNode(builder, "OUTPUT", 2748, 48 + index * 72)
  );
  const xStateDffs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "DFF", 372, 48 + index * 96)
  );
  const oStateDffs = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addLogicNode(builder, "DFF", 564, 48 + index * 96)
  );
  const phaseDff = addLogicNode(builder, "DFF", 756, 420);
  const aiNode = addLogicNode(builder, "IC", 1104, 252, { icDefId: aiDefId });
  const xWinNode = addLogicNode(builder, "IC", 1368, 108, { icDefId: winCheckDefId });
  const oWinNode = addLogicNode(builder, "IC", 1368, 396, { icDefId: winCheckDefId });
  const pressBuffer1 = addLogicNode(builder, "BUFFER", 828, 720, {
    bufferDelayMs: 120,
  });
  const pressBuffer2 = addLogicNode(builder, "BUFFER", 996, 720, {
    bufferDelayMs: 120,
  });
  const pressBuffer3 = addLogicNode(builder, "BUFFER", 1164, 720, {
    bufferDelayMs: 120,
  });
  const clockGuideA = addLogicNode(builder, "GUIDE", 2148, 132, {
    guideLength: 16,
  });
  const clockGuideB = addLogicNode(builder, "GUIDE", 2208, 132, {
    guideLength: 4,
  });

  const moveSignals = moveInputs.map((node) => signalFromNode(node));
  const resetSignal = signalFromNode(resetInput);
  const xState = xStateDffs.map((node) => signalFromNode(node));
  const oState = oStateDffs.map((node) => signalFromNode(node));
  const phaseSignal = signalFromNode(phaseDff);
  let row = 0;
  const nextY = () => 48 + row++ * 24;

  const playerPress = addOrMany(builder, moveSignals, 804, nextY());
  connectSignalToNode(builder, playerPress, pressBuffer1);
  connectSignalToNode(builder, signalFromNode(pressBuffer1), pressBuffer2);
  connectSignalToNode(builder, signalFromNode(pressBuffer2), pressBuffer3);
  const pressBuffer1Signal = signalFromNode(pressBuffer1);
  const pressBuffer2Signal = signalFromNode(pressBuffer2);
  const pressBuffer3Signal = signalFromNode(pressBuffer3);
  const notPressBuffer1 = addNotGate(builder, pressBuffer1Signal, 900, nextY());
  const humanPulse = addAndMany(builder, [playerPress, notPressBuffer1], 996, nextY());
  const notPressBuffer3 = addNotGate(builder, pressBuffer3Signal, 1092, nextY());
  const aiPulse = addAndMany(builder, [pressBuffer2Signal, notPressBuffer3], 1188, nextY());
  const clockPulse = addOrMany(builder, [humanPulse, aiPulse, resetSignal], 1284, nextY());
  connectSignalToPort(builder, clockPulse, clockGuideA.id, getGuideInputPortId(clockGuideA.id, 0));
  connectSignalToPort(builder, clockPulse, clockGuideB.id, getGuideInputPortId(clockGuideB.id, 0));
  const clockSignals = [
    ...Array.from({ length: 16 }, (_, index) =>
      signalFromPort(clockGuideA.id, getGuideOutputPortId(clockGuideA.id, index))
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      signalFromPort(clockGuideB.id, getGuideOutputPortId(clockGuideB.id, index))
    ),
  ];

  const notReset = addNotGate(builder, resetSignal, 1380, nextY());

  const notPhase = addNotGate(builder, phaseSignal, 1476, nextY());
  const notX = xState.map((signal) => addNotGate(builder, signal, 1476, nextY()));
  const notO = oState.map((signal) => addNotGate(builder, signal, 1560, nextY()));
  const empty = xState.map((_, index) =>
    addBinaryGate(builder, "AND", notX[index], notO[index], 1644, nextY())
  );

  xState.forEach((signal, index) => {
    connectSignalToNode(builder, signal, aiNode, index);
    connectSignalToNode(builder, signal, xWinNode, index);
  });
  oState.forEach((signal, index) => {
    connectSignalToNode(builder, signal, aiNode, TIC_TAC_TOE_BOARD_SIZE ** 2 + index);
    connectSignalToNode(builder, signal, oWinNode, index);
  });

  const xWin = signalFromNode(xWinNode);
  const oWin = signalFromNode(oWinNode);
  const occupied = xState.map((signal, index) =>
    addOrMany(builder, [signal, oState[index]], 1740, nextY())
  );
  const boardFull = addAndMany(builder, occupied, 1836, nextY());
  const anyWin = addOrMany(builder, [xWin, oWin], 1932, nextY());
  const notAnyWin = addNotGate(builder, anyWin, 2028, nextY());
  const draw = addBinaryGate(builder, "AND", boardFull, notAnyWin, 2124, nextY());
  const gameOver = addOrMany(builder, [anyWin, draw], 2220, nextY());
  const notGameOver = addNotGate(builder, gameOver, 2316, nextY());
  const humanTurn = addAndMany(builder, [notPhase, notGameOver], 2412, nextY());
  const aiTurn = addAndMany(builder, [phaseSignal, notGameOver], 2508, nextY());

  const legalHumanMoves = moveSignals.map((signal, index) =>
    addBinaryGate(builder, "AND", signal, empty[index], 1260, nextY())
  );
  const humanChoice = addPrioritySelection(
    builder,
    [legalHumanMoves],
    Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) => index),
    1380,
    48
  );
  const humanEnable = addAndMany(builder, [humanTurn, humanPulse, notReset], 1500, nextY());
  const humanApplied = humanChoice.map((signal) =>
    addBinaryGate(builder, "AND", signal, humanEnable, 1596, nextY())
  );
  const humanAppliedAny = addOrMany(builder, humanApplied, 1692, nextY());

  const aiCandidates = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) =>
    addBinaryGate(builder, "AND", signalFromNode(aiNode, index), empty[index], 1788, nextY())
  );
  const aiEnable = addAndMany(builder, [aiTurn, aiPulse, notReset], 1884, nextY());
  const aiApplied = aiCandidates.map((signal) =>
    addBinaryGate(builder, "AND", signal, aiEnable, 1980, nextY())
  );
  const aiAppliedAny = addOrMany(builder, aiApplied, 2076, nextY());

  const phaseClear = addOrMany(builder, [resetSignal, aiAppliedAny], 2172, nextY());
  const notPhaseClear = addNotGate(builder, phaseClear, 2268, nextY());
  const heldPhase = addAndMany(builder, [phaseSignal, notPhaseClear], 2364, nextY());
  const nextPhase = addOrMany(builder, [humanAppliedAny, heldPhase], 2460, nextY());

  xStateDffs.forEach((dffNode, index) => {
    const held = addOrMany(builder, [xState[index], humanApplied[index]], 2172, nextY());
    const nextState = addBinaryGate(builder, "AND", held, notReset, 2268, nextY());
    connectDff(builder, dffNode, nextState, clockSignals[index]);
  });

  oStateDffs.forEach((dffNode, index) => {
    const held = addOrMany(builder, [oState[index], aiApplied[index]], 2364, nextY());
    const nextState = addBinaryGate(builder, "AND", held, notReset, 2460, nextY());
    connectDff(builder, dffNode, nextState, clockSignals[9 + index]);
  });

  connectDff(builder, phaseDff, nextPhase, clockSignals[18]);

  xState.forEach((signal, index) => {
    connectSignalToNode(builder, signal, outputs[index]);
  });
  oState.forEach((signal, index) => {
    connectSignalToNode(builder, signal, outputs[TIC_TAC_TOE_BOARD_SIZE ** 2 + index]);
  });
  connectSignalToNode(builder, humanTurn, outputs[18]);
  connectSignalToNode(builder, aiTurn, outputs[19]);
  connectSignalToNode(builder, xWin, outputs[20]);
  connectSignalToNode(builder, oWin, outputs[21]);
  connectSignalToNode(builder, draw, outputs[22]);

  return {
    id,
    name: "TIC TAC TOE",
    nodes: builder.nodes,
    wires: builder.wires,
    inputNodeIds: [...moveInputs.map((node) => node.id), resetInput.id],
    outputNodeIds: outputs.map((node) => node.id),
    ledNodeIds: [],
    paletteHidden: false,
    compactLayout: {
      nodeWidth: 248,
      bodyHeight: 360,
      portPitch: 12,
    },
  };
}

function buildTutorialSaveObject(): SaveFileV1 {
  const tutorialDef = buildHalfAdderDefinition();
  const ticTacToeWinCheckDef = buildTicTacToeWinCheckDefinition(tutorialDef.id + 1);
  const ticTacToeAiDef = buildTicTacToeAiDefinition(ticTacToeWinCheckDef.id + 1);
  const ticTacToeGameDef = buildTicTacToeGameDefinition(
    ticTacToeAiDef.id + 1,
    ticTacToeAiDef.id,
    ticTacToeWinCheckDef.id
  );
  const tutorialDefs: ICDefinition[] = [
    tutorialDef,
    ticTacToeWinCheckDef,
    ticTacToeAiDef,
    ticTacToeGameDef,
  ];
  const tutorialNodes: NodeData[] = [];
  const tutorialNotes: NoteData[] = [];
  const tutorialWires: SaveFileV1["wires"] = [];
  let tutorialNextNodeId = 1;
  let tutorialNextNoteId = 1;
  let tutorialNextDefId = ticTacToeGameDef.id + 1;

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

  const connectSpeakerTone = (from: NodeData, speaker: NodeData, toneValue: number) => {
    SPEAKER_INPUT_WEIGHTS.forEach((weight, bitIndex) => {
      if ((toneValue & weight) !== 0) {
        connect(from, speaker, bitIndex);
      }
    });
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

  const scaleClock = addNode("CLOCK", sourceX - 168, 3432, {
    clockDelayMs: 1760,
  });
  const scalePulseWidth = addNode("BUFFER", sourceX + 24, 3432, {
    bufferDelayMs: 220,
  });
  const scalePulse = addNode("XOR", gateX - 24, 3432);
  connect(scaleClock, scalePulseWidth);
  connect(scaleClock, scalePulse, "a");
  connect(scalePulseWidth, scalePulse, "b");

  const scaleStages = buildBufferChain(scalePulse, gateX + 228, 3432, 7, 220);
  const scaleSpeaker = addNode("SPEAKER", gateX + 1404, 3396, {
    speakerFrequencyHz: 262,
  });
  const scaleNotes = [
    { toneValue: 1, lightColor: "#f59e0b" },
    { toneValue: 3, lightColor: "#38bdf8" },
    { toneValue: 5, lightColor: "#34d399" },
    { toneValue: 6, lightColor: "#a78bfa" },
    { toneValue: 8, lightColor: "#fb7185" },
    { toneValue: 10, lightColor: "#22c55e" },
    { toneValue: 12, lightColor: "#f97316" },
    { toneValue: 13, lightColor: "#eab308" },
  ];

  scaleStages.forEach((stage, index) => {
    const note = scaleNotes[index];
    if (!note) return;
    connectSpeakerTone(stage, scaleSpeaker, note.toneValue);
    const lamp = addNode("OUTPUT", stage.x + 24, 3552, {
      lightColor: note.lightColor,
    });
    connect(stage, lamp);
  });

  addNote(
    noteX,
    3336,
    "4-bit speaker scale\n\nThis circuit auto-plays a full major scale on the speaker: C D E F G A B C.\n\nHow it works:\n- The clock and delayed clock create one short pulse.\n- The buffer chain delays that pulse step by step, so the lamps march left to right.\n- Each stage is wired into the speaker's 1 / 2 / 4 / 8 inputs with a different binary combo, so every step becomes a different note.\n\nClick once anywhere if your browser needs to unlock audio, then listen to the scale loop.",
    456,
    286
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
  const moveButtonOriginX = 744;
  const moveButtonOriginY = gameY + 120;
  const moveSwitchSpacing = 120;
  const moveButtonLabels = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"] as const;
  const moveButtons = Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) => {
    const col = index % TIC_TAC_TOE_BOARD_SIZE;
    const row = Math.floor(index / TIC_TAC_TOE_BOARD_SIZE);
    return addNode(
      "BUTTON",
      moveButtonOriginX + col * moveSwitchSpacing,
      moveButtonOriginY + row * moveSwitchSpacing,
      {
        titleText: `MOVE ${moveButtonLabels[index]}`,
      }
    );
  });
  const resetButton = addNode("BUTTON", 864, gameY + 552, {
    titleText: "RESET",
  });
  const ticTacToeGame = addNode("IC", 1176, gameY + 96, {
    icDefId: ticTacToeGameDef.id,
  });
  const ticTacToeDisplayWidth = 11;
  const ticTacToeDisplay = addNode("DISPLAY", 1488, gameY + 48, {
    displayWidth: ticTacToeDisplayWidth,
    displayHeight: ticTacToeDisplayWidth,
  });
  const statusLampX = 1896;
  const yourTurnLamp = addNode("OUTPUT", statusLampX, gameY + 72, {
    titleText: "YOUR TURN",
    lightColor: "#0ea5e9",
  });
  const aiTurnLamp = addNode("OUTPUT", statusLampX, gameY + 168, {
    titleText: "AI TURN",
    lightColor: "#6366f1",
  });
  const xWinLamp = addNode("OUTPUT", statusLampX, gameY + 288, {
    titleText: "X WIN",
    lightColor: "#22c55e",
  });
  const aiWinLamp = addNode("OUTPUT", statusLampX, gameY + 384, {
    titleText: "O WIN",
    lightColor: "#ef4444",
  });
  const drawLamp = addNode("OUTPUT", statusLampX, gameY + 480, {
    titleText: "DRAW",
    lightColor: "#f59e0b",
  });

  moveButtons.forEach((moveButton, index) => {
    connect(moveButton, ticTacToeGame, index);
  });
  connect(resetButton, ticTacToeGame, 9);

  const xPattern = [
    [0, 0],
    [1, 1],
    [2, 2],
    [2, 0],
    [0, 2],
  ] as const;
  const oPattern = [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ] as const;

  Array.from({ length: TIC_TAC_TOE_BOARD_SIZE ** 2 }, (_, index) => {
    const col = index % TIC_TAC_TOE_BOARD_SIZE;
    const row = Math.floor(index / TIC_TAC_TOE_BOARD_SIZE);
    const baseX = col * 4;
    const baseY = row * 4;

    xPattern.forEach(([dx, dy]) => {
      connectDisplayPixel(
        ticTacToeGame,
        ticTacToeDisplay,
        ticTacToeDisplayWidth,
        baseX + dx,
        baseY + dy,
        index
      );
    });
    oPattern.forEach(([dx, dy]) => {
      connectDisplayPixel(
        ticTacToeGame,
        ticTacToeDisplay,
        ticTacToeDisplayWidth,
        baseX + dx,
        baseY + dy,
        TIC_TAC_TOE_BOARD_SIZE ** 2 + index
      );
    });
  });

  connect(ticTacToeGame, yourTurnLamp, 0, 18);
  connect(ticTacToeGame, aiTurnLamp, 0, 19);
  connect(ticTacToeGame, xWinLamp, 0, 20);
  connect(ticTacToeGame, aiWinLamp, 0, 21);
  connect(ticTacToeGame, drawLamp, 0, 22);

  addNote(
    noteX,
    4212,
    "Logic-gate tic-tac-toe\n\nThis last section is a real circuit, not a scripted widget.\n\nControls:\n- The 9 MOVE buttons are the only player inputs.\n- Press one button to place X in that square.\n- The AI answers automatically after a short buffer delay.\n- Press RESET to clear the board.\n\nOpen these ICs from the left custom-IC column:\n- TIC TAC TOE: board memory + turn timing, with guides fanning the shared clock pulse.\n- TTT WIN CHECK: rows / columns / diagonals.\n- TTT SIMPLE AI: win if possible, block if needed, otherwise pick a decent empty square.\n\nThe AI is intentionally beatable now, so this stays teachable instead of feeling magical.",
    552,
    356
  );

  addNote(
    684,
    gameY + 888,
    "Reading the section\n\nLeft to right:\n1. MOVE buttons choose the square.\n2. TIC TAC TOE stores the board in DFFs and sequences the turn.\n3. The display shows X and O directly from the circuit outputs.\n4. The lamps tell you whose turn it is and how the game ended.",
    460,
    230
  );

  addNote(
    noteX,
    5568,
    "Tips\n\nRight-click nodes to open the custom control panels.\nUse the middle mouse button to pan.\nRight-click blank space to create your own note.\nUse Delete or Backspace to remove selected notes, wires, or gates.\n\nScroll back up and experiment with any section.",
    430,
    220
  );

  return {
    version: 1,
    nodes: tutorialNodes,
    notes: tutorialNotes,
    wires: tutorialWires,
    icDefinitions: tutorialDefs,
    nextIds: {
      nextNodeId: tutorialNextNodeId,
      nextWireId: tutorialWires.length + 1,
      nextICId: tutorialNextDefId,
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
  markIcDefinitionsDirty();
  notes.clear();
  clockTimers.clear();
  clockLastTickAt.clear();
  dffLastClockInput.clear();
  bufferLastInput.clear();
  bufferTimeouts.clear();
  resetAllIcRuntimeState();
  Array.from(speakerVoices.keys()).forEach((nodeId) => stopSpeakerVoice(nodeId));

  // ICs
  palette.querySelectorAll<HTMLDivElement>(".palette-item-ic").forEach((el) => el.remove());
  updateCustomIcPaletteSectionVisibility();
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
      paletteHidden: !!d.paletteHidden,
      compactLayout: d.compactLayout ? { ...d.compactLayout } : undefined,
    };
    icDefinitions.push(def);
    addICPaletteButton(def);
  });
  markIcDefinitionsDirty();
  updateCustomIcPaletteSectionVisibility();

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
  invalidateWorkspaceDraftAutosaveCache();
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
  clockLastTickAt.clear();
  dffLastClockInput.clear();
  bufferLastInput.clear();
  bufferTimeouts.clear();
  resetAllIcRuntimeState();
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
  markIcDefinitionsDirty();
  palette.querySelectorAll<HTMLDivElement>(".palette-item-ic").forEach((el) => el.remove());
  updateCustomIcPaletteSectionVisibility();

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
  invalidateWorkspaceDraftAutosaveCache();
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
  isBuiltin?: boolean;
}

interface ServerCircuit extends ServerCircuitSummary {
  data: SaveFileV1;
}

interface ServerWorkspaceDraft {
  title: string;
  visibility: "private" | "preview" | "open";
  data: SaveFileV1;
  updatedAt: number;
}

let currentUser: CurrentUser | null = null;
let currentCircuitTitle = "Untitled";
let currentCircuitVisibility: "private" | "preview" | "open" = "private";
const TEMP_WORKSPACE_AUTOSAVE_DELAY_MS = 12000;
const TEMP_WORKSPACE_AUTOSAVE_INTERVAL_MS = 45000;
const WORKSPACE_DRAFT_CHANGE_THRESHOLD = 30;
const WORKSPACE_CHANGE_COUNT_COOLDOWN_MS = 180;
let draftAutosaveTimeoutId: number | null = null;
let draftAutosaveInFlight = false;
let queuedDraftAutosave = false;
let lastDraftAutosaveKey = "";
let workspaceDraftPromptShown = false;
let startupContentReady: Promise<void> = Promise.resolve();
let workspaceChangeCount = 0;
let lastWorkspaceChangeCountAt = 0;

const APP_BASE = (import.meta as any).env?.BASE_URL ?? "/";
const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (APP_BASE.startsWith("/cirkit/") ? "/cirkit/api" : "/api");

function parseApiErrorMessage(text: string, fallback: string): string {
  const trimmed = text.trim();
  if (!trimmed) return fallback;
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object") {
      const errorMessage =
        typeof (parsed as any).error === "string"
          ? (parsed as any).error
          : typeof (parsed as any).message === "string"
            ? (parsed as any).message
            : "";
      if (errorMessage.trim()) return errorMessage.trim();
    }
  } catch {
    // ignore non-JSON error bodies
  }
  return trimmed || fallback;
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = API_BASE ? API_BASE + path : path;
  const res = await fetch(url, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(parseApiErrorMessage(text, res.statusText));
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
    const layout = getIcNodeLayout(def);
    return { w: layout.nodeWidth, h: layout.bodyHeight };
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
  icDefMap: Map<number, ICDefinition>,
  portAnchors?: Map<string, { x: number; y: number }>
): { x: number; y: number } {
  const anchored = portAnchors?.get(portId);
  if (anchored) return anchored;

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
    if (role === "in") {
      const idx = Number(suffix);
      if (Number.isFinite(idx)) {
        const point = getIcPortPlacement(def, "in", idx);
        return {
          x: node.x + point.x,
          y: node.y + point.y,
        };
      }
    } else if (role === "out") {
      const idx = Number(suffix);
      if (Number.isFinite(idx)) {
        const point = getIcPortPlacement(def, "out", idx);
        return {
          x: node.x + point.x,
          y: node.y + point.y,
        };
      }
    }
  } else if (node.type === "GUIDE") {
    const parsed = parseGuidePortId(portId);
    const layout = getGuideLayout(node);
    const slotIndex = parsed?.slotIndex ?? 0;
    const clampedSlot = clamp(slotIndex, 0, layout.slotCenters.length - 1);
    return {
      x: node.x + layout.width / 2,
      y: node.y + layout.slotCenters[clampedSlot],
    };
  } else if (node.type === "CABLE") {
    const parsed = parseCablePortId(portId);
    const geometry = getCableGeometry(node);
    const channel = clamp(parsed?.channel ?? 0, 0, geometry.rowOffsets.length - 1);
    const side = parsed?.side ?? "left";
    return {
      x: side === "left" ? geometry.startX : geometry.endX,
      y:
        (side === "left" ? geometry.startY : geometry.endY) +
        geometry.rowOffsets[channel],
    };
  } else if (node.type === "SPEAKER" && role === "in") {
    const layout = getSpeakerLayout();
    const index = clamp(Number(suffix), 0, layout.portPlacements.length - 1);
    const placement = layout.portPlacements[index];
    return {
      x: node.x + placement.x,
      y: node.y + DISPLAY_HEADER_HEIGHT + placement.y,
    };
  } else if (node.type === "DISPLAY" && role === "in") {
    const index = Number(suffix);
    if (Number.isFinite(index) && index >= 0) {
      return getDisplayPixelCoordinates(node, index);
    }
  } else if (node.type === "NUMBER_DISPLAY" && role === "in") {
    const layout = getNumberDisplayLayout(node);
    const index = clamp(Number(suffix), 0, layout.portPlacements.length - 1);
    const placement = layout.portPlacements[index];
    return {
      x: node.x + placement.x,
      y: node.y + DISPLAY_HEADER_HEIGHT + placement.y,
    };
  } else if (node.type === "DFF") {
    if (role === "in") {
      const y =
        suffix === "clk" ? node.y + h * 0.72 :
        suffix === "d" ? node.y + h * 0.34 :
        node.y + h * 0.5;
      return {
        x: node.x - 7,
        y,
      };
    }
    return {
      x: node.x + w + 7,
      y: node.y + h * 0.5,
    };
  } else if (node.type === "POWER" && role === "out") {
    return {
      x: node.x + 88,
      y: node.y + h / 2,
    };
  } else if ((node.type === "OUTPUT" || node.type === "LED") && role === "in") {
    return {
      x: node.x + 30,
      y: node.y + h / 2,
    };
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

          await deleteWorkspaceDraft();

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

function setAccountAvatarPicture(picture: string | null | undefined) {
  if (!accountAvatarImg) return;
  const trimmed = typeof picture === "string" ? picture.trim() : "";
  if (!trimmed) {
    accountAvatarImg.style.display = "none";
    accountAvatarImg.removeAttribute("src");
    return;
  }
  accountAvatarImg.onerror = () => {
    accountAvatarImg.style.display = "none";
    accountAvatarImg.removeAttribute("src");
  };
  accountAvatarImg.style.display = "";
  accountAvatarImg.src = trimmed;
}

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

navAccountBtn.addEventListener("click", async () => {
  hideOverlay(communityOverlay);
  showOverlay(accountOverlay);
  await refreshMe();
  await refreshMyCircuits();
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
const IS_DEV = !!(import.meta as any).env?.DEV;

function setGoogleSignInError(message: string) {
  googleErr.style.display = "";
  googleErr.textContent = message;
}

function shouldRedirectGoogleDevOrigin(): boolean {
  if (!IS_DEV) return false;
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "0.0.0.0";
}

function redirectGoogleDevOrigin() {
  const url = new URL(window.location.href);
  url.hostname = "localhost";
  window.location.replace(url.toString());
}

function explainGoogleSignInError(err: unknown): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const message = raw.trim();

  if (shouldRedirectGoogleDevOrigin()) {
    return "Google Sign-In works more reliably on localhost than 127.0.0.1 here. Reloading on localhost should fix it.";
  }
  if (!message) {
    return "Google sign-in failed.";
  }

  const lower = message.toLowerCase();
  if (lower.includes("origin") || lower.includes("authorized javascript origins")) {
    return `Google Sign-In blocked this origin: ${window.location.origin}. Add it to the Google OAuth client or use localhost/your production domain.`;
  }
  if (lower.includes("missing google_client_id")) {
    return "Server missing GOOGLE_CLIENT_ID. Add it to server/.env and restart the server.";
  }
  if (lower.includes("google auth failed")) {
    return message;
  }
  if (lower.includes("gis load error")) {
    return "Failed to load the Google Sign-In script. Check your connection or any content blockers.";
  }
  return `Google sign-in failed: ${message}`;
}

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
let googleInitPromise: Promise<void> | null = null;

async function initGoogleSignInIfNeeded() {
  if (googleRendered) return;
  if (googleInitPromise) return googleInitPromise;

  googleInitPromise = (async () => {
    if (!GOOGLE_CLIENT_ID) {
      setGoogleSignInError(
        "Missing VITE_GOOGLE_CLIENT_ID. Add it to your frontend env and restart."
      );
      return;
    }

    if (shouldRedirectGoogleDevOrigin()) {
      setGoogleSignInError(
        "Switching to localhost because Google Sign-In often rejects 127.0.0.1 here."
      );
      redirectGoogleDevOrigin();
      return;
    }

    try {
      await loadGoogleGsiScript();
      const w = window as any;
      googleSlot.innerHTML = "";
      googleErr.style.display = "none";

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
            scheduleWorkspaceDraftAutosave(1500);
            void maybePromptWorkspaceDraftRestore();
          } catch (e) {
            console.error(e);
            setGoogleSignInError(explainGoogleSignInError(e));
            currentUser = null;
            workspaceDraftPromptShown = false;
            applyAccountUI();
          }
        },
      });

      w.google.accounts.id.renderButton(googleSlot, {
        theme: "outline",
        size: "large",
        width: 260,
        text: "signin_with",
        shape: "pill",
      });

      googleRendered = true;

      // Optional: one tap
      // w.google.accounts.id.prompt();
    } catch (e) {
      console.error(e);
      googleRendered = false;
      googleSlot.innerHTML = "";
      setGoogleSignInError(explainGoogleSignInError(e));
    } finally {
      googleInitPromise = null;
    }
  })();

  return googleInitPromise;
}

// --- Account state -> UI ---
function applyAccountUI() {
  if (currentUser) {
    unauthSection.style.display = "none";
    authSection.style.display = "";
    accountNicknameSpan.textContent = currentUser.nickname;
    accountUsernameSpan.textContent = currentUser.username;
    setAccountAvatarPicture((currentUser as any).picture);
  } else {
    unauthSection.style.display = "";
    authSection.style.display = "none";
    setAccountAvatarPicture(null);
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
  if (!currentUser) {
    workspaceDraftPromptShown = false;
  }
  applyAccountUI();
  if (currentUser) {
    scheduleWorkspaceDraftAutosave(1500);
    void maybePromptWorkspaceDraftRestore();
  }
}

// --- Logout ---
accountLogoutBtn.addEventListener("click", async () => {
  try {
    await api<{ ok: boolean }>("/api/logout", { method: "POST" });
  } catch {
    // ignore
  }
  currentUser = null;
  workspaceDraftPromptShown = false;
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
startupContentReady = openStartupContentFromUrlParam();

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
    setPreviewMode(false);
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
      (card.querySelector(".card-meta") as HTMLDivElement).textContent = c.isBuiltin
        ? "Logic-gate example"
        : `User #${c.ownerId}`;

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
window.setInterval(() => {
  void saveWorkspaceDraft();
}, TEMP_WORKSPACE_AUTOSAVE_INTERVAL_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    saveWorkspaceDraftOnLeave();
    return;
  }
  if (pendingSignalRecomputeTimeout != null) {
    window.clearTimeout(pendingSignalRecomputeTimeout);
    pendingSignalRecomputeTimeout = null;
  }
  recomputeSignals();
});

window.addEventListener("pagehide", () => {
  saveWorkspaceDraftOnLeave();
});

void refreshMe();



// ===== IC Toolbox types =====
interface ToolboxEntrySummary {
  id: number;
  name: string;
  ownerId: number;
  createdAt: number;
  isBuiltin?: boolean;
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
        <button type="button" class="toolbox-upload-current">Upload from palette</button>
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
      '<div style="font-size:12px;color:#6b7280;">No IC entries yet. Pick one from the left column to upload it here.</div>';
    return;
  }

  const shell = buildGalleryShell({
    container: icToolboxList,
    title: "IC Library",
    subtitle: "Reusable IC modules with exposed internals.",
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
        <div class="thumb-wrap toolbox-preview-wrap">
          <div class="thumb-label">Inside</div>
          <div class="thumb-skeleton"></div>
          <div class="toolbox-ic-preview"></div>
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
      (card.querySelector(".card-meta") as HTMLDivElement).textContent = entry.isBuiltin
        ? `Logic-gate module · ${created.toLocaleDateString()}`
        : `User #${entry.ownerId} · ${created.toLocaleString()}`;

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
      const fullEntry = await api<ToolboxEntry>("/api/toolbox/" + entry.id);
      const defs = (fullEntry.data.icDefinitions || []) as ICDefinition[];
      const validation = validateSingleIcBoard(fullEntry.data);

      const card = shell.gridEl.querySelector<HTMLDivElement>(
        `.gallery-card[data-toolbox-id="${entry.id}"]`
      );
      if (!card) return;

      const preview = card.querySelector<HTMLDivElement>(".toolbox-ic-preview");
      const skel = card.querySelector<HTMLDivElement>(".thumb-skeleton");
      if (!preview || !skel) return;

      if (!validation.ok) {
        preview.innerHTML =
          `<div class="toolbox-preview-fallback">${escapeHtml(validation.reason)}</div>`;
        skel.style.display = "none";
        return;
      }

      renderIcPreviewInto(preview, validation.rootDef, 280, 180, undefined, defs);
      skel.style.display = "none";
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



function collectIcDefinitionClosure(rootDefId: number): ICDefinition[] {
  const defMap = new Map<number, ICDefinition>();
  icDefinitions.forEach((def) => defMap.set(def.id, def));

  const ordered: ICDefinition[] = [];
  const visited = new Set<number>();

  const visit = (defId: number) => {
    if (visited.has(defId)) return;
    const def = defMap.get(defId);
    if (!def) return;
    visited.add(defId);
    ordered.push(def);
    def.nodes.forEach((node) => {
      if (node.type === "IC" && typeof node.icDefId === "number") {
        visit(node.icDefId);
      }
    });
  };

  visit(rootDefId);
  return ordered;
}

function buildSingleIcToolboxSave(def: ICDefinition): SaveFileV1 {
  const defs = collectIcDefinitionClosure(def.id).map((item) => ({
    ...item,
    nodes: item.nodes.map((node) => ({ ...node })),
    wires: item.wires.map((wire) => ({ ...wire })),
    inputNodeIds: [...item.inputNodeIds],
    outputNodeIds: [...item.outputNodeIds],
    ledNodeIds: [...item.ledNodeIds],
  }));

  const maxDefId = defs.reduce((maxId, item) => Math.max(maxId, item.id), def.id);

  return {
    version: 1,
    nodes: [
      {
        id: 1,
        type: "IC",
        x: GRID_SIZE * 4,
        y: GRID_SIZE * 4,
        value: false,
        rotation: 0,
        icDefId: def.id,
      },
    ],
    notes: [],
    wires: [],
    icDefinitions: defs,
    nextIds: {
      nextNodeId: 2,
      nextWireId: 1,
      nextICId: maxDefId + 1,
      nextNoteId: 1,
    },
  };
}

async function startIcToolboxUploadFlow() {
  if (!currentUser) {
    toast("Log in first to upload to the IC Library.");
    showOverlay(accountOverlay);
    return;
  }

  const shouldReopenOverlay = !icToolboxOverlay.classList.contains("hidden");
  if (shouldReopenOverlay) {
    hideOverlay(icToolboxOverlay);
  }

  const pickedDef = await promptIcDefinitionForToolboxUpload();
  if (!pickedDef) {
    if (shouldReopenOverlay) {
      showOverlay(icToolboxOverlay);
      void refreshToolbox();
    }
    return;
  }

  const name = await promptTextModal({
    title: "Upload to IC Library",
    label: "IC name",
    value: pickedDef.name,
    hint: "This uploads the selected IC from the left column. Nested ICs inside it come along automatically.",
    submitLabel: "Upload",
    validate: (value) => (!value.trim() ? "Give the upload a name first." : null),
  });
  if (!name) {
    if (shouldReopenOverlay) {
      showOverlay(icToolboxOverlay);
      void refreshToolbox();
    }
    return;
  }

  try {
    const data = buildSingleIcToolboxSave(pickedDef);
    await uploadSingleIcToToolbox(data, name);
    toast("Uploaded to IC Library.");
    if (shouldReopenOverlay) {
      showOverlay(icToolboxOverlay);
      await refreshToolbox();
    }
  } catch (err: any) {
    console.error(err);
    toast(err?.message || "Upload failed.");
    if (shouldReopenOverlay) {
      showOverlay(icToolboxOverlay);
      void refreshToolbox();
    }
  }
}

// Upload a selected palette IC into the toolbox
icToolboxUploadBtn?.addEventListener("click", () => {
  void startIcToolboxUploadFlow();
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
// The IC toolbox stores a portable "single IC on an empty board" payload,
// but we now build that payload directly from a palette IC definition
// instead of asking the user to stage it in the workspace first.
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
      paletteHidden: !!oldDef.paletteHidden,
      compactLayout: oldDef.compactLayout ? { ...oldDef.compactLayout } : undefined,
    };
  });

  newDefs.forEach((d) => icDefinitions.push(d));
  markIcDefinitionsDirty();

  const rootNewId = idMap.get(icNode.icDefId!);
  const rootDef = newDefs.find((d) => d.id === rootNewId);
  if (!rootDef) {
    toast("Failed to register IC from toolbox.");
    return;
  }

  addICPaletteButton(rootDef);
  toast(`IC "${rootDef.name}" added to the palette.`);
}
