/**
 * GeneralTab.tsx
 *
 * Network and UI settings for the Settings modal.
 */

import React, { useEffect, useState } from "react";
import {
  ApinoxConfig,
  ScrollableForm,
  FormGroup,
  Label,
  Input,
  CheckboxLabel,
  SectionHeader,
  CustomSelect,
} from "./SettingsTypes";
 import { useTheme } from "@apinox/request-editor/core";
import { useUI } from "../../../contexts/UIContext";
import { UI_FONTS, applyUIFont, UIFontValue } from "../../../utils/fontLoader";

interface GeneralTabProps {
  config: ApinoxConfig;
  onChange: (section: keyof ApinoxConfig, key: string, value: any) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ config, onChange }) => {
  const { theme, setTheme, isStandalone } = useTheme() as any;
  const { configDir } = useUI();
  const [uiFont, setUIFontState] = useState<UIFontValue>(
    (localStorage.getItem('apinox-ui-font') as UIFontValue) ?? 'fira-code'
  );

  const setUIFont = (font: UIFontValue) => {
    setUIFontState(font);
    localStorage.setItem('apinox-ui-font', font);
    applyUIFont(font);
  };
  const [tauriConfigDir, setTauriConfigDir] = useState<string | null>(null);

  useEffect(() => {
    if (!isStandalone) return;
    const loadTauriInfo = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const dir = await invoke<string | null>("get_config_dir");
        if (dir) setTauriConfigDir(dir);
      } catch (e) {
        console.error("Failed to load Tauri config dir:", e);
      }
    };

    loadTauriInfo();
  }, [isStandalone]);

  return (
    <ScrollableForm>
      <div style={{ display: "flex", gap: "30px" }}>
        {/* Left Column: User Interface */}
        <div style={{ flex: 1 }}>
          <SectionHeader style={{ marginTop: 0 }}>User Interface</SectionHeader>

          {/* Theme Selector - Only in Tauri Mode */}
          {isStandalone && (
            <FormGroup>
              <Label>Theme</Label>
              <CustomSelect
                value={theme}
                onChange={(v) => setTheme(v as any)}
                options={[
                  { value: "dark", label: "Dark" },
                  { value: "light", label: "Light" },
                  { value: "solarized-dark", label: "Solarized Dark" },
                  { value: "solarized-light", label: "Solarized Light" },
                  { value: "zed-dark", label: "Zed Dark" },
                  { value: "dankshell-light", label: "DankShell Light" },
                ]}
              />
            </FormGroup>
          )}

          {/* UI Font Selector - Only in Tauri Mode */}
          {isStandalone && (
            <FormGroup>
              <Label>UI Font</Label>
              <CustomSelect
                value={uiFont ?? 'system'}
                onChange={(v) => setUIFont(v as UIFontValue)}
                options={UI_FONTS.map(f => ({ value: f.value, label: f.label }))}
              />
            </FormGroup>
          )}

          <FormGroup>
            <CheckboxLabel>
              <input
                type="checkbox"
                checked={config.ui?.showDebugIndicator ?? false}
                onChange={(e) =>
                  onChange("ui", "showDebugIndicator", e.target.checked)
                }
              />
              Show Debug Indicator
            </CheckboxLabel>
          </FormGroup>
          <FormGroup>
            <CheckboxLabel>
              <input
                type="checkbox"
                checked={config.ui?.splashscreenEnabled ?? false}
                onChange={(e) =>
                  onChange("ui", "splashscreenEnabled", e.target.checked)
                }
              />
              Show Splash Screen
            </CheckboxLabel>
          </FormGroup>
          <FormGroup>
            <Label>Auto-Fold XML Elements</Label>
            <div
              style={{
                fontSize: "0.85em",
                color: "var(--apinox-descriptionForeground)",
                marginBottom: 8,
              }}
            >
              Enter element names to automatically collapse in editors (e.g.,
              Security, Header)
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginBottom: 8,
              }}
            >
              {(config.ui?.autoFoldElements || []).map((element, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "4px 8px",
                    background: "var(--apinox-badge-background)",
                    color: "var(--apinox-badge-foreground)",
                    borderRadius: 3,
                    fontSize: "0.9em",
                  }}
                >
                  <span>{element}</span>
                  <button
                    onClick={() => {
                      const newElements = [
                        ...(config.ui?.autoFoldElements || []),
                      ];
                      newElements.splice(idx, 1);
                      onChange("ui", "autoFoldElements", newElements);
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "inherit",
                      cursor: "pointer",
                      padding: 0,
                      fontSize: "1.1em",
                      lineHeight: 1,
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <Input
                type="text"
                placeholder="Element name (e.g., Security)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const input = e.target as HTMLInputElement;
                    const value = input.value.trim();
                    if (
                      value &&
                      !(config.ui?.autoFoldElements || []).includes(value)
                    ) {
                      onChange("ui", "autoFoldElements", [
                        ...(config.ui?.autoFoldElements || []),
                        value,
                      ]);
                      input.value = "";
                    }
                  }
                }}
                style={{ flex: 1 }}
              />
            </div>
          </FormGroup>

          <FormGroup>
            <Label>Settings Location</Label>
            <span style={{ fontSize: "0.85em" }}>
              {configDir || tauriConfigDir || "Unknown"}
            </span>
          </FormGroup>
        </div>

        {/* Right Column: Network */}
        <div style={{ flex: 1 }}>
          <SectionHeader style={{ marginTop: 0 }}>Network</SectionHeader>
          <FormGroup>
            <Label>Default Timeout (seconds)</Label>
            <Input
              type="number"
              value={config.network?.defaultTimeout ?? 30}
              onChange={(e) =>
                onChange("network", "defaultTimeout", parseInt(e.target.value))
              }
            />
          </FormGroup>
          <FormGroup>
            <Label>Proxy URL (Optional)</Label>
            <Input
              type="text"
              placeholder="http://127.0.0.1:8080"
              value={config.network?.proxy ?? ""}
              onChange={(e) => onChange("network", "proxy", e.target.value)}
            />
          </FormGroup>
          <FormGroup>
            <CheckboxLabel>
              <input
                type="checkbox"
                checked={config.network?.strictSSL ?? true}
                onChange={(e) =>
                  onChange("network", "strictSSL", e.target.checked)
                }
              />
              Strict SSL (Verify Certificates)
            </CheckboxLabel>
          </FormGroup>

          {/* Proxy rules editor temporarily disabled during proxy feature removal */}
        </div>
      </div>
    </ScrollableForm>
  );
};
