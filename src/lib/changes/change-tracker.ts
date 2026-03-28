export interface ChangeRecord {
  entityType: 'activity' | 'relationship' | 'resource' | 'wbs' | 'calendar';
  entityId: string;
  changeType: 'create' | 'update' | 'delete';
  field?: string;
  oldValue?: unknown;
  newValue?: unknown;
  timestamp: number;
}

export class ChangeTracker {
  private undoStack: ChangeRecord[][] = [];
  private redoStack: ChangeRecord[][] = [];
  private pendingGroup: ChangeRecord[] = [];

  recordChange(change: ChangeRecord): void {
    this.pendingGroup.push(change);
    // Clear redo stack whenever a new change is recorded
    this.redoStack = [];
  }

  beginGroup(): void {
    this.pendingGroup = [];
  }

  commitGroup(): void {
    if (this.pendingGroup.length > 0) {
      this.undoStack.push([...this.pendingGroup]);
      this.pendingGroup = [];
    }
  }

  undo(): ChangeRecord[] | null {
    // Commit any pending group first
    if (this.pendingGroup.length > 0) {
      this.commitGroup();
    }
    if (this.undoStack.length === 0) return null;
    const group = this.undoStack.pop()!;
    this.redoStack.push(group);
    return group;
  }

  redo(): ChangeRecord[] | null {
    if (this.redoStack.length === 0) return null;
    const group = this.redoStack.pop()!;
    this.undoStack.push(group);
    return group;
  }

  getChanges(): ChangeRecord[] {
    return [...this.undoStack.flat(), ...this.pendingGroup];
  }

  hasUnsavedChanges(): boolean {
    return this.undoStack.length > 0 || this.pendingGroup.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.pendingGroup = [];
  }
}
