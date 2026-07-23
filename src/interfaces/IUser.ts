export interface IUser {
  id: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: string;
  avatarUrl?: string | null;
  createdAt: Date;
  updatedAt: Date;
}