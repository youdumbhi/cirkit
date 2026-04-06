export const BUILTIN_OWNER_GOOGLE_SUB = "builtin-library";

type Visibility = "private" | "preview" | "open";

type NodeType =
  | "SWITCH"
  | "BUTTON"
  | "POWER"
  | "CLOCK"
  | "BUFFER"
  | "DFF"
  | "NOT"
  | "AND"
  | "OR"
  | "NAND"
  | "NOR"
  | "XOR"
  | "OUTPUT"
  | "LED"
  | "SPEAKER"
  | "DISPLAY"
  | "NUMBER_DISPLAY"
  | "GUIDE"
  | "IC";

interface NodeData {
  id: number;
  type: NodeType;
  x: number;
  y: number;
  value: boolean;
  rotation: number;
  icDefId?: number;
  clockDelayMs?: number;
  bufferDelayMs?: number;
  speakerFrequencyHz?: number;
  displayWidth?: number;
  displayHeight?: number;
  numberDigits?: number;
  guideLength?: number;
  titleText?: string;
  badgeText?: string;
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
  wires: WireData[];
  inputNodeIds: number[];
  outputNodeIds: number[];
  ledNodeIds: number[];
  paletteHidden?: boolean;
  compactLayout?: ICCompactLayout;
}

interface WireData {
  fromNodeId: number;
  toNodeId: number;
  fromPortId: string;
  toPortId: string;
}

interface SaveFileV1 {
  version: 1;
  nodes: NodeData[];
  notes: NoteData[];
  wires: WireData[];
  icDefinitions: ICDefinition[];
  nextIds: {
    nextNodeId: number;
    nextWireId: number;
    nextICId: number;
    nextNoteId: number;
  };
}

interface BuiltinCircuit {
  key: string;
  ownerId: number;
  ownerGoogleSub: string;
  title: string;
  visibility: Visibility;
  data: SaveFileV1;
}

interface BuiltinToolboxIC {
  key: string;
  ownerId: number;
  ownerGoogleSub: string;
  name: string;
  description?: string;
  data: SaveFileV1;
  createdAt: number;
}

interface BuiltinStoreFragment {
  users: Array<{
    id: number;
    googleSub: string;
    email: string;
    name: string;
  }>;
  circuits: BuiltinCircuit[];
  toolboxICs: BuiltinToolboxIC[];
}

type PortKind = "input" | "output";

const DEFAULT_LIGHT_COLOR = "#27ae60";
const DEFAULT_SPEAKER_FREQUENCY_HZ = 440;
const DEFAULT_DISPLAY_WIDTH = 4;
const DEFAULT_DISPLAY_HEIGHT = 4;
const DEFAULT_NUMBER_DISPLAY_DIGITS = 1;
const DEFAULT_GUIDE_LENGTH = 5;
const BUILTIN_CREATED_AT = Date.UTC(2026, 3, 5, 12, 0, 0);

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
    default:
      return `${node.id}:in:${slot}`;
  }
}

function getGuideInputPortId(nodeId: number, slotIndex: number): string {
  return `${nodeId}:in:${slotIndex}`;
}

function getGuideOutputPortId(nodeId: number, slotIndex: number): string {
  return `${nodeId}:out:${slotIndex}`;
}

function makePresetNode(
  id: number,
  type: NodeType,
  x: number,
  y: number,
  patch: Partial<NodeData> = {}
): NodeData {
  const node: NodeData = {
    id,
    type,
    x,
    y,
    value: false,
    rotation: 0,
  };

  if (type === "OUTPUT" || type === "LED") {
    (node as any).lightColor = DEFAULT_LIGHT_COLOR;
  }
  if (type === "POWER") node.value = true;
  if (type === "CLOCK") node.clockDelayMs = 100;
  if (type === "DFF") node.value = false;
  if (type === "BUFFER") node.bufferDelayMs = 100;
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

  return { ...node, ...patch };
}

type LogicSignal = {
  nodeId: number;
  portId: string;
};

interface LogicBuilder {
  nextId: number;
  nodes: NodeData[];
  wires: WireData[];
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
  const node = makePresetNode(builder.nextId++, type, x, y, patch);
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
    const off = addLogicNode(builder, "NOT", 96, 24);
    connectSignalToNode(builder, ensureTrueSignal(builder), off);
    builder.falseSignal = signalFromNode(off);
  }
  return builder.falseSignal;
}

