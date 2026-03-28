'use client';

import { useState } from 'react';

interface WbsNode {
  id: string;
  code: string;
  name: string;
  level: number;
  parentId: string | null;
  activityCount: number;
}

interface WbsTreeProps {
  nodes: WbsNode[];
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

interface TreeNode extends WbsNode {
  children: TreeNode[];
}

function buildTree(nodes: WbsNode[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId === null || !map.has(node.parentId)) {
      roots.push(node);
    } else {
      map.get(node.parentId)!.children.push(node);
    }
  }
  return roots;
}

interface TreeNodeProps {
  node: TreeNode;
  selectedNodeId: string | null;
  onSelect: (nodeId: string | null) => void;
}

function TreeNodeItem({ node, selectedNodeId, onSelect }: TreeNodeProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 px-2 rounded cursor-pointer text-sm hover:bg-slate-100 ${
          isSelected ? 'bg-blue-100 text-blue-800 font-medium' : 'text-slate-700'
        }`}
        style={{ paddingLeft: `${(node.level - 1) * 16 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : node.id)}
      >
        {hasChildren ? (
          <button
            className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-700 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
          >
            {collapsed ? '▶' : '▼'}
          </button>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <span className="font-mono text-xs text-slate-500 flex-shrink-0 w-16 truncate">
          {node.code}
        </span>
        <span className="truncate flex-1">{node.name}</span>
        <span className="text-xs text-slate-400 flex-shrink-0 ml-1">
          ({node.activityCount})
        </span>
      </div>
      {!collapsed && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeItem
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WbsTree({ nodes, selectedNodeId, onSelect }: WbsTreeProps) {
  const tree = buildTree(nodes);

  return (
    <div className="bg-white border border-slate-200 rounded-lg h-full overflow-y-auto">
      <div className="p-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-700">WBS</h3>
      </div>
      <div className="p-2">
        {selectedNodeId && (
          <button
            className="text-xs text-blue-600 hover:underline mb-2 block"
            onClick={() => onSelect(null)}
          >
            Clear filter
          </button>
        )}
        {tree.map((node) => (
          <TreeNodeItem
            key={node.id}
            node={node}
            selectedNodeId={selectedNodeId}
            onSelect={onSelect}
          />
        ))}
        {tree.length === 0 && (
          <p className="text-xs text-slate-400 p-2">No WBS nodes</p>
        )}
      </div>
    </div>
  );
}
