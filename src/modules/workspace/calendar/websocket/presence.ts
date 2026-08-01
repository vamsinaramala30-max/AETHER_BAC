export class PresenceTracker {
  private activeUsers: Map<string, Set<string>> = new Map();

  addUser(userId: string, socketId: string): void {
    if (!this.activeUsers.has(userId)) {
      this.activeUsers.set(userId, new Set());
    }
    this.activeUsers.get(userId)!.add(socketId);
  }

  removeUser(userId: string, socketId: string): void {
    if (this.activeUsers.has(userId)) {
      const sockets = this.activeUsers.get(userId)!;
      sockets.delete(socketId);
      if (sockets.size === 0) {
        this.activeUsers.delete(userId);
      }
    }
  }

  isUserOnline(userId: string): boolean {
    return this.activeUsers.has(userId);
  }
}