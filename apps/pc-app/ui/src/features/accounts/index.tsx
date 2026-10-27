import { AboutPage } from './about';
import { AccountPage } from "./account";
import { SettingsPage } from "./settings-page";
import "./styles.css";

const PrivacyPage = () => <SettingsPage privacy />;
export { AccountPage, SettingsPage };
export default {
  id: "accounts", title: "账号与设置",
  routes: [
    { path: "/account", title: "账号与云端", component: AccountPage },
    { path: "/settings", title: "桌面与行为", component: SettingsPage },
    { path: "/settings/privacy", title: "通知与隐私", component: PrivacyPage },
    { path: "/settings/about", title: "关于与诊断", component: AboutPage }
  ]
};