function addNotGate(builder: LogicBuilder, input: LogicSignal, x: number, y: number): LogicSignal {
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

function addAndMany(builder: LogicBuilder, inputs: LogicSignal[], x: number, y: number): LogicSignal {
  if (inputs.length === 0) return ensureTrueSignal(builder);
  if (inputs.length === 1) return inputs[0];
  let current = inputs[0];
  for (let index = 1; index < inputs.length; index++) {
    current = addBinaryGate(builder, "AND", current, inputs[index], x + (index - 1) * 84, y);
  }
  return current;
}

function addOrMany(builder: LogicBuilder, inputs: LogicSignal[], x: number, y: number): LogicSignal {
  if (inputs.length === 0) return ensureFalseSignal(builder);
  if (inputs.length === 1) return inputs[0];
  let current = inputs[0];
  for (let index = 1; index < inputs.length; index++) {
    current = addBinaryGate(builder, "OR", current, inputs[index], x + (index - 1) * 84, y);
  }
  return current;
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

function addMinterms(
  builder: LogicBuilder,
  signals: LogicSignal[],
  x: number,
  y: number
): LogicSignal[] {
  const total = 1 << signals.length;
  const inverted = signals.map((signal, index) => addNotGate(builder, signal, x, y + index * 48));
  const terms: LogicSignal[] = [];
  for (let value = 0; value < total; value++) {
    const parts = signals.map((signal, bitIndex) =>
      value & (1 << (signals.length - bitIndex - 1)) ? signal : inverted[bitIndex]
    );
    terms.push(addAndMany(builder, parts, x + 132, y + value * 72));
  }
  return terms;
}

function buildHalfAdderDefinition(id: number): ICDefinition {
  const inA = makePresetNode(1, "SWITCH", 24, 40, { titleText: "A" });
  const inB = makePresetNode(2, "SWITCH", 24, 136, { titleText: "B" });
  const xor = makePresetNode(3, "XOR", 156, 52);
  const and = makePresetNode(4, "AND", 156, 148);
  const sum = makePresetNode(5, "OUTPUT", 336, 52, { titleText: "SUM" });
  const carry = makePresetNode(6, "OUTPUT", 336, 148, { titleText: "CARRY" });

  return {
    id,
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

function buildFullAdderDefinition(id: number, halfAdderId: number): ICDefinition {
  const inA = makePresetNode(1, "SWITCH", 24, 40, { titleText: "A" });
  const inB = makePresetNode(2, "SWITCH", 24, 112, { titleText: "B" });
  const inCarry = makePresetNode(3, "SWITCH", 24, 184, { titleText: "C IN" });
  const ha1 = makePresetNode(4, "IC", 204, 56, { icDefId: halfAdderId });
  const ha2 = makePresetNode(5, "IC", 468, 116, { icDefId: halfAdderId });
  const or = makePresetNode(6, "OR", 720, 128);
  const sum = makePresetNode(7, "OUTPUT", 900, 88, { titleText: "SUM" });
  const carry = makePresetNode(8, "OUTPUT", 900, 184, { titleText: "C OUT" });

  return {
    id,
    name: "FULL ADDER",
    nodes: [inA, inB, inCarry, ha1, ha2, or, sum, carry],
    wires: [
      { fromNodeId: inA.id, toNodeId: ha1.id, fromPortId: getDefaultPortId(inA, "output"), toPortId: getDefaultPortId(ha1, "input", 0) },
      { fromNodeId: inB.id, toNodeId: ha1.id, fromPortId: getDefaultPortId(inB, "output"), toPortId: getDefaultPortId(ha1, "input", 1) },
      { fromNodeId: ha1.id, toNodeId: ha2.id, fromPortId: getDefaultPortId(ha1, "output", 0), toPortId: getDefaultPortId(ha2, "input", 0) },
      { fromNodeId: inCarry.id, toNodeId: ha2.id, fromPortId: getDefaultPortId(inCarry, "output"), toPortId: getDefaultPortId(ha2, "input", 1) },
      { fromNodeId: ha2.id, toNodeId: sum.id, fromPortId: getDefaultPortId(ha2, "output", 0), toPortId: getDefaultPortId(sum, "input") },
      { fromNodeId: ha1.id, toNodeId: or.id, fromPortId: getDefaultPortId(ha1, "output", 1), toPortId: getDefaultPortId(or, "input", "a") },
      { fromNodeId: ha2.id, toNodeId: or.id, fromPortId: getDefaultPortId(ha2, "output", 1), toPortId: getDefaultPortId(or, "input", "b") },
      { fromNodeId: or.id, toNodeId: carry.id, fromPortId: getDefaultPortId(or, "output"), toPortId: getDefaultPortId(carry, "input") },
    ],
    inputNodeIds: [inA.id, inB.id, inCarry.id],
    outputNodeIds: [sum.id, carry.id],
    ledNodeIds: [],
    compactLayout: {
      nodeWidth: 188,
      bodyHeight: 176,
      portPitch: 16,
    },
  };
}

function buildFourBitAdderDefinition(id: number, fullAdderId: number): ICDefinition {
  const nodes: NodeData[] = [];
  const wires: WireData[] = [];
  let nextId = 1;
  const inputsA = Array.from({ length: 4 }, (_, index) =>
    makePresetNode(nextId++, "SWITCH", 24, 56 + index * 72, { titleText: `A${index}` })
  );
  const inputsB = Array.from({ length: 4 }, (_, index) =>
    makePresetNode(nextId++, "SWITCH", 24, 392 + index * 72, { titleText: `B${index}` })
  );
  const carryIn = makePresetNode(nextId++, "SWITCH", 24, 704, { titleText: "C IN" });
  const adders = Array.from({ length: 4 }, (_, index) =>
    makePresetNode(nextId++, "IC", 264 + index * 264, 184, { icDefId: fullAdderId })
  );
  const sumOutputs = Array.from({ length: 4 }, (_, index) =>
    makePresetNode(nextId++, "OUTPUT", 1416, 72 + index * 96, { titleText: `S${index}` })
  );
  const carryOut = makePresetNode(nextId++, "OUTPUT", 1416, 504, { titleText: "C OUT" });

  nodes.push(...inputsA, ...inputsB, carryIn, ...adders, ...sumOutputs, carryOut);

  adders.forEach((adder, index) => {
    wires.push(
      { fromNodeId: inputsA[index].id, toNodeId: adder.id, fromPortId: getDefaultPortId(inputsA[index], "output"), toPortId: getDefaultPortId(adder, "input", 0) },
      { fromNodeId: inputsB[index].id, toNodeId: adder.id, fromPortId: getDefaultPortId(inputsB[index], "output"), toPortId: getDefaultPortId(adder, "input", 1) },
      { fromNodeId: adder.id, toNodeId: sumOutputs[index].id, fromPortId: getDefaultPortId(adder, "output", 0), toPortId: getDefaultPortId(sumOutputs[index], "input") }
    );
    if (index === 0) {
      wires.push({
        fromNodeId: carryIn.id,
        toNodeId: adder.id,
        fromPortId: getDefaultPortId(carryIn, "output"),
        toPortId: getDefaultPortId(adder, "input", 2),
      });
    } else {
      wires.push({
        fromNodeId: adders[index - 1].id,
        toNodeId: adder.id,
        fromPortId: getDefaultPortId(adders[index - 1], "output", 1),
        toPortId: getDefaultPortId(adder, "input", 2),
      });
    }
  });

  wires.push({
    fromNodeId: adders[3].id,
    toNodeId: carryOut.id,
    fromPortId: getDefaultPortId(adders[3], "output", 1),
    toPortId: getDefaultPortId(carryOut, "input"),
  });

  return {
    id,
    name: "4-BIT ADDER",
    nodes,
    wires,
    inputNodeIds: [...inputsA.map((node) => node.id), ...inputsB.map((node) => node.id), carryIn.id],
    outputNodeIds: [...sumOutputs.map((node) => node.id), carryOut.id],
    ledNodeIds: [],
    compactLayout: {
      nodeWidth: 220,
      bodyHeight: 232,
      portPitch: 14,
    },
  };
}

function buildClockDividerDefinition(id: number): ICDefinition {
  const builder = createLogicBuilder();
  const clock = addLogicNode(builder, "SWITCH", 24, 48, { titleText: "CLK" });
  const dffs = Array.from({ length: 4 }, (_, index) =>
    addLogicNode(builder, "DFF", 264 + index * 168, 108 + index * 48)
  );
  const outputs = Array.from({ length: 5 }, (_, index) =>
    addLogicNode(
      builder,
      "OUTPUT",
      1128,
      72 + index * 84,
      { titleText: index < 4 ? `Q${index}` : "SLOW" }
    )
  );
  const clockSignal = signalFromNode(clock);
  const dividerGuides = [
    addLogicNode(builder, "GUIDE", 168, 180, { guideLength: 5 }),
    addLogicNode(builder, "GUIDE", 168, 348, { guideLength: 5 }),
  ];

  connectSignalToPort(builder, clockSignal, dividerGuides[0].id, getGuideInputPortId(dividerGuides[0].id, 0));
  connectSignalToPort(builder, clockSignal, dividerGuides[1].id, getGuideInputPortId(dividerGuides[1].id, 0));

  const qSignals = dffs.map((node) => signalFromNode(node));
  const notQ = qSignals.map((signal, index) => addNotGate(builder, signal, 240 + index * 168, 48));

  connectDff(builder, dffs[0], notQ[0], signalFromPort(dividerGuides[0].id, getGuideOutputPortId(dividerGuides[0].id, 0)));
  const toggle1 = addBinaryGate(builder, "XOR", qSignals[1], qSignals[0], 504, 288);
  const toggle2 = addBinaryGate(builder, "XOR", qSignals[2], addAndMany(builder, [qSignals[0], qSignals[1]], 480, 432), 696, 384);
  const carry01 = addAndMany(builder, [qSignals[0], qSignals[1]], 456, 528);
  const carry012 = addAndMany(builder, [qSignals[0], qSignals[1], qSignals[2]], 648, 576);
  const toggle3 = addBinaryGate(builder, "XOR", qSignals[3], carry012, 888, 528);

  connectDff(builder, dffs[1], toggle1, signalFromPort(dividerGuides[0].id, getGuideOutputPortId(dividerGuides[0].id, 1)));
  connectDff(builder, dffs[2], toggle2, signalFromPort(dividerGuides[0].id, getGuideOutputPortId(dividerGuides[0].id, 2)));
  connectDff(builder, dffs[3], toggle3, signalFromPort(dividerGuides[0].id, getGuideOutputPortId(dividerGuides[0].id, 3)));

  qSignals.forEach((signal, index) => connectSignalToNode(builder, signal, outputs[index]));
  connectSignalToNode(builder, qSignals[3], outputs[4]);

  return {
    id,
    name: "CLOCK DIVIDER",
    nodes: builder.nodes,
    wires: builder.wires,
    inputNodeIds: [clock.id],
    outputNodeIds: outputs.map((node) => node.id),
    ledNodeIds: [],
    compactLayout: {
      nodeWidth: 200,
      bodyHeight: 196,
      portPitch: 14,
    },
  };
}

function buildRandomPulseDefinition(id: number): ICDefinition {
  const builder = createLogicBuilder();
  const internalClock = addLogicNode(builder, "CLOCK", 24, 120, {
    titleText: "STEP",
    clockDelayMs: 180,
  });
  const dffs = Array.from({ length: 4 }, (_, index) =>
    addLogicNode(builder, "DFF", 324 + index * 180, 72 + index * 60, {
      value: index === 0,
    })
  );
  const outputs = [
    addLogicNode(builder, "OUTPUT", 1236, 72, { titleText: "PULSE" }),
    addLogicNode(builder, "OUTPUT", 1236, 168, { titleText: "Q0" }),
    addLogicNode(builder, "OUTPUT", 1236, 264, { titleText: "Q1" }),
    addLogicNode(builder, "OUTPUT", 1236, 360, { titleText: "Q2" }),
    addLogicNode(builder, "OUTPUT", 1236, 456, { titleText: "Q3" }),
  ];
  const clockGuide = addLogicNode(builder, "GUIDE", 204, 276, { guideLength: 5 });
  connectSignalToPort(builder, signalFromNode(internalClock), clockGuide.id, getGuideInputPortId(clockGuide.id, 0));

  const q = dffs.map((node) => signalFromNode(node));
  const feedback = addBinaryGate(builder, "XOR", q[3], q[2], 924, 180);

  connectDff(builder, dffs[0], feedback, signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 0)));
  connectDff(builder, dffs[1], q[0], signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 1)));
  connectDff(builder, dffs[2], q[1], signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 2)));
  connectDff(builder, dffs[3], q[2], signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 3)));

  const pulse = addBinaryGate(builder, "XOR", q[0], q[3], 1068, 72);
  connectSignalToNode(builder, pulse, outputs[0]);
  q.forEach((signal, index) => connectSignalToNode(builder, signal, outputs[index + 1]));

  return {
    id,
    name: "RANDOM PULSE",
    nodes: builder.nodes,
    wires: builder.wires,
    inputNodeIds: [],
    outputNodeIds: outputs.map((node) => node.id),
    ledNodeIds: [],
    compactLayout: {
      nodeWidth: 212,
      bodyHeight: 176,
      portPitch: 14,
    },
  };
}

