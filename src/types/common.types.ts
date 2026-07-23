export type Nullable<T> = T | null;

export type Optional<T> = T | undefined;

export type ID = string;

export type Timestamp = Date | string;

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}