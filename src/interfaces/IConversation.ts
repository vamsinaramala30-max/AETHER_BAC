import { IMessage } from './IMessage';

export interface IConversation {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  messages?: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}