function buildTwoBitCalculatorCircuit(
  halfAdderId: number,
  fullAdderId: number,
  fourBitAdderId: number
): SaveFileV1 {
  const defs = [
    buildHalfAdderDefinition(halfAdderId),
    buildFullAdderDefinition(fullAdderId, halfAdderId),
    buildFourBitAdderDefinition(fourBitAdderId, fullAdderId),
  ];
  const nodes: NodeData[] = [];
  const notes: NoteData[] = [];
  const wires: WireData[] = [];
  let nextId = 1;

  const a0 = makePresetNode(nextId++, "SWITCH", 96, 96, { titleText: "A0" });
  const a1 = makePresetNode(nextId++, "SWITCH", 96, 192, { titleText: "A1" });
  const b0 = makePresetNode(nextId++, "SWITCH", 96, 360, { titleText: "B0" });
  const b1 = makePresetNode(nextId++, "SWITCH", 96, 456, { titleText: "B1" });
  const sub = makePresetNode(nextId++, "SWITCH", 96, 624, { titleText: "SUB" });
  const adder = makePresetNode(nextId++, "IC", 576, 264, { icDefId: fourBitAdderId });
  const xorB0 = makePresetNode(nextId++, "XOR", 312, 372);
  const xorB1 = makePresetNode(nextId++, "XOR", 312, 468);
  const zeroPower = makePresetNode(nextId++, "POWER", 144, 744, { titleText: "1" });
  const zero0 = makePresetNode(nextId++, "NOT", 264, 744, { titleText: "0" });
  const aDisplay = makePresetNode(nextId++, "NUMBER_DISPLAY", 1056, 72, {
    titleText: "A",
    numberDigits: 1,
  });
  const bDisplay = makePresetNode(nextId++, "NUMBER_DISPLAY", 1056, 288, {
    titleText: "B",
    numberDigits: 1,
  });
  const resultDisplay = makePresetNode(nextId++, "NUMBER_DISPLAY", 1056, 576, {
    titleText: "OUT",
    numberDigits: 1,
  });
  const ledAdd = makePresetNode(nextId++, "LED", 1440, 600, { titleText: "ADD" });
  const ledSub = makePresetNode(nextId++, "LED", 1440, 696, { titleText: "SUB" });
  const notSub = makePresetNode(nextId++, "NOT", 216, 624);
  nodes.push(
    a0,
    a1,
    b0,
    b1,
    sub,
    adder,
    xorB0,
    xorB1,
    zeroPower,
    zero0,
    aDisplay,
    bDisplay,
    resultDisplay,
    ledAdd,
    ledSub,
    notSub
  );

  wires.push(
    { fromNodeId: a0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(a0, "output"), toPortId: getDefaultPortId(adder, "input", 0) },
    { fromNodeId: a1.id, toNodeId: adder.id, fromPortId: getDefaultPortId(a1, "output"), toPortId: getDefaultPortId(adder, "input", 1) },
    { fromNodeId: zero0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(adder, "input", 2) },
    { fromNodeId: zero0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(adder, "input", 3) },
    { fromNodeId: sub.id, toNodeId: xorB0.id, fromPortId: getDefaultPortId(sub, "output"), toPortId: getDefaultPortId(xorB0, "input", "b") },
    { fromNodeId: b0.id, toNodeId: xorB0.id, fromPortId: getDefaultPortId(b0, "output"), toPortId: getDefaultPortId(xorB0, "input", "a") },
    { fromNodeId: sub.id, toNodeId: xorB1.id, fromPortId: getDefaultPortId(sub, "output"), toPortId: getDefaultPortId(xorB1, "input", "b") },
    { fromNodeId: b1.id, toNodeId: xorB1.id, fromPortId: getDefaultPortId(b1, "output"), toPortId: getDefaultPortId(xorB1, "input", "a") },
    { fromNodeId: xorB0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(xorB0, "output"), toPortId: getDefaultPortId(adder, "input", 4) },
    { fromNodeId: xorB1.id, toNodeId: adder.id, fromPortId: getDefaultPortId(xorB1, "output"), toPortId: getDefaultPortId(adder, "input", 5) },
    { fromNodeId: zero0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(adder, "input", 6) },
    { fromNodeId: zero0.id, toNodeId: adder.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(adder, "input", 7) },
    { fromNodeId: sub.id, toNodeId: adder.id, fromPortId: getDefaultPortId(sub, "output"), toPortId: getDefaultPortId(adder, "input", 8) },
    { fromNodeId: a0.id, toNodeId: aDisplay.id, fromPortId: getDefaultPortId(a0, "output"), toPortId: getDefaultPortId(aDisplay, "input", 0) },
    { fromNodeId: a1.id, toNodeId: aDisplay.id, fromPortId: getDefaultPortId(a1, "output"), toPortId: getDefaultPortId(aDisplay, "input", 1) },
    { fromNodeId: zero0.id, toNodeId: aDisplay.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(aDisplay, "input", 2) },
    { fromNodeId: zero0.id, toNodeId: aDisplay.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(aDisplay, "input", 3) },
    { fromNodeId: b0.id, toNodeId: bDisplay.id, fromPortId: getDefaultPortId(b0, "output"), toPortId: getDefaultPortId(bDisplay, "input", 0) },
    { fromNodeId: b1.id, toNodeId: bDisplay.id, fromPortId: getDefaultPortId(b1, "output"), toPortId: getDefaultPortId(bDisplay, "input", 1) },
    { fromNodeId: zero0.id, toNodeId: bDisplay.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(bDisplay, "input", 2) },
    { fromNodeId: zero0.id, toNodeId: bDisplay.id, fromPortId: getDefaultPortId(zero0, "output"), toPortId: getDefaultPortId(bDisplay, "input", 3) },
    { fromNodeId: adder.id, toNodeId: resultDisplay.id, fromPortId: getDefaultPortId(adder, "output", 0), toPortId: getDefaultPortId(resultDisplay, "input", 0) },
    { fromNodeId: adder.id, toNodeId: resultDisplay.id, fromPortId: getDefaultPortId(adder, "output", 1), toPortId: getDefaultPortId(resultDisplay, "input", 1) },
    { fromNodeId: adder.id, toNodeId: resultDisplay.id, fromPortId: getDefaultPortId(adder, "output", 2), toPortId: getDefaultPortId(resultDisplay, "input", 2) },
    { fromNodeId: adder.id, toNodeId: resultDisplay.id, fromPortId: getDefaultPortId(adder, "output", 3), toPortId: getDefaultPortId(resultDisplay, "input", 3) },
    { fromNodeId: sub.id, toNodeId: ledSub.id, fromPortId: getDefaultPortId(sub, "output"), toPortId: getDefaultPortId(ledSub, "input") },
    { fromNodeId: sub.id, toNodeId: notSub.id, fromPortId: getDefaultPortId(sub, "output"), toPortId: getDefaultPortId(notSub, "input") },
    { fromNodeId: notSub.id, toNodeId: ledAdd.id, fromPortId: getDefaultPortId(notSub, "output"), toPortId: getDefaultPortId(ledAdd, "input") },
    { fromNodeId: zeroPower.id, toNodeId: zero0.id, fromPortId: getDefaultPortId(zeroPower, "output"), toPortId: getDefaultPortId(zero0, "input") }
  );

  notes.push(
    { id: 1, x: 48, y: 24, width: 264, height: 120, text: "2-bit calculator\n\nA and B are the inputs.\nSUB off = A + B\nSUB on = A - B (two's complement)." },
    { id: 2, x: 1008, y: 480, width: 264, height: 96, text: "The result display shows the 4-bit output from the adder IC." }
  );

  return {
    version: 1,
    nodes,
    notes,
    wires,
    icDefinitions: defs,
    nextIds: {
      nextNodeId: nextId,
      nextWireId: wires.length + 1,
      nextICId: fourBitAdderId + 1,
      nextNoteId: notes.length + 1,
    },
  };
}

