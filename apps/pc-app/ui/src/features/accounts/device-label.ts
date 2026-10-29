// Read-only app:info platform, never user agent or a guessed OS default.
export function deviceLabel(platform?: string): string {
  switch (platform) {
    case 'win32': return 'Windows PC';
    case 'darwin': return 'Mac';
    case 'linux': return 'Linux PC';
    default: return '本机设备';
  }
}
