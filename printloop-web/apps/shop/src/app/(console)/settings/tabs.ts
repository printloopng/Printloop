export const SETTINGS_TABS = [
  { value: "location", label: "Shop & location" },
  { value: "branding", label: "Branding" },
  { value: "payouts", label: "Payouts" },
  { value: "domains", label: "Domains" },
  { value: "webhooks", label: "Webhooks" },
  { value: "security", label: "Security" },
  { value: "integrations", label: "Integrations" },
  { value: "account", label: "Data & account" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["value"];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return SETTINGS_TABS.some((t) => t.value === value);
}