function buildLetterDisplayCircuit(): SaveFileV1 {
  const builder = createLogicBuilder();
  const s1 = addLogicNode(builder, "SWITCH", 72, 96, { titleText: "S1" });
  const s0 = addLogicNode(builder, "SWITCH", 72, 192, { titleText: "S0" });
  const display = addLogicNode(builder, "DISPLAY", 1176, 144, {
    titleText: "LETTER",
    displayWidth: 5,
    displayHeight: 5,
  });
  const selectors = [signalFromNode(s1), signalFromNode(s0)];
  const minterms = addMinterms(builder, selectors, 216, 72);
  const pixelPatterns = [
    "10001 10001 11111 10001 10001",
    "11111 10000 11110 10000 11111",
    "10000 10000 10000 10000 11111",
    "01110 10001 10001 10001 01110",
  ].map((rowSet) => rowSet.replace(/\s+/g, ""));

  for (let pixelIndex = 0; pixelIndex < 25; pixelIndex++) {
    const needed = minterms.filter((_, letterIndex) => pixelPatterns[letterIndex]?.[pixelIndex] === "1");
    const signal =
      needed.length === 0
        ? ensureFalseSignal(builder)
        : needed.length === 1
        ? needed[0]
        : addOrMany(builder, needed, 732, 72 + pixelIndex * 24);
    connectSignalToNode(builder, signal, display, pixelIndex);
  }

  const notes: NoteData[] = [
    {
      id: 1,
      x: 48,
      y: 288,
      width: 288,
      height: 144,
      text: "2-bit letter decoder\n\n00 = H\n01 = E\n10 = L\n11 = O",
    },
  ];

  return {
    version: 1,
    nodes: builder.nodes,
    notes,
    wires: builder.wires,
    icDefinitions: [],
    nextIds: {
      nextNodeId: builder.nextId,
      nextWireId: builder.wires.length + 1,
      nextICId: 1,
      nextNoteId: 2,
    },
  };
}

