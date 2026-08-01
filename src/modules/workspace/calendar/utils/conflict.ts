export interface TimeSlot {
  startTime: Date;
  endTime: Date;
}

export class ConflictDetector {
  static hasOverlap(slotA: TimeSlot, slotB: TimeSlot): boolean {
    return slotA.startTime < slotB.endTime && slotA.endTime > slotB.startTime;
  }

  static findCollisions(target: TimeSlot, existingSlots: TimeSlot[]): TimeSlot[] {
    return existingSlots.filter((slot) => this.hasOverlap(target, slot));
  }
}