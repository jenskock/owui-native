/**
 * Navigation type definitions
 */

export type RootStackParamList = {
  Login: undefined;
  Chats: undefined;
  Chat: { chatId: string };
  Settings: undefined;
};