function buildSongPlayerCircuit(): SaveFileV1 {
  const builder = createLogicBuilder();
  const beatClock = addLogicNode(builder, "CLOCK", 72, 120, {
    titleText: "BEAT",
    clockDelayMs: 260,
  });
  const d0 = addLogicNode(builder, "DFF", 408, 96, { value: true });
  const d1 = addLogicNode(builder, "DFF", 600, 192);
  const d2 = addLogicNode(builder, "DFF", 792, 288);
  const speaker = addLogicNode(builder, "SPEAKER", 1512, 192, {
    titleText: "MELODY",
    speakerFrequencyHz: 262,
  });
  const leds = [
    addLogicNode(builder, "LED", 1512, 456, { titleText: "STEP0" }),
    addLogicNode(builder, "LED", 1512, 528, { titleText: "STEP1" }),
    addLogicNode(builder, "LED", 1512, 600, { titleText: "STEP2" }),
  ];
  const q0 = signalFromNode(d0);
  const q1 = signalFromNode(d1);
  const q2 = signalFromNode(d2);
  const notQ0 = addNotGate(builder, q0, 336, 24);
  const carry0 = q0;
  const carry01 = addAndMany(builder, [q0, q1], 636, 456);
  const next1 = addBinaryGate(builder, "XOR", q1, carry0, 516, 432);
  const next2 = addBinaryGate(builder, "XOR", q2, carry01, 708, 504);
  const clockGuide = addLogicNode(builder, "GUIDE", 240, 240, { guideLength: 4 });
  connectSignalToPort(builder, signalFromNode(beatClock), clockGuide.id, getGuideInputPortId(clockGuide.id, 0));
  connectDff(builder, d0, notQ0, signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 0)));
  connectDff(builder, d1, next1, signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 1)));
  connectDff(builder, d2, next2, signalFromPort(clockGuide.id, getGuideOutputPortId(clockGuide.id, 2)));

  const minterms = addMinterms(builder, [q2, q1, q0], 924, 72);
  const melody = [
    1, 3, 5, 8, 10, 8, 5, 3,
  ];
  for (let bit = 0; bit < 4; bit++) {
    const activeSteps = minterms.filter((_, step) => ((melody[step] >> bit) & 1) === 1);
    const signal = activeSteps.length === 1
      ? activeSteps[0]
      : addOrMany(builder, activeSteps, 1188, 72 + bit * 120);
    connectSignalToNode(builder, signal, speaker, bit);
  }

  connectSignalToNode(builder, q0, leds[0]);
  connectSignalToNode(builder, q1, leds[1]);
  connectSignalToNode(builder, q2, leds[2]);

  const notes: NoteData[] = [
    {
      id: 1,
      x: 48,
      y: 312,
      width: 300,
      height: 132,
      text: "8-step melody player\n\nA clock advances the 3-bit counter.\nLogic gates decode each step into a note for the speaker.",
    },
  ];

  return {
    version: 1,
    nodes: builder.nodes,
    notes,
    wires: builder.wires,
    icDefinitions: [],
    nextIds: {
      nextNodeId: builder.nextId,
      nextWireId: builder.wires.length + 1,
      nextICId: 1,
      nextNoteId: 2,
    },
  };
}

