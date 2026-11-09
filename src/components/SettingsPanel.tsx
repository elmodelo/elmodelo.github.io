import type { Language } from '../hooks/useLanguage';
import type { Theme } from '../hooks/useTheme';
import type { LocaleMessages } from '../locales/types';

interface SettingsPanelProps {
  messages: LocaleMessages;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (language: Language) => void;
}

interface OptionGroupProps<T extends string> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

function OptionGroup<T extends string>({ legend, name, value, options, onChange }: OptionGroupProps<T>) {
  return (
    <fieldset className="settings-group">
      <legend>{legend}</legend>
      {options.map((option) => (
        <label className="settings-option" key={option.value}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export default function SettingsPanel({
  messages,
  theme,
  onThemeChange,
  onLanguageChange,
}: SettingsPanelProps) {
  return (
    <section className="dashboard-panel" aria-labelledby="settings-title">
      <h1 id="settings-title">{messages.settings}</h1>
      <div className="panel-scroll" tabIndex={0} role="region" aria-labelledby="settings-title">
        <OptionGroup
          legend={messages.theme}
          name="theme"
          value={theme}
          options={[
            { value: 'light', label: messages.themeLight },
            { value: 'dark', label: messages.themeDark },
          ]}
          onChange={onThemeChange}
        />
        <OptionGroup
          legend={messages.languageSetting}
          name="language"
          value={messages.language}
          options={[
            { value: 'en', label: 'English' },
            { value: 'es', label: 'Español' },
          ]}
          onChange={onLanguageChange}
        />
      </div>
    </section>
  );
}
