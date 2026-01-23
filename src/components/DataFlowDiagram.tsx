import React, { useMemo } from 'react';
import { Icon } from '@fluentui/react';
import { useTheme } from '../app/functionality/ThemeContext';
import { colours } from '../app/styles/colours';

type Node = {
  id: string;
  label: string;
  lane: 'Client' | 'API' | 'Functions' | 'Data' | 'External';
  x: number; // column index
  y: number; // row index within lane
};

type Edge = {
  from: string;
  to: string;
  label?: string;
};

/**
 * Renders a lane-based SVG diagram of the application's data flow.
 * Lanes: Client → API → Functions → Data/External
 * Intentionally avoids responsive lane wrapping because it makes edges unreadable.
 */
const DataFlowDiagram: React.FC = () => {
  const { isDarkMode } = useTheme();
  const laneOrder: Array<Node['lane']> = ['Client', 'API', 'Functions', 'Data', 'External'];
  const laneGap = 24;
  const laneWidth = 260;
  const laneHeaderH = 26;
  const lanePaddingTop = 18;
  const nodeW = 220;
  const nodeH = 40;
  const vGap = 16;
  const laneHeight = 210;

  const nodes: Node[] = [
    // Client
    { id: 'client-ui', label: 'Teams Tab UI (React)', lane: 'Client', x: 0, y: 0 },
    { id: 'client-dev', label: 'Dev Tools (user bubble)', lane: 'Client', x: 0, y: 1 },

    // API
    { id: 'api-gateway', label: 'API surface (/api/*)', lane: 'API', x: 1, y: 0 },
    { id: 'api-express', label: 'Express routes (server/*)', lane: 'API', x: 1, y: 1 },

    // Functions
    { id: 'func-core', label: 'Azure Functions (api/src)', lane: 'Functions', x: 2, y: 0 },
    { id: 'func-decoupled', label: 'Decoupled functions', lane: 'Functions', x: 2, y: 1 },

    // Data
    { id: 'data-core', label: 'Core Data DB (enquiries, matters)', lane: 'Data', x: 3, y: 0 },
    { id: 'data-instructions', label: 'Instructions DB (Deals, Instructions)', lane: 'Data', x: 3, y: 1 },
    { id: 'data-secrets', label: 'Key Vault / env secrets', lane: 'Data', x: 3, y: 2 },

    // External
    { id: 'ext-clio', label: 'Clio API', lane: 'External', x: 4, y: 0 },
    { id: 'ext-graph', label: 'Microsoft Graph (Email)', lane: 'External', x: 4, y: 1 },
    { id: 'ext-asana', label: 'Asana API', lane: 'External', x: 4, y: 2 },
  ];

  const edges: Edge[] = [
    // Client → API surface
    { from: 'client-ui', to: 'api-gateway', label: 'fetch /api/*' },
    { from: 'client-dev', to: 'api-gateway' },

    // API routing
    { from: 'api-gateway', to: 'func-core', label: 'Functions-backed' },
    { from: 'api-gateway', to: 'api-express', label: 'Express-backed' },
    { from: 'api-express', to: 'func-decoupled', label: 'proxy / helpers' },

    // Data access
    { from: 'func-core', to: 'data-core', label: 'queries' },
    { from: 'func-core', to: 'data-instructions', label: 'queries' },
    { from: 'api-express', to: 'data-core', label: 'queries' },
    { from: 'api-express', to: 'data-instructions', label: 'queries' },
    { from: 'func-core', to: 'data-secrets', label: 'secrets' },
    { from: 'func-decoupled', to: 'data-secrets', label: 'secrets' },

    // External services
    { from: 'func-core', to: 'ext-graph', label: 'email' },
    { from: 'func-core', to: 'ext-clio', label: 'matters/contacts' },
    { from: 'func-core', to: 'ext-asana', label: 'tasks' },
  ];

  const laneColor = isDarkMode ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const border = isDarkMode ? '1px solid rgba(255,255,255,0.10)' : '1px solid rgba(0,0,0,0.08)';
  const textColor = isDarkMode ? colours.dark.text : colours.light.text;

  const lanePos = (laneIndex: number) => {
    const x = laneIndex * (laneWidth + laneGap);
    const y = 0;
    return { x, y };
  };

  const nodePos = (n: Node) => {
    const idx = laneOrder.indexOf(n.lane);
    const lane = lanePos(idx);
    const padding = lanePaddingTop + laneHeaderH;
    const x = lane.x + (laneWidth - nodeW) / 2;
    const y = lane.y + padding + n.y * (nodeH + vGap);
    return { x, y };
  };

  const svgWidth = Math.max(1, laneOrder.length * (laneWidth + laneGap) - laneGap);
  const svgHeight = Math.max(1, laneHeight + 20);

  const nodeMap = new Map(nodes.map(n => [n.id, n] as const));

  const arrow = (fromId: string, toId: string, label?: string) => {
    const from = nodeMap.get(fromId)!;
    const to = nodeMap.get(toId)!;
    const p1 = nodePos(from);
    const p2 = nodePos(to);
    const startX = p1.x + nodeW;
    const startY = p1.y + nodeH / 2;
    const endX = p2.x;
    const endY = p2.y + nodeH / 2;
    // Control points for a smooth curve
    const dx = Math.max(40, Math.abs(endX - startX) * 0.4);
    const cp1X = startX + dx;
    const cp1Y = startY;
    const cp2X = endX - dx;
    const cp2Y = endY;
    const path = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX - 10} ${endY}`;
    const isDashed = fromId === 'api-gateway' && toId === 'api-express';
    const strokeDasharray = isDashed ? '6,4' : undefined;
    return (
      <g key={`${fromId}->${toId}`}>
        <path d={path} stroke={isDarkMode ? '#6ea8d6' : '#3690CE'} strokeWidth={2} fill="none" markerEnd="url(#arrow)" strokeDasharray={strokeDasharray} />
        {label && (
          <text x={(startX + endX) / 2} y={(startY + endY) / 2 - 6} textAnchor="middle" fontSize={11} fill={isDarkMode ? '#cbd5e1' : '#334155'}>
            {label}
          </text>
        )}
      </g>
    );
  };

  return (
    <div style={{
      border,
      borderRadius: 8,
      padding: 12,
      overflowX: 'auto',
      background: `linear-gradient(135deg, ${isDarkMode ? colours.dark.background : '#FFFFFF'} 0%, ${isDarkMode ? colours.dark.background : '#F8FAFC'} 100%)`,
      boxShadow: isDarkMode ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.07)'
    }}>
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} preserveAspectRatio="xMinYMin meet" role="img" aria-label="Application data flow diagram">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L0,6 L9,3 z" fill={isDarkMode ? '#6ea8d6' : '#3690CE'} />
          </marker>
        </defs>

        {laneOrder.map((lane, i) => {
          const lp = lanePos(i);
          return (
            <g key={lane}>
              <rect x={lp.x} y={lp.y} width={laneWidth} height={laneHeight} rx={8} ry={8} fill={laneColor} />
              <text x={lp.x + laneWidth / 2} y={lp.y + 18} textAnchor="middle" fontSize={12} fill={isDarkMode ? '#cbd5e1' : '#334155'}>
                {lane}
              </text>
            </g>
          );
        })}

        {/* Edges underneath nodes */}
        {edges.map(e => arrow(e.from, e.to, e.label))}

  {/* Nodes */}
        {nodes.map(n => {
          const p = nodePos(n);
          const gradId = `grad-${n.id}`;
          const light = ['#FFFFFF', '#F8FAFC'];
          const dark = [colours.dark.background, colours.dark.background];
          const [c1, c2] = isDarkMode ? dark : light;
          return (
            <g key={n.id}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={c1} />
                  <stop offset="100%" stopColor={c2} />
                </linearGradient>
              </defs>
              <rect x={p.x} y={p.y} width={nodeW} height={nodeH} rx={8} ry={8} fill={`url(#${gradId})`} stroke={isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'} />
              <text x={p.x + nodeW / 2} y={p.y + nodeH / 2 + 4} textAnchor="middle" fontSize={12} fill={textColor}>
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Visual legend (subtle Fluent UI icons) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 10, fontSize: 12, color: isDarkMode ? colours.dark.subText : colours.light.subText }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon iconName="Forward" style={{ fontSize: 14, color: isDarkMode ? '#cbd5e1' : '#64748b' }} />
          <span>Direct call</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon iconName="Flow" style={{ fontSize: 14, color: isDarkMode ? '#cbd5e1' : '#64748b' }} />
          <span>Proxy → Functions</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon iconName="Shield" style={{ fontSize: 14, color: isDarkMode ? '#cbd5e1' : '#64748b' }} />
          <span>Secrets (Key Vault)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon iconName="Cloud" style={{ fontSize: 14, color: isDarkMode ? '#cbd5e1' : '#64748b' }} />
          <span>Storage</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon iconName="Mail" style={{ fontSize: 14, color: isDarkMode ? '#cbd5e1' : '#64748b' }} />
          <span>Email (Graph)</span>
        </div>
      </div>
    </div>
  );
};

export default DataFlowDiagram;