function buildSingleIcToolboxSave(rootDef: ICDefinition, defs: ICDefinition[]): SaveFileV1 {
  const maxDefId = defs.reduce((maxId, def) => Math.max(maxId, def.id), rootDef.id);
  return {
    version: 1,
    nodes: [
      {
        id: 1,
        type: "IC",
        x: 96,
        y: 96,
        value: false,
        rotation: 0,
        icDefId: rootDef.id,
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

export function buildBuiltinStoreFragment(): BuiltinStoreFragment {
  const halfAdderId = 1;
  const fullAdderId = 2;
  const fourBitAdderId = 3;
  const clockDividerId = 4;
  const randomPulseId = 5;

  const halfAdder = buildHalfAdderDefinition(halfAdderId);
  const fullAdder = buildFullAdderDefinition(fullAdderId, halfAdderId);
  const fourBitAdder = buildFourBitAdderDefinition(fourBitAdderId, fullAdderId);
  const clockDivider = buildClockDividerDefinition(clockDividerId);
  const randomPulse = buildRandomPulseDefinition(randomPulseId);

  return {
    users: [
      {
        id: 1,
        googleSub: BUILTIN_OWNER_GOOGLE_SUB,
        email: "library@cirkit.local",
        name: "Library",
      },
    ],
    circuits: [
      {
        key: "builtin-circuit-calculator",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        title: "2-Bit Calculator",
        visibility: "preview",
        data: buildTwoBitCalculatorCircuit(halfAdderId, fullAdderId, fourBitAdderId),
      },
      {
        key: "builtin-circuit-letter-display",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        title: "Letter Display",
        visibility: "preview",
        data: buildLetterDisplayCircuit(),
      },
      {
        key: "builtin-circuit-song-player",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        title: "Song Player",
        visibility: "preview",
        data: buildSongPlayerCircuit(),
      },
    ],
    toolboxICs: [
      {
        key: "builtin-toolbox-half-adder",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        name: "Half Adder",
        description: "Adds two 1-bit inputs into sum and carry.",
        data: buildSingleIcToolboxSave(halfAdder, [halfAdder]),
        createdAt: BUILTIN_CREATED_AT,
      },
      {
        key: "builtin-toolbox-full-adder",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        name: "Full Adder",
        description: "Adds A, B, and carry-in using two half adders.",
        data: buildSingleIcToolboxSave(fullAdder, [halfAdder, fullAdder]),
        createdAt: BUILTIN_CREATED_AT + 1,
      },
      {
        key: "builtin-toolbox-four-bit-adder",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        name: "4-Bit Adder",
        description: "Chains four full adders for multi-bit math.",
        data: buildSingleIcToolboxSave(fourBitAdder, [halfAdder, fullAdder, fourBitAdder]),
        createdAt: BUILTIN_CREATED_AT + 2,
      },
      {
        key: "builtin-toolbox-clock-divider",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        name: "Clock Divider",
        description: "Splits one clock into slower binary steps.",
        data: buildSingleIcToolboxSave(clockDivider, [clockDivider]),
        createdAt: BUILTIN_CREATED_AT + 3,
      },
      {
        key: "builtin-toolbox-random-pulse",
        ownerId: 1,
        ownerGoogleSub: BUILTIN_OWNER_GOOGLE_SUB,
        name: "Random Pulse",
        description: "A small clocked LFSR that outputs pseudo-random pulses.",
        data: buildSingleIcToolboxSave(randomPulse, [randomPulse]),
        createdAt: BUILTIN_CREATED_AT + 4,
      },
    ],
  };
}
