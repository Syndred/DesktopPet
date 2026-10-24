import { ConversationsPage } from './chat-page';
import { ConversationSettingsPage } from './settings-page';
import './styles.css';

export { ConversationsPage, ConversationSettingsPage };
export { desktopConversationClient } from './client';
export default {
  id: 'conversations', title: '聊天',
  routes: [
    { path: '/chat', title: '独立聊天与记忆', component: ConversationsPage },
    { path: '/settings/ai', title: 'AI 对话设置', component: ConversationSettingsPage }
  ]
};
