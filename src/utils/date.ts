export class DateUtils {
  /**
   * Adds specified days to a given target date.
   */
  public static addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Checks if a target date is in the past.
   */
  public static isExpired(expirationDate: Date): boolean {
    return new Date() > expirationDate;
  }
}